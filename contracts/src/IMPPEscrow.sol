// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

/// @title IMPPEscrow
/// @notice Interface for the MPP Escrow contract, which holds collateral
///         deposits for the stake payment intent defined by the Machine
///         Payments Protocol (MPP).
interface IMPPEscrow {
    /// @notice Full state of a single escrow, keyed by a unique 32-byte stake key.
    struct Escrow {
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
        bytes32 indexed key,
        address indexed payer,
        address beneficiary,
        address counterparty,
        address token,
        uint256 amount
    );

    /// @notice Emitted when an escrow is refunded to the beneficiary.
    event EscrowRefunded(
        bytes32 indexed key, address indexed payer, address indexed beneficiary, address token, uint256 amount
    );

    /// @notice Emitted when an escrow is slashed and tokens are sent to the counterparty.
    event EscrowSlashed(
        bytes32 indexed key, address indexed beneficiary, address indexed counterparty, address token, uint256 amount
    );

    /// @notice Emitted when a refund delegate is added or removed.
    event RefundDelegateUpdated(address indexed counterparty, address indexed delegate, bool authorized);

    /// @notice Emitted when a slash delegate is added or removed.
    event SlashDelegateUpdated(address indexed counterparty, address indexed delegate, bool authorized);

    // ─── Errors ──────────────────────────────────────────────────────────

    /// @notice An escrow with this key already exists.
    error MPPEscrow__EscrowAlreadyExists();

    /// @notice The escrow referenced by the given key is not active.
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
    /// @param key        Unique 32-byte stake key binding this escrow to an MPP challenge.
    /// @param counterparty Address authorized to refund or slash this escrow.
    /// @param beneficiary  Address that receives tokens on refund. Zero defaults to payer.
    /// @param token      ERC-20 token to escrow (must be whitelisted).
    /// @param amount     Amount of tokens to lock, in base units.
    function createEscrow(bytes32 key, address counterparty, address beneficiary, address token, uint256 amount)
        external;

    /// @notice Refund an active escrow, returning tokens to the beneficiary.
    ///         Callable by the counterparty or an authorized refund delegate.
    /// @param key Stake key identifying the escrow to refund.
    function refundEscrow(bytes32 key) external;

    /// @notice Slash an active escrow, sending tokens to the counterparty as a penalty.
    ///         Callable by the counterparty or an authorized slash delegate.
    /// @param key Stake key identifying the escrow to slash.
    function slashEscrow(bytes32 key) external;

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

    /// @notice Return the full escrow record for a given stake key.
    ///         Returns a zero-initialized struct if no escrow exists.
    /// @param key Stake key to look up.
    function getEscrow(bytes32 key) external view returns (Escrow memory);

    /// @notice Check whether an active escrow exists for the given key and payer.
    /// @param key   Stake key to check.
    /// @param payer Expected payer address.
    /// @return True if an active escrow exists with a matching payer.
    function isEscrowActive(bytes32 key, address payer) external view returns (bool);

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
