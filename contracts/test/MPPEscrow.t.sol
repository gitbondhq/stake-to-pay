// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import "forge-std/Test.sol";
import {IMPPEscrow} from "../src/IMPPEscrow.sol";
import {MPPEscrow} from "../src/MPPEscrow.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract MockUSDToken is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockUSDPermitToken is ERC20Permit {
    constructor() ERC20("Mock USDC Permit", "mUSDCp") ERC20Permit("Mock USDC Permit") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MPPEscrowTest is Test {
    MPPEscrow public escrow;
    MockUSDToken public token;
    MockUSDPermitToken public permitToken;

    address payer = makeAddr("payer");
    address beneficiary = makeAddr("beneficiary");
    address counterparty = makeAddr("counterparty");
    address refundDelegate = makeAddr("refundDelegate");
    address slashDelegate = makeAddr("slashDelegate");
    address nobody = makeAddr("nobody");

    bytes32 constant KEY = keccak256("test-escrow-1");
    uint256 constant AMOUNT = 100_000;

    function setUp() public {
        token = new MockUSDToken();
        permitToken = new MockUSDPermitToken();

        address[] memory whitelisted = new address[](2);
        whitelisted[0] = address(token);
        whitelisted[1] = address(permitToken);
        escrow = new MPPEscrow(whitelisted);

        // Fund payer
        token.mint(payer, 1_000_000);
        permitToken.mint(payer, 1_000_000);

        // Approve escrow
        vm.startPrank(payer);
        token.approve(address(escrow), type(uint256).max);
        permitToken.approve(address(escrow), type(uint256).max);
        vm.stopPrank();
    }

    // ─── Constructor ─────────────────────────────────────────────────────

    function test_constructor_whitelistsTokens() public view {
        assertTrue(escrow.tokenWhitelist(address(token)));
        assertTrue(escrow.tokenWhitelist(address(permitToken)));
    }

    // ─── Create Escrow ───────────────────────────────────────────────────

    function test_createEscrow_success() public {
        vm.prank(payer);
        escrow.createEscrow(KEY, counterparty, beneficiary, address(token), AMOUNT);

        IMPPEscrow.Escrow memory e = escrow.getEscrow(KEY);
        assertEq(e.payer, payer);
        assertEq(e.beneficiary, beneficiary);
        assertEq(e.counterparty, counterparty);
        assertEq(e.token, address(token));
        assertEq(e.principal, AMOUNT);
        assertTrue(e.isActive);
        assertEq(e.depositedAt, block.timestamp);
    }

    function test_createEscrow_updatesBalances() public {
        uint256 payerBefore = token.balanceOf(payer);

        vm.prank(payer);
        escrow.createEscrow(KEY, counterparty, beneficiary, address(token), AMOUNT);

        assertEq(token.balanceOf(payer), payerBefore - AMOUNT);
        assertEq(token.balanceOf(address(escrow)), AMOUNT);
        assertEq(escrow.totalEscrowed(), AMOUNT);
        assertEq(escrow.totalEscrowedByToken(address(token)), AMOUNT);
    }

    function test_createEscrow_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit IMPPEscrow.EscrowCreated(KEY, payer, beneficiary, counterparty, address(token), AMOUNT);

        vm.prank(payer);
        escrow.createEscrow(KEY, counterparty, beneficiary, address(token), AMOUNT);
    }

    function test_createEscrow_revertsDuplicate() public {
        vm.prank(payer);
        escrow.createEscrow(KEY, counterparty, beneficiary, address(token), AMOUNT);

        vm.expectRevert(IMPPEscrow.MPPEscrow__EscrowAlreadyExists.selector);
        vm.prank(payer);
        escrow.createEscrow(KEY, counterparty, beneficiary, address(token), AMOUNT);
    }

    function test_createEscrow_revertsZeroAmount() public {
        vm.expectRevert(IMPPEscrow.MPPEscrow__InvalidAmount.selector);
        vm.prank(payer);
        escrow.createEscrow(KEY, counterparty, beneficiary, address(token), 0);
    }

    function test_createEscrow_revertsZeroAddresses() public {
        vm.expectRevert(IMPPEscrow.MPPEscrow__InvalidAddress.selector);
        vm.prank(payer);
        escrow.createEscrow(KEY, address(0), beneficiary, address(token), AMOUNT);
    }

    function test_createEscrow_revertsUnwhitelistedToken() public {
        address badToken = makeAddr("badToken");
        vm.expectRevert(abi.encodeWithSelector(IMPPEscrow.MPPEscrow__TokenNotWhitelisted.selector, badToken));
        vm.prank(payer);
        escrow.createEscrow(KEY, counterparty, beneficiary, badToken, AMOUNT);
    }

    // ─── Create Escrow with Permit ───────────────────────────────────────

    function test_createEscrowWithPermit_success() public {
        (address permitPayer, uint256 permitPayerPk) = makeAddrAndKey("permitPayer");
        permitToken.mint(permitPayer, AMOUNT);

        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _getPermitDigest(
            address(permitToken), permitPayer, address(escrow), AMOUNT, permitToken.nonces(permitPayer), deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(permitPayerPk, digest);

        IMPPEscrow.PermitParams memory permit_ = IMPPEscrow.PermitParams(deadline, v, r, s);

        vm.prank(permitPayer);
        escrow.createEscrowWithPermit(
            KEY, permitPayer, counterparty, beneficiary, address(permitToken), AMOUNT, permit_
        );

        IMPPEscrow.Escrow memory e = escrow.getEscrow(KEY);
        assertEq(e.payer, permitPayer);
        assertTrue(e.isActive);
        assertEq(permitToken.balanceOf(address(escrow)), AMOUNT);
    }

    function test_createEscrowWithPermit_revertsIfPayerIsNotCaller() public {
        (address permitPayer, uint256 permitPayerPk) = makeAddrAndKey("permitPayer");
        permitToken.mint(permitPayer, AMOUNT);

        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _getPermitDigest(
            address(permitToken), permitPayer, address(escrow), AMOUNT, permitToken.nonces(permitPayer), deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(permitPayerPk, digest);

        IMPPEscrow.PermitParams memory permit_ = IMPPEscrow.PermitParams(deadline, v, r, s);

        vm.expectRevert(IMPPEscrow.MPPEscrow__PayerMustBeCaller.selector);
        vm.prank(payer);
        escrow.createEscrowWithPermit(
            KEY, permitPayer, counterparty, beneficiary, address(permitToken), AMOUNT, permit_
        );
    }

    function test_createEscrow_defaultsZeroBeneficiaryToPayer() public {
        vm.prank(payer);
        escrow.createEscrow(KEY, counterparty, address(0), address(token), AMOUNT);

        IMPPEscrow.Escrow memory e = escrow.getEscrow(KEY);
        assertEq(e.beneficiary, payer);
    }

    // ─── Refund ──────────────────────────────────────────────────────────

    function test_refundEscrow_byCounterparty() public {
        _createTestEscrow();

        uint256 beneficiaryBefore = token.balanceOf(beneficiary);

        vm.prank(counterparty);
        escrow.refundEscrow(KEY);

        IMPPEscrow.Escrow memory e = escrow.getEscrow(KEY);
        assertFalse(e.isActive);
        assertEq(token.balanceOf(beneficiary), beneficiaryBefore + AMOUNT);
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(escrow.totalEscrowed(), 0);
    }

    function test_refundEscrow_byDelegate() public {
        _createTestEscrow();

        vm.prank(counterparty);
        escrow.addRefundDelegate(refundDelegate);

        vm.prank(refundDelegate);
        escrow.refundEscrow(KEY);

        assertFalse(escrow.getEscrow(KEY).isActive);
        assertEq(token.balanceOf(beneficiary), AMOUNT);
    }

    function test_refundEscrow_revertsUnauthorized() public {
        _createTestEscrow();

        vm.expectRevert(IMPPEscrow.MPPEscrow__NotAuthorized.selector);
        vm.prank(nobody);
        escrow.refundEscrow(KEY);
    }

    function test_refundEscrow_revertsSlashDelegateCannotRefund() public {
        _createTestEscrow();

        vm.prank(counterparty);
        escrow.addSlashDelegate(slashDelegate);

        vm.expectRevert(IMPPEscrow.MPPEscrow__NotAuthorized.selector);
        vm.prank(slashDelegate);
        escrow.refundEscrow(KEY);
    }

    function test_refundEscrow_revertsNotActive() public {
        _createTestEscrow();

        vm.prank(counterparty);
        escrow.refundEscrow(KEY);

        vm.expectRevert(IMPPEscrow.MPPEscrow__EscrowNotActive.selector);
        vm.prank(counterparty);
        escrow.refundEscrow(KEY);
    }

    function test_refundEscrow_emitsEvent() public {
        _createTestEscrow();

        vm.expectEmit(true, true, true, true);
        emit IMPPEscrow.EscrowRefunded(KEY, payer, beneficiary, address(token), AMOUNT);

        vm.prank(counterparty);
        escrow.refundEscrow(KEY);
    }

    // ─── Slash ───────────────────────────────────────────────────────────

    function test_slashEscrow_byCounterparty() public {
        _createTestEscrow();

        uint256 counterpartyBefore = token.balanceOf(counterparty);

        vm.prank(counterparty);
        escrow.slashEscrow(KEY);

        IMPPEscrow.Escrow memory e = escrow.getEscrow(KEY);
        assertFalse(e.isActive);
        assertEq(token.balanceOf(counterparty), counterpartyBefore + AMOUNT);
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(escrow.totalEscrowed(), 0);
    }

    function test_slashEscrow_byDelegate() public {
        _createTestEscrow();

        vm.prank(counterparty);
        escrow.addSlashDelegate(slashDelegate);

        vm.prank(slashDelegate);
        escrow.slashEscrow(KEY);

        assertFalse(escrow.getEscrow(KEY).isActive);
        assertEq(token.balanceOf(counterparty), AMOUNT);
    }

    function test_slashEscrow_revertsUnauthorized() public {
        _createTestEscrow();

        vm.expectRevert(IMPPEscrow.MPPEscrow__NotAuthorized.selector);
        vm.prank(nobody);
        escrow.slashEscrow(KEY);
    }

    function test_slashEscrow_revertsRefundDelegateCannotSlash() public {
        _createTestEscrow();

        vm.prank(counterparty);
        escrow.addRefundDelegate(refundDelegate);

        vm.expectRevert(IMPPEscrow.MPPEscrow__NotAuthorized.selector);
        vm.prank(refundDelegate);
        escrow.slashEscrow(KEY);
    }

    function test_slashEscrow_revertsNotActive() public {
        _createTestEscrow();

        vm.prank(counterparty);
        escrow.slashEscrow(KEY);

        vm.expectRevert(IMPPEscrow.MPPEscrow__EscrowNotActive.selector);
        vm.prank(counterparty);
        escrow.slashEscrow(KEY);
    }

    function test_slashEscrow_emitsEvent() public {
        _createTestEscrow();

        vm.expectEmit(true, true, true, true);
        emit IMPPEscrow.EscrowSlashed(KEY, beneficiary, counterparty, address(token), AMOUNT);

        vm.prank(counterparty);
        escrow.slashEscrow(KEY);
    }

    // ─── Delegate management ─────────────────────────────────────────────

    function test_addRefundDelegate() public {
        vm.prank(counterparty);
        escrow.addRefundDelegate(refundDelegate);
        assertTrue(escrow.refundDelegates(counterparty, refundDelegate));
    }

    function test_removeRefundDelegate() public {
        vm.prank(counterparty);
        escrow.addRefundDelegate(refundDelegate);

        vm.prank(counterparty);
        escrow.removeRefundDelegate(refundDelegate);
        assertFalse(escrow.refundDelegates(counterparty, refundDelegate));
    }

    function test_addSlashDelegate() public {
        vm.prank(counterparty);
        escrow.addSlashDelegate(slashDelegate);
        assertTrue(escrow.slashDelegates(counterparty, slashDelegate));
    }

    function test_removeSlashDelegate() public {
        vm.prank(counterparty);
        escrow.addSlashDelegate(slashDelegate);

        vm.prank(counterparty);
        escrow.removeSlashDelegate(slashDelegate);
        assertFalse(escrow.slashDelegates(counterparty, slashDelegate));
    }

    function test_addRefundDelegate_revertsZeroAddress() public {
        vm.expectRevert(IMPPEscrow.MPPEscrow__InvalidAddress.selector);
        vm.prank(counterparty);
        escrow.addRefundDelegate(address(0));
    }

    function test_addSlashDelegate_revertsZeroAddress() public {
        vm.expectRevert(IMPPEscrow.MPPEscrow__InvalidAddress.selector);
        vm.prank(counterparty);
        escrow.addSlashDelegate(address(0));
    }

    function test_delegateEmitsEvents() public {
        vm.expectEmit(true, true, false, true);
        emit IMPPEscrow.RefundDelegateUpdated(counterparty, refundDelegate, true);
        vm.prank(counterparty);
        escrow.addRefundDelegate(refundDelegate);

        vm.expectEmit(true, true, false, true);
        emit IMPPEscrow.SlashDelegateUpdated(counterparty, slashDelegate, true);
        vm.prank(counterparty);
        escrow.addSlashDelegate(slashDelegate);
    }

    // ─── Set counterparty ────────────────────────────────────────────────

    function test_setCounterparty_success() public {
        _createTestEscrow();
        address newCp = makeAddr("newCounterparty");

        vm.prank(counterparty);
        escrow.setCounterparty(KEY, newCp);

        assertEq(escrow.getEscrow(KEY).counterparty, newCp);
    }

    function test_setCounterparty_revertsUnauthorized() public {
        _createTestEscrow();

        vm.expectRevert(IMPPEscrow.MPPEscrow__NotAuthorized.selector);
        vm.prank(nobody);
        escrow.setCounterparty(KEY, makeAddr("newCp"));
    }

    function test_setCounterparty_emitsEvent() public {
        _createTestEscrow();
        address newCp = makeAddr("newCp");

        vm.expectEmit(true, true, true, true);
        emit IMPPEscrow.EscrowCounterpartyUpdated(KEY, counterparty, newCp);

        vm.prank(counterparty);
        escrow.setCounterparty(KEY, newCp);
    }

    // ─── Views ───────────────────────────────────────────────────────────

    function test_isEscrowActive_returnsTrueForMatchingActiveEscrow() public {
        _createTestEscrow();

        assertTrue(escrow.isEscrowActive(KEY, payer));
    }

    function test_isEscrowActive_returnsFalseForWrongPayer() public {
        _createTestEscrow();

        assertFalse(escrow.isEscrowActive(KEY, nobody));
    }

    function test_isEscrowActive_returnsFalseAfterResolution() public {
        _createTestEscrow();

        vm.prank(counterparty);
        escrow.refundEscrow(KEY);

        assertFalse(escrow.isEscrowActive(KEY, payer));
    }

    // ─── Fuzz ────────────────────────────────────────────────────────────

    function testFuzz_createAndRefund(uint32 amount) public {
        vm.assume(amount > 0);

        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(escrow), amount);

        bytes32 key = keccak256(abi.encodePacked("fuzz", amount));

        vm.prank(payer);
        escrow.createEscrow(key, counterparty, beneficiary, address(token), amount);

        uint256 beneficiaryBefore = token.balanceOf(beneficiary);

        vm.prank(counterparty);
        escrow.refundEscrow(key);

        assertEq(token.balanceOf(beneficiary), beneficiaryBefore + amount);
    }

    function testFuzz_createAndSlash(uint32 amount) public {
        vm.assume(amount > 0);

        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(escrow), amount);

        bytes32 key = keccak256(abi.encodePacked("fuzz", amount));

        vm.prank(payer);
        escrow.createEscrow(key, counterparty, beneficiary, address(token), amount);

        uint256 counterpartyBefore = token.balanceOf(counterparty);

        vm.prank(counterparty);
        escrow.slashEscrow(key);

        assertEq(token.balanceOf(counterparty), counterpartyBefore + amount);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    function _createTestEscrow() internal {
        vm.prank(payer);
        escrow.createEscrow(KEY, counterparty, beneficiary, address(token), AMOUNT);
    }

    function _getPermitDigest(
        address token_,
        address owner_,
        address spender,
        uint256 value,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                owner_,
                spender,
                value,
                nonce,
                deadline
            )
        );
        bytes32 domainSeparator = ERC20Permit(token_).DOMAIN_SEPARATOR();
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }
}
