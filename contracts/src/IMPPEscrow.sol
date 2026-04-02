// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

interface IMPPEscrow {
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

    // ─── Events ──────────────────────────────────────────────────────────

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

    // ─── Errors ──────────────────────────────────────────────────────────

    error MPPEscrow__EscrowAlreadyExists();
    error MPPEscrow__EscrowNotActive();
    error MPPEscrow__InvalidAddress();
    error MPPEscrow__InvalidAmount();
    error MPPEscrow__TokenNotWhitelisted(address token);
    error MPPEscrow__NotAuthorized();
    error MPPEscrow__PayerMustBeCaller();

    // ─── Escrow lifecycle ────────────────────────────────────────────────

    function createEscrow(bytes32 key, address counterparty, address beneficiary, address token, uint256 amount)
        external;

    function createEscrowWithPermit(
        bytes32 key,
        address payer,
        address counterparty,
        address beneficiary,
        address token,
        uint256 amount,
        PermitParams calldata permit_
    ) external;

    function refundEscrow(bytes32 key) external;

    function slashEscrow(bytes32 key) external;

    // ─── Delegate management ─────────────────────────────────────────────

    function addRefundDelegate(address delegate) external;
    function removeRefundDelegate(address delegate) external;
    function addSlashDelegate(address delegate) external;
    function removeSlashDelegate(address delegate) external;

    // ─── Counterparty management ─────────────────────────────────────────

    function setCounterparty(bytes32 key, address newCounterparty) external;

    // ─── Views ───────────────────────────────────────────────────────────

    function getEscrow(bytes32 key) external view returns (Escrow memory);
    function tokenWhitelist(address token) external view returns (bool);
    function totalEscrowedByToken(address token) external view returns (uint256);
    function totalEscrowed() external view returns (uint256);
    function refundDelegates(address counterparty, address delegate) external view returns (bool);
    function slashDelegates(address counterparty, address delegate) external view returns (bool);
}
