// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

/// @title IMPPEscrow
/// @notice Interface for the MPP Escrow contract, which holds collateral
///         deposits for the stake payment intent defined by the Machine
///         Payments Protocol (MPP).
interface IMPPEscrow {
    /// @notice Full state of a single escrow record.
    struct Escrow {
        uint256 id;
        bytes32 scope;
        address payer;
        address beneficiary;
        address counterparty;
        address token;
        uint256 principal;
        uint256 depositedAt;
        bool isActive;
    }

    // ─── Events ──────────────────────────────────────────────────────────

    /// @notice Emitted when a new escrow is created and tokens are locked.
    event EscrowCreated(
        uint256 indexed escrowId,
        bytes32 indexed scope,
        address indexed payer,
        address beneficiary,
        address counterparty,
        address token,
        uint256 amount
    );

    /// @notice Emitted when an escrow is refunded to the beneficiary.
    event EscrowRefunded(
        uint256 indexed escrowId,
        bytes32 indexed scope,
        address indexed payer,
        address beneficiary,
        address token,
        uint256 amount
    );

    /// @notice Emitted when an escrow is slashed and tokens are sent to the counterparty.
    event EscrowSlashed(
        uint256 indexed escrowId,
        bytes32 indexed scope,
        address indexed payer,
        address beneficiary,
        address counterparty,
        address token,
        uint256 amount
    );

    /// @notice Emitted when a refund delegate is added or removed.
    event RefundDelegateUpdated(address indexed counterparty, address indexed delegate, bool authorized);

    /// @notice Emitted when a slash delegate is added or removed.
    event SlashDelegateUpdated(address indexed counterparty, address indexed delegate, bool authorized);

    // ─── Errors ──────────────────────────────────────────────────────────

    /// @notice An active escrow already exists for this scope and beneficiary.
    error MPPEscrow__EscrowAlreadyExists();

    /// @notice The escrow referenced by the given id or active lookup is not active.
    error MPPEscrow__EscrowNotActive();

    /// @notice A required address argument is the zero address.
    error MPPEscrow__InvalidAddress();

    /// @notice The escrow amount must be greater than zero.
    error MPPEscrow__InvalidAmount();

    /// @notice The token is not on the contract's whitelist.
    error MPPEscrow__TokenNotWhitelisted(address token);

    /// @notice Caller is not the counterparty or an authorized delegate.
    error MPPEscrow__NotAuthorized();

    // ─── Escrow lifecycle ────────────────────────────────────────────────

    /// @notice Lock tokens in a new escrow using a prior ERC-20 approval.
    /// @param scope      Stable `bytes32` identifier for the protected access surface.
    /// @param counterparty Address authorized to refund or slash this escrow.
    /// @param beneficiary  Address that receives tokens on refund. Zero defaults to payer.
    /// @param token      ERC-20 token to escrow (must be whitelisted).
    /// @param amount     Amount of tokens to lock, in base units.
    /// @return escrowId Contract-assigned id for the created escrow.
    function createEscrow(bytes32 scope, address counterparty, address beneficiary, address token, uint256 amount)
        external
        returns (uint256 escrowId);

    /// @notice Refund an active escrow, returning tokens to the beneficiary.
    ///         Callable by the counterparty or an authorized refund delegate.
    /// @param escrowId Escrow id identifying the escrow to refund.
    function refundEscrow(uint256 escrowId) external;

    /// @notice Slash an active escrow, sending tokens to the counterparty as a penalty.
    ///         Callable by the counterparty or an authorized slash delegate.
    /// @param escrowId Escrow id identifying the escrow to slash.
    function slashEscrow(uint256 escrowId) external;

    // ─── Delegate management ─────────────────────────────────────────────

    /// @notice Authorize a delegate to call refundEscrow on behalf of msg.sender.
    /// @param delegate Address to authorize.
    function addRefundDelegate(address delegate) external;

    /// @notice Revoke a delegate's refund authorization.
    /// @param delegate Address to deauthorize.
    function removeRefundDelegate(address delegate) external;

    /// @notice Authorize a delegate to call slashEscrow on behalf of msg.sender.
    /// @param delegate Address to authorize.
    function addSlashDelegate(address delegate) external;

    /// @notice Revoke a delegate's slash authorization.
    /// @param delegate Address to deauthorize.
    function removeSlashDelegate(address delegate) external;

    // ─── Views ───────────────────────────────────────────────────────────

    /// @notice Return the full escrow record for a given escrow id.
    ///         Returns a zero-initialized struct if no escrow exists.
    /// @param escrowId Escrow id to look up.
    function getEscrow(uint256 escrowId) external view returns (Escrow memory);

    /// @notice Return the active escrow id for a scope and beneficiary.
    /// @param scope Stable scope identifier.
    /// @param beneficiary Beneficiary whose access is being authorized.
    /// @return escrowId Active escrow id, or zero if no active escrow exists.
    function getActiveEscrowId(bytes32 scope, address beneficiary) external view returns (uint256 escrowId);

    /// @notice Check whether an active escrow exists for the given scope and beneficiary.
    /// @param scope Stable scope identifier.
    /// @param beneficiary Beneficiary whose access is being authorized.
    /// @return True if an active escrow exists with a matching beneficiary.
    function isEscrowActive(bytes32 scope, address beneficiary) external view returns (bool);

    /// @notice Return the active escrow record for a scope and beneficiary.
    /// @dev Reverts if no active escrow exists.
    function getActiveEscrow(bytes32 scope, address beneficiary) external view returns (Escrow memory);

    /// @notice Whether a token is on the whitelist.
    function tokenWhitelist(address token) external view returns (bool);

    /// @notice Total tokens currently held in escrow for a given token address.
    function totalEscrowedByToken(address token) external view returns (uint256);

    /// @notice Total value currently held across all escrowed tokens (in base units, not normalized).
    function totalEscrowed() external view returns (uint256);

    /// @notice Whether `delegate` is authorized to refund escrows where `counterparty` is the counterparty.
    function refundDelegates(address counterparty, address delegate) external view returns (bool);

    /// @notice Whether `delegate` is authorized to slash escrows where `counterparty` is the counterparty.
    function slashDelegates(address counterparty, address delegate) external view returns (bool);
}
