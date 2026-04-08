// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IMPPEscrow} from "contracts/src/IMPPEscrow.sol";

/// @title MPPEscrow
/// @notice Reference escrow contract for the MPP stake payment intent.
///         Payers lock whitelisted ERC-20 tokens for a stable access `scope`.
///         The contract assigns each escrow an internal id and maintains a
///         single active escrow per `(scope, beneficiary)`. The counterparty
///         (or its delegates) can later refund or slash the escrow. Override
///         the lifecycle hooks to route deposits into yield protocols, take
///         platform fees, or add custom access control.
contract MPPEscrow is IMPPEscrow {
    using SafeERC20 for IERC20;

    mapping(uint256 => Escrow) internal s_escrows;
    mapping(bytes32 => mapping(address => uint256)) internal s_activeEscrowId;
    // Only whitelist tokens you have reviewed carefully for exact-transfer
    // ERC-20 behavior. Fee-on-transfer, rebasing/share-based, callback-heavy,
    // or otherwise non-standard tokens can break escrow accounting and
    // settlement assumptions in this template.
    mapping(address => bool) public tokenWhitelist;
    mapping(address => uint256) public totalEscrowedByToken;
    uint256 public totalEscrowed;
    uint256 public nextEscrowId = 1;

    /// @dev counterparty => delegate => authorized
    mapping(address => mapping(address => bool)) public refundDelegates;
    /// @dev counterparty => delegate => authorized
    mapping(address => mapping(address => bool)) public slashDelegates;

    modifier onlyRefundAuthorized(uint256 escrowId) {
        Escrow storage escrow = s_escrows[escrowId];
        if (!escrow.isActive) revert MPPEscrow__EscrowNotActive();
        address counterparty = escrow.counterparty;
        if (msg.sender != counterparty && !refundDelegates[counterparty][msg.sender]) {
            revert MPPEscrow__NotAuthorized();
        }
        _;
    }

    modifier onlySlashAuthorized(uint256 escrowId) {
        Escrow storage escrow = s_escrows[escrowId];
        if (!escrow.isActive) revert MPPEscrow__EscrowNotActive();
        address counterparty = escrow.counterparty;
        if (msg.sender != counterparty && !slashDelegates[counterparty][msg.sender]) {
            revert MPPEscrow__NotAuthorized();
        }
        _;
    }

    /// @notice Deploy with an initial set of whitelisted tokens.
    /// @dev    Review each token before whitelisting. Different decimals do not
    ///         break the math if callers use base units correctly, but fee
    ///         mechanics, rebases, callbacks, and other non-standard transfer
    ///         semantics can produce unexpected behavior.
    /// @param _whitelistedTokens Addresses of ERC-20 tokens to whitelist.
    constructor(address[] memory _whitelistedTokens) {
        for (uint256 i = 0; i < _whitelistedTokens.length; i++) {
            tokenWhitelist[_whitelistedTokens[i]] = true;
        }
    }

    // ─── Escrow lifecycle ────────────────────────────────────────────────

    /// @inheritdoc IMPPEscrow
    /// @dev Caller must have approved this contract to spend `amount` of
    ///      `token` beforehand.
    function createEscrow(bytes32 scope, address counterparty, address beneficiary, address token, uint256 amount)
        external
        returns (uint256 escrowId)
    {
        return _createEscrowFrom(msg.sender, scope, counterparty, beneficiary, token, amount);
    }

    /// @inheritdoc IMPPEscrow
    function refundEscrow(uint256 escrowId) external onlyRefundAuthorized(escrowId) {
        Escrow storage e = s_escrows[escrowId];

        e.isActive = false;
        delete s_activeEscrowId[e.scope][e.beneficiary];
        totalEscrowed -= e.principal;
        totalEscrowedByToken[e.token] -= e.principal;

        _beforeRefund(escrowId, e.scope, e.token, e.beneficiary, e.principal);

        IERC20(e.token).safeTransfer(e.beneficiary, e.principal);

        emit EscrowRefunded(escrowId, e.scope, e.payer, e.beneficiary, e.token, e.principal);
    }

    /// @inheritdoc IMPPEscrow
    function slashEscrow(uint256 escrowId) external onlySlashAuthorized(escrowId) {
        Escrow storage e = s_escrows[escrowId];

        e.isActive = false;
        delete s_activeEscrowId[e.scope][e.beneficiary];
        totalEscrowed -= e.principal;
        totalEscrowedByToken[e.token] -= e.principal;

        _beforeSlash(escrowId, e.scope, e.token, e.counterparty, e.principal);

        IERC20(e.token).safeTransfer(e.counterparty, e.principal);

        emit EscrowSlashed(escrowId, e.scope, e.payer, e.beneficiary, e.counterparty, e.token, e.principal);
    }

    // ─── Delegate management ─────────────────────────────────────────────

    /// @inheritdoc IMPPEscrow
    function addRefundDelegate(address delegate) external {
        if (delegate == address(0)) revert MPPEscrow__InvalidAddress();
        refundDelegates[msg.sender][delegate] = true;
        emit RefundDelegateUpdated(msg.sender, delegate, true);
    }

    /// @inheritdoc IMPPEscrow
    function removeRefundDelegate(address delegate) external {
        refundDelegates[msg.sender][delegate] = false;
        emit RefundDelegateUpdated(msg.sender, delegate, false);
    }

    /// @inheritdoc IMPPEscrow
    function addSlashDelegate(address delegate) external {
        if (delegate == address(0)) revert MPPEscrow__InvalidAddress();
        slashDelegates[msg.sender][delegate] = true;
        emit SlashDelegateUpdated(msg.sender, delegate, true);
    }

    /// @inheritdoc IMPPEscrow
    function removeSlashDelegate(address delegate) external {
        slashDelegates[msg.sender][delegate] = false;
        emit SlashDelegateUpdated(msg.sender, delegate, false);
    }

    // ─── Views ───────────────────────────────────────────────────────────

    /// @inheritdoc IMPPEscrow
    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return s_escrows[escrowId];
    }

    /// @inheritdoc IMPPEscrow
    function getActiveEscrowId(bytes32 scope, address beneficiary) external view returns (uint256 escrowId) {
        return s_activeEscrowId[scope][beneficiary];
    }

    /// @inheritdoc IMPPEscrow
    function isEscrowActive(bytes32 scope, address beneficiary) external view returns (bool) {
        uint256 escrowId = s_activeEscrowId[scope][beneficiary];
        if (escrowId == 0) return false;

        Escrow storage escrow = s_escrows[escrowId];
        return escrow.isActive && escrow.scope == scope && escrow.beneficiary == beneficiary;
    }

    /// @inheritdoc IMPPEscrow
    function getActiveEscrow(bytes32 scope, address beneficiary) external view returns (Escrow memory) {
        uint256 escrowId = s_activeEscrowId[scope][beneficiary];
        Escrow memory escrow = s_escrows[escrowId];
        if (!escrow.isActive || escrow.scope != scope || escrow.beneficiary != beneficiary) {
            revert MPPEscrow__EscrowNotActive();
        }

        return escrow;
    }

    // ─── Hooks ───────────────────────────────────────────────────────────
    // Override these in a derived contract to add custom lifecycle behavior.
    // Examples: route deposits to a yield protocol, take fees on slash,
    // withdraw from a vault before disbursing, add access control, etc.

    /// @notice Called after funds have been pulled from the payer and the
    ///         escrow record is written. Use this to route deposited funds
    ///         elsewhere (e.g. supply to a lending pool).
    function _afterDeposit(uint256 escrowId, bytes32 scope, address token, uint256 amount) internal {
        // no-op by default
    }

    /// @notice Called before the refund transfer. Use this to withdraw funds
    ///         from an external protocol, deduct fees, etc.
    function _beforeRefund(uint256 escrowId, bytes32 scope, address token, address beneficiary, uint256 amount)
        internal
    {
        // no-op by default
    }

    /// @notice Called before the slash transfer. Use this to withdraw funds
    ///         from an external protocol, take a platform cut, etc.
    function _beforeSlash(uint256 escrowId, bytes32 scope, address token, address counterparty, uint256 amount)
        internal
    {
        // no-op by default
    }

    // ─── Internal ────────────────────────────────────────────────────────

    /// @dev Shared implementation for createEscrow.
    function _createEscrowFrom(
        address payer,
        bytes32 scope,
        address counterparty,
        address beneficiary,
        address token,
        uint256 amount
    ) internal returns (uint256 escrowId) {
        address resolvedBeneficiary = beneficiary == address(0) ? payer : beneficiary;

        if (payer == address(0) || counterparty == address(0) || token == address(0)) {
            revert MPPEscrow__InvalidAddress();
        }
        if (amount == 0) revert MPPEscrow__InvalidAmount();
        if (!tokenWhitelist[token]) revert MPPEscrow__TokenNotWhitelisted(token);
        if (s_activeEscrowId[scope][resolvedBeneficiary] != 0) revert MPPEscrow__EscrowAlreadyExists();

        escrowId = nextEscrowId++;
        Escrow storage e = s_escrows[escrowId];
        e.id = escrowId;
        e.scope = scope;
        e.payer = payer;
        e.beneficiary = resolvedBeneficiary;
        e.counterparty = counterparty;
        e.token = token;
        e.principal = amount;
        e.depositedAt = block.timestamp;
        e.isActive = true;
        s_activeEscrowId[scope][resolvedBeneficiary] = escrowId;

        totalEscrowed += amount;
        totalEscrowedByToken[token] += amount;

        IERC20(token).safeTransferFrom(payer, address(this), amount);

        _afterDeposit(escrowId, scope, token, amount);

        emit EscrowCreated(escrowId, scope, payer, resolvedBeneficiary, counterparty, token, amount);
    }
}
