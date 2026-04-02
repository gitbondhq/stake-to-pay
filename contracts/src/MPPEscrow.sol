// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";

contract MPPEscrow {
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

    address public constant USDC_E = 0x20C000000000000000000000b9537d11c60E8b50;

    mapping(bytes32 => Escrow) internal s_escrows;
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
    error MPPEscrow__TokenTransferFailed(address token);
    error MPPEscrow__NotAuthorized();

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
        _createEscrowFrom(payer, key, counterparty, beneficiary, token, amount, true, permit_);
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

        ITIP20(e.token).transferWithMemo(e.beneficiary, e.principal, key);

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

        ITIP20(e.token).transferWithMemo(e.counterparty, e.principal, key);

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
        if (payer == address(0) || counterparty == address(0) || beneficiary == address(0) || token == address(0)) {
            revert MPPEscrow__InvalidAddress();
        }
        if (amount == 0) revert MPPEscrow__InvalidAmount();
        if (!tokenWhitelist[token]) revert MPPEscrow__TokenNotWhitelisted(token);

        Escrow storage e = s_escrows[key];
        e.payer = payer;
        e.beneficiary = beneficiary;
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

        if (!ITIP20(token).transferFromWithMemo(payer, address(this), amount, key)) {
            revert MPPEscrow__TokenTransferFailed(token);
        }

        _afterDeposit(key, token, amount);

        emit EscrowCreated(key, payer, beneficiary, counterparty, token, amount);
    }
}
