// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IMPPEscrow} from "../src/IMPPEscrow.sol";
import {MPPEscrow} from "../src/MPPEscrow.sol";

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
    address beneficiaryTwo = makeAddr("beneficiaryTwo");
    address counterparty = makeAddr("counterparty");
    address refundDelegate = makeAddr("refundDelegate");
    address slashDelegate = makeAddr("slashDelegate");
    address nobody = makeAddr("nobody");

    bytes32 constant SCOPE = keccak256("document:test");
    bytes32 constant OTHER_SCOPE = keccak256("document:other");
    uint256 constant AMOUNT = 100_000;

    function setUp() public {
        token = new MockUSDToken();

        address[] memory whitelisted = new address[](1);
        whitelisted[0] = address(token);
        escrow = new MPPEscrow(whitelisted);

        token.mint(payer, 1_000_000);

        vm.startPrank(payer);
        token.approve(address(escrow), type(uint256).max);
        vm.stopPrank();
    }

    function test_constructor_whitelistsTokens() public view {
        assertTrue(escrow.tokenWhitelist(address(token)));
    }

    function test_createEscrow_success() public {
        vm.prank(payer);
        uint256 escrowId = escrow.createEscrow(SCOPE, counterparty, beneficiary, address(token), AMOUNT);

        IMPPEscrow.Escrow memory e = escrow.getEscrow(escrowId);
        assertEq(escrowId, 1);
        assertEq(e.id, escrowId);
        assertEq(e.scope, SCOPE);
        assertEq(e.payer, payer);
        assertEq(e.beneficiary, beneficiary);
        assertEq(e.counterparty, counterparty);
        assertEq(e.token, address(token));
        assertEq(e.principal, AMOUNT);
        assertEq(e.depositedAt, block.timestamp);
        assertTrue(e.isActive);
        assertEq(escrow.getActiveEscrowId(SCOPE, beneficiary), escrowId);
        assertEq(escrow.nextEscrowId(), 2);
    }

    function test_createEscrow_updatesBalances() public {
        uint256 payerBefore = token.balanceOf(payer);

        vm.prank(payer);
        escrow.createEscrow(SCOPE, counterparty, beneficiary, address(token), AMOUNT);

        assertEq(token.balanceOf(payer), payerBefore - AMOUNT);
        assertEq(token.balanceOf(address(escrow)), AMOUNT);
        assertEq(escrow.totalEscrowed(), AMOUNT);
        assertEq(escrow.totalEscrowedByToken(address(token)), AMOUNT);
    }

    function test_createEscrow_emitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit IMPPEscrow.EscrowCreated(1, SCOPE, payer, beneficiary, counterparty, address(token), AMOUNT);

        vm.prank(payer);
        escrow.createEscrow(SCOPE, counterparty, beneficiary, address(token), AMOUNT);
    }

    function test_createEscrow_revertsDuplicateActiveScopeBeneficiary() public {
        vm.prank(payer);
        escrow.createEscrow(SCOPE, counterparty, beneficiary, address(token), AMOUNT);

        vm.expectRevert(IMPPEscrow.MPPEscrow__EscrowAlreadyExists.selector);
        vm.prank(payer);
        escrow.createEscrow(SCOPE, counterparty, beneficiary, address(token), AMOUNT);
    }

    function test_createEscrow_allowsSameScopeForDifferentBeneficiary() public {
        vm.startPrank(payer);
        uint256 firstEscrowId = escrow.createEscrow(SCOPE, counterparty, beneficiary, address(token), AMOUNT);
        uint256 secondEscrowId = escrow.createEscrow(SCOPE, counterparty, beneficiaryTwo, address(token), AMOUNT);
        vm.stopPrank();

        assertEq(firstEscrowId, 1);
        assertEq(secondEscrowId, 2);
        assertEq(escrow.getActiveEscrowId(SCOPE, beneficiary), firstEscrowId);
        assertEq(escrow.getActiveEscrowId(SCOPE, beneficiaryTwo), secondEscrowId);
    }

    function test_createEscrow_revertsZeroAmount() public {
        vm.expectRevert(IMPPEscrow.MPPEscrow__InvalidAmount.selector);
        vm.prank(payer);
        escrow.createEscrow(SCOPE, counterparty, beneficiary, address(token), 0);
    }

    function test_createEscrow_revertsZeroAddresses() public {
        vm.expectRevert(IMPPEscrow.MPPEscrow__InvalidAddress.selector);
        vm.prank(payer);
        escrow.createEscrow(SCOPE, address(0), beneficiary, address(token), AMOUNT);
    }

    function test_createEscrow_revertsUnwhitelistedToken() public {
        address badToken = makeAddr("badToken");
        vm.expectRevert(abi.encodeWithSelector(IMPPEscrow.MPPEscrow__TokenNotWhitelisted.selector, badToken));
        vm.prank(payer);
        escrow.createEscrow(SCOPE, counterparty, beneficiary, badToken, AMOUNT);
    }

    function test_createEscrow_defaultsZeroBeneficiaryToPayer() public {
        vm.prank(payer);
        uint256 escrowId = escrow.createEscrow(SCOPE, counterparty, address(0), address(token), AMOUNT);

        IMPPEscrow.Escrow memory e = escrow.getEscrow(escrowId);
        assertEq(e.beneficiary, payer);
        assertEq(escrow.getActiveEscrowId(SCOPE, payer), escrowId);
    }

    function test_refundEscrow_byCounterparty() public {
        uint256 escrowId = _createTestEscrow();
        uint256 beneficiaryBefore = token.balanceOf(beneficiary);

        vm.prank(counterparty);
        escrow.refundEscrow(escrowId);

        IMPPEscrow.Escrow memory e = escrow.getEscrow(escrowId);
        assertFalse(e.isActive);
        assertEq(token.balanceOf(beneficiary), beneficiaryBefore + AMOUNT);
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(escrow.totalEscrowed(), 0);
        assertEq(escrow.getActiveEscrowId(SCOPE, beneficiary), 0);
    }

    function test_refundEscrow_byDelegate() public {
        uint256 escrowId = _createTestEscrow();

        vm.prank(counterparty);
        escrow.addRefundDelegate(refundDelegate);

        vm.prank(refundDelegate);
        escrow.refundEscrow(escrowId);

        assertFalse(escrow.getEscrow(escrowId).isActive);
        assertEq(token.balanceOf(beneficiary), AMOUNT);
    }

    function test_refundEscrow_revertsUnauthorized() public {
        uint256 escrowId = _createTestEscrow();

        vm.expectRevert(IMPPEscrow.MPPEscrow__NotAuthorized.selector);
        vm.prank(nobody);
        escrow.refundEscrow(escrowId);
    }

    function test_refundEscrow_revertsSlashDelegateCannotRefund() public {
        uint256 escrowId = _createTestEscrow();

        vm.prank(counterparty);
        escrow.addSlashDelegate(slashDelegate);

        vm.expectRevert(IMPPEscrow.MPPEscrow__NotAuthorized.selector);
        vm.prank(slashDelegate);
        escrow.refundEscrow(escrowId);
    }

    function test_refundEscrow_revertsNotActive() public {
        uint256 escrowId = _createTestEscrow();

        vm.prank(counterparty);
        escrow.refundEscrow(escrowId);

        vm.expectRevert(IMPPEscrow.MPPEscrow__EscrowNotActive.selector);
        vm.prank(counterparty);
        escrow.refundEscrow(escrowId);
    }

    function test_refundEscrow_emitsEvent() public {
        uint256 escrowId = _createTestEscrow();

        vm.expectEmit(true, true, true, true);
        emit IMPPEscrow.EscrowRefunded(escrowId, SCOPE, payer, beneficiary, address(token), AMOUNT);

        vm.prank(counterparty);
        escrow.refundEscrow(escrowId);
    }

    function test_slashEscrow_byCounterparty() public {
        uint256 escrowId = _createTestEscrow();
        uint256 counterpartyBefore = token.balanceOf(counterparty);

        vm.prank(counterparty);
        escrow.slashEscrow(escrowId);

        IMPPEscrow.Escrow memory e = escrow.getEscrow(escrowId);
        assertFalse(e.isActive);
        assertEq(token.balanceOf(counterparty), counterpartyBefore + AMOUNT);
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(escrow.totalEscrowed(), 0);
        assertEq(escrow.getActiveEscrowId(SCOPE, beneficiary), 0);
    }

    function test_slashEscrow_byDelegate() public {
        uint256 escrowId = _createTestEscrow();

        vm.prank(counterparty);
        escrow.addSlashDelegate(slashDelegate);

        vm.prank(slashDelegate);
        escrow.slashEscrow(escrowId);

        assertFalse(escrow.getEscrow(escrowId).isActive);
        assertEq(token.balanceOf(counterparty), AMOUNT);
    }

    function test_slashEscrow_revertsUnauthorized() public {
        uint256 escrowId = _createTestEscrow();

        vm.expectRevert(IMPPEscrow.MPPEscrow__NotAuthorized.selector);
        vm.prank(nobody);
        escrow.slashEscrow(escrowId);
    }

    function test_slashEscrow_revertsRefundDelegateCannotSlash() public {
        uint256 escrowId = _createTestEscrow();

        vm.prank(counterparty);
        escrow.addRefundDelegate(refundDelegate);

        vm.expectRevert(IMPPEscrow.MPPEscrow__NotAuthorized.selector);
        vm.prank(refundDelegate);
        escrow.slashEscrow(escrowId);
    }

    function test_slashEscrow_revertsNotActive() public {
        uint256 escrowId = _createTestEscrow();

        vm.prank(counterparty);
        escrow.slashEscrow(escrowId);

        vm.expectRevert(IMPPEscrow.MPPEscrow__EscrowNotActive.selector);
        vm.prank(counterparty);
        escrow.slashEscrow(escrowId);
    }

    function test_slashEscrow_emitsEvent() public {
        uint256 escrowId = _createTestEscrow();

        vm.expectEmit(true, true, true, true);
        emit IMPPEscrow.EscrowSlashed(escrowId, SCOPE, payer, beneficiary, counterparty, address(token), AMOUNT);

        vm.prank(counterparty);
        escrow.slashEscrow(escrowId);
    }

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

    function test_getActiveEscrow_returnsTheCurrentEscrow() public {
        uint256 escrowId = _createTestEscrow();

        IMPPEscrow.Escrow memory e = escrow.getActiveEscrow(SCOPE, beneficiary);
        assertEq(e.id, escrowId);
        assertEq(e.scope, SCOPE);
        assertEq(e.payer, payer);
        assertEq(e.beneficiary, beneficiary);
    }

    function test_isEscrowActive_returnsTrueForMatchingActiveEscrow() public {
        _createTestEscrow();
        assertTrue(escrow.isEscrowActive(SCOPE, beneficiary));
    }

    function test_isEscrowActive_returnsFalseForWrongBeneficiary() public {
        _createTestEscrow();
        assertFalse(escrow.isEscrowActive(SCOPE, nobody));
    }

    function test_isEscrowActive_returnsFalseAfterResolution() public {
        uint256 escrowId = _createTestEscrow();

        vm.prank(counterparty);
        escrow.refundEscrow(escrowId);

        assertFalse(escrow.isEscrowActive(SCOPE, beneficiary));
    }

    function test_createEscrow_allowsRestakingAfterResolution() public {
        uint256 firstEscrowId = _createTestEscrow();

        vm.prank(counterparty);
        escrow.refundEscrow(firstEscrowId);

        vm.prank(payer);
        uint256 secondEscrowId = escrow.createEscrow(SCOPE, counterparty, beneficiary, address(token), AMOUNT);

        assertEq(firstEscrowId, 1);
        assertEq(secondEscrowId, 2);
        assertEq(escrow.getActiveEscrowId(SCOPE, beneficiary), secondEscrowId);
    }

    function testFuzz_createAndRefund(uint32 amount) public {
        vm.assume(amount > 0);

        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(escrow), amount);

        bytes32 scope = keccak256(abi.encodePacked("fuzz-refund", amount));

        vm.prank(payer);
        uint256 escrowId = escrow.createEscrow(scope, counterparty, beneficiary, address(token), amount);

        uint256 beneficiaryBefore = token.balanceOf(beneficiary);

        vm.prank(counterparty);
        escrow.refundEscrow(escrowId);

        assertEq(token.balanceOf(beneficiary), beneficiaryBefore + amount);
    }

    function testFuzz_createAndSlash(uint32 amount) public {
        vm.assume(amount > 0);

        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(escrow), amount);

        bytes32 scope = keccak256(abi.encodePacked("fuzz-slash", amount));

        vm.prank(payer);
        uint256 escrowId = escrow.createEscrow(scope, counterparty, beneficiary, address(token), amount);

        uint256 counterpartyBefore = token.balanceOf(counterparty);

        vm.prank(counterparty);
        escrow.slashEscrow(escrowId);

        assertEq(token.balanceOf(counterparty), counterpartyBefore + amount);
    }

    function test_createEscrow_supportsMultipleScopesForSameBeneficiary() public {
        vm.startPrank(payer);
        uint256 firstEscrowId = escrow.createEscrow(SCOPE, counterparty, beneficiary, address(token), AMOUNT);
        uint256 secondEscrowId = escrow.createEscrow(OTHER_SCOPE, counterparty, beneficiary, address(token), AMOUNT);
        vm.stopPrank();

        assertEq(firstEscrowId, 1);
        assertEq(secondEscrowId, 2);
        assertEq(escrow.getActiveEscrowId(SCOPE, beneficiary), firstEscrowId);
        assertEq(escrow.getActiveEscrowId(OTHER_SCOPE, beneficiary), secondEscrowId);
    }

    function _createTestEscrow() internal returns (uint256 escrowId) {
        vm.prank(payer);
        escrowId = escrow.createEscrow(SCOPE, counterparty, beneficiary, address(token), AMOUNT);
    }
}
