// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MPPEscrow {
    using SafeERC20 for IERC20;
    struct Escrow {
        address payer;
        address beneficiary;
        address counterparty;
        address token;
        uint256 principal;
        uint256 depositedAt;
        bool isActive;
    }

    struct PermitParams {
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    mapping(bytes32 => Escrow) internal s_escrows;
    // Template safety note:
    // Only whitelist tokens you have reviewed carefully for exact-transfer
    // ERC20 behavior. Fee-on-transfer, rebasing/share-based, callback-heavy,
    // or otherwise non-standard tokens can break escrow accounting and
    // settlement assumptions in this template.
    mapping(address => bool) public tokenWhitelist;
    mapping(address => uint256) public totalEscrowedByToken;
    uint256 public totalEscrowed;

    // counterparty => delegate => authorized
    mapping(address => mapping(address => bool)) public refundDelegates;
    mapping(address => mapping(address => bool)) public slashDelegates;

    event EscrowCreated(
        bytes32 indexed key,
        address indexed payer,
        address beneficiary,
        address counterparty,
        address token,
        uint256 amount
    );

    event EscrowRefunded(
        bytes32 indexed key, address indexed payer, address indexed beneficiary, address token, uint256 amount
    );

    event EscrowSlashed(
        bytes32 indexed key, address indexed beneficiary, address indexed counterparty, address token, uint256 amount
    );

    event EscrowCounterpartyUpdated(
        bytes32 indexed key, address indexed previousCounterparty, address indexed newCounterparty
    );

    event RefundDelegateUpdated(address indexed counterparty, address indexed delegate, bool authorized);
    event SlashDelegateUpdated(address indexed counterparty, address indexed delegate, bool authorized);

    error MPPEscrow__EscrowAlreadyExists();
    error MPPEscrow__EscrowNotActive();
    error MPPEscrow__InvalidAddress();
    error MPPEscrow__InvalidAmount();
    error MPPEscrow__TokenNotWhitelisted(address token);
    error MPPEscrow__NotAuthorized();
    error MPPEscrow__PayerMustBeCaller();

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

    constructor(address[] memory _whitelistedTokens) {
        // Review each token before whitelisting. Different decimals do not
        // break the math by themselves if all callers use base units
        // correctly, but fee mechanics, rebases, callbacks, and other
        // non-standard transfer semantics can produce unexpected behavior.
        for (uint256 i = 0; i < _whitelistedTokens.length; i++) {
            tokenWhitelist[_whitelistedTokens[i]] = true;
        }
    }

    // ─── Escrow lifecycle ────────────────────────────────────────────────

    function createEscrow(bytes32 key, address counterparty, address beneficiary, address token, uint256 amount)
        external
    {
        PermitParams memory permit_;
        _createEscrowFrom(msg.sender, key, counterparty, beneficiary, token, amount, false, permit_);
    }

    function createEscrowWithPermit(
        bytes32 key,
        address payer,
        address counterparty,
        address beneficiary,
        address token,
        uint256 amount,
        PermitParams calldata permit_
    ) external {
        // Security note:
        // ERC-2612 permit only authorizes this contract to spend `amount`
        // from `payer`. It does not authorize the escrow terms (`key`,
        // `counterparty`, `beneficiary`).
        //
        // If this function allowed third-party relayers, anyone who obtained a
        // valid permit signature could submit attacker-chosen escrow terms and
        // redirect the deposited funds. We therefore require the payer to be
        // the caller for now.
        //
        // If relayed/gasless creation is needed later, add a second EIP-712
        // signature that binds the full escrow intent (payer, key,
        // counterparty, beneficiary, token, amount, deadline, chainId,
        // contract, nonce), or use a trusted forwarder/meta-tx pattern that
        // verifies those parameters explicitly.
        if (payer != msg.sender) revert MPPEscrow__PayerMustBeCaller();
        _createEscrowFrom(msg.sender, key, counterparty, beneficiary, token, amount, true, permit_);
    }

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

    function addRefundDelegate(address delegate) external {
        if (delegate == address(0)) revert MPPEscrow__InvalidAddress();
        refundDelegates[msg.sender][delegate] = true;
        emit RefundDelegateUpdated(msg.sender, delegate, true);
    }

    function removeRefundDelegate(address delegate) external {
        refundDelegates[msg.sender][delegate] = false;
        emit RefundDelegateUpdated(msg.sender, delegate, false);
    }

    function addSlashDelegate(address delegate) external {
        if (delegate == address(0)) revert MPPEscrow__InvalidAddress();
        slashDelegates[msg.sender][delegate] = true;
        emit SlashDelegateUpdated(msg.sender, delegate, true);
    }

    function removeSlashDelegate(address delegate) external {
        slashDelegates[msg.sender][delegate] = false;
        emit SlashDelegateUpdated(msg.sender, delegate, false);
    }

    // ─── Counterparty management ─────────────────────────────────────────

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

    function getEscrow(bytes32 key) external view returns (Escrow memory) {
        return s_escrows[key];
    }

    // ─── Hooks ───────────────────────────────────────────────────────────
    // Edit these to add custom behavior at each lifecycle stage.
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
