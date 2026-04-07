// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import "forge-std/Test.sol";
import {IMPPEscrow} from "../src/IMPPEscrow.sol";
import {MPPEscrow} from "../src/MPPEscrow.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDToken is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

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

        address[] memory whitelisted = new address[](1);
        whitelisted[0] = address(token);
        escrow = new MPPEscrow(whitelisted);

        // Fund payer
        token.mint(payer, 1_000_000);

        // Approve escrow
        vm.startPrank(payer);
        token.approve(address(escrow), type(uint256).max);
        vm.stopPrank();
    }

    // ─── Constructor ─────────────────────────────────────────────────────

    function test_constructor_whitelistsTokens() public view {
        assertTrue(escrow.tokenWhitelist(address(token)));
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
}
