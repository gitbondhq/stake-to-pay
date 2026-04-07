// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IMPPEscrow} from "contracts/src/IMPPEscrow.sol";

/// @title MPPEscrow
/// @notice Reference escrow contract for the MPP stake payment intent.
///         Payers lock whitelisted ERC-20 tokens under a unique stake key.
///         The counterparty (or its delegates) can later refund or slash the
///         escrow. Override the lifecycle hooks to route deposits into yield
///         protocols, take platform fees, or add custom access control.
contract MPPEscrow is IMPPEscrow {
    using SafeERC20 for IERC20;

    mapping(bytes32 => Escrow) internal s_escrows;
    // Only whitelist tokens you have reviewed carefully for exact-transfer
    // ERC-20 behavior. Fee-on-transfer, rebasing/share-based, callback-heavy,
    // or otherwise non-standard tokens can break escrow accounting and
    // settlement assumptions in this template.
    mapping(address => bool) public tokenWhitelist;
    mapping(address => uint256) public totalEscrowedByToken;
    uint256 public totalEscrowed;

    /// @dev counterparty => delegate => authorized
    mapping(address => mapping(address => bool)) public refundDelegates;
    /// @dev counterparty => delegate => authorized
    mapping(address => mapping(address => bool)) public slashDelegates;

    modifier onlyRefundAuthorized(bytes32 key) {
        address counterparty = s_escrows[key].counterparty;
        if (msg.sender != counterparty && !refundDelegates[counterparty][msg.sender]) {
            revert MPPEscrow__NotAuthorized();
        }
        _;
    }

    modifier onlySlashAuthorized(bytes32 key) {
        address counterparty = s_escrows[key].counterparty;
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
    function createEscrow(bytes32 key, address counterparty, address beneficiary, address token, uint256 amount)
        external
    {
        PermitParams memory permit_;
        _createEscrowFrom(msg.sender, key, counterparty, beneficiary, token, amount, false, permit_);
    }

    /// @inheritdoc IMPPEscrow
    /// @dev ERC-2612 permit only authorizes token spending, not escrow terms
    ///      like the key, counterparty, or beneficiary. Allowing third-party
    ///      relayers would let anyone with a valid permit signature submit
    ///      attacker-chosen escrow terms and redirect funds. If relayed or
    ///      gasless creation is needed, use a witness-bound scheme such as
    ///      Permit2 with witness that signs over the full escrow intent.
    function createEscrowWithPermit(
        bytes32 key,
        address payer,
        address counterparty,
        address beneficiary,
        address token,
        uint256 amount,
        PermitParams calldata permit_
    ) external {
        if (payer != msg.sender) revert MPPEscrow__PayerMustBeCaller();
        _createEscrowFrom(msg.sender, key, counterparty, beneficiary, token, amount, true, permit_);
    }

    /// @inheritdoc IMPPEscrow
    function refundEscrow(bytes32 key) external onlyRefundAuthorized(key) {
        Escrow storage e = s_escrows[key];

        if (!e.isActive) {
            revert MPPEscrow__EscrowNotActive();
        }

        e.isActive = false;
        totalEscrowed -= e.principal;
        totalEscrowedByToken[e.token] -= e.principal;

        _beforeRefund(key, e.token, e.beneficiary, e.principal);

        IERC20(e.token).safeTransfer(e.beneficiary, e.principal);

        emit EscrowRefunded(key, e.payer, e.beneficiary, e.token, e.principal);
    }

    /// @inheritdoc IMPPEscrow
    function slashEscrow(bytes32 key) external onlySlashAuthorized(key) {
        Escrow storage e = s_escrows[key];

        if (!e.isActive) {
            revert MPPEscrow__EscrowNotActive();
        }

        e.isActive = false;
        totalEscrowed -= e.principal;
        totalEscrowedByToken[e.token] -= e.principal;

        _beforeSlash(key, e.token, e.counterparty, e.principal);

        IERC20(e.token).safeTransfer(e.counterparty, e.principal);

        emit EscrowSlashed(key, e.beneficiary, e.counterparty, e.token, e.principal);
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

    // ─── Counterparty management ─────────────────────────────────────────

    /// @inheritdoc IMPPEscrow
    function setCounterparty(bytes32 key, address newCounterparty) external {
        if (newCounterparty == address(0)) revert MPPEscrow__InvalidAddress();

        Escrow storage e = s_escrows[key];
        if (!e.isActive) revert MPPEscrow__EscrowNotActive();
        if (msg.sender != e.counterparty) revert MPPEscrow__NotAuthorized();

        address oldCounterparty = e.counterparty;
        e.counterparty = newCounterparty;
        emit EscrowCounterpartyUpdated(key, oldCounterparty, newCounterparty);
    }

    // ─── Views ───────────────────────────────────────────────────────────

    /// @inheritdoc IMPPEscrow
    function getEscrow(bytes32 key) external view returns (Escrow memory) {
        return s_escrows[key];
    }

    /// @inheritdoc IMPPEscrow
    function isEscrowActive(bytes32 key, address payer) external view returns (bool) {
        Escrow storage escrow = s_escrows[key];
        return escrow.isActive && escrow.payer == payer;
    }

    // ─── Hooks ───────────────────────────────────────────────────────────
    // Override these in a derived contract to add custom lifecycle behavior.
    // Examples: route deposits to a yield protocol, take fees on slash,
    // withdraw from a vault before disbursing, add access control, etc.

    /// @notice Called after funds have been pulled from the payer and the
    ///         escrow record is written. Use this to route deposited funds
    ///         elsewhere (e.g. supply to a lending pool).
    function _afterDeposit(bytes32 key, address token, uint256 amount) internal {
        // no-op by default
    }

    /// @notice Called before the refund transfer. Use this to withdraw funds
    ///         from an external protocol, deduct fees, etc.
    function _beforeRefund(bytes32 key, address token, address beneficiary, uint256 amount) internal {
        // no-op by default
    }

    /// @notice Called before the slash transfer. Use this to withdraw funds
    ///         from an external protocol, take a platform cut, etc.
    function _beforeSlash(bytes32 key, address token, address counterparty, uint256 amount) internal {
        // no-op by default
    }

    // ─── Internal ────────────────────────────────────────────────────────

    /// @dev Shared implementation for both createEscrow and createEscrowWithPermit.
    function _createEscrowFrom(
        address payer,
        bytes32 key,
        address counterparty,
        address beneficiary,
        address token,
        uint256 amount,
        bool usePermit,
        PermitParams memory permit_
    ) internal {
        if (s_escrows[key].isActive) revert MPPEscrow__EscrowAlreadyExists();
        address resolvedBeneficiary = beneficiary == address(0) ? payer : beneficiary;

        if (payer == address(0) || counterparty == address(0) || token == address(0)) {
            revert MPPEscrow__InvalidAddress();
        }
        if (amount == 0) revert MPPEscrow__InvalidAmount();
        if (!tokenWhitelist[token]) revert MPPEscrow__TokenNotWhitelisted(token);

        Escrow storage e = s_escrows[key];
        e.payer = payer;
        e.beneficiary = resolvedBeneficiary;
        e.counterparty = counterparty;
        e.token = token;
        e.principal = amount;
        e.depositedAt = block.timestamp;
        e.isActive = true;

        totalEscrowed += amount;
        totalEscrowedByToken[token] += amount;

        if (usePermit) {
            IERC20Permit(token).permit(payer, address(this), amount, permit_.deadline, permit_.v, permit_.r, permit_.s);
        }

        IERC20(token).safeTransferFrom(payer, address(this), amount);

        _afterDeposit(key, token, amount);

        emit EscrowCreated(key, payer, resolvedBeneficiary, counterparty, token, amount);
    }
}
