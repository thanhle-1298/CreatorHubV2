// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {CreatorHubV2} from "../CreatorHubV2.sol";
import {CreatorHubV2TestBase} from "./CreatorHubV2.Base.t.sol";

/// Arbiter resolution, timeouts, and refund semantics.
contract CreatorHubV2ArbiterTest is CreatorHubV2TestBase {
    uint256 internal cid;
    uint256 internal eid;

    function setUp() public override {
        super.setUp();
        (cid, eid) = _listAndBuy();
        _dispute(buyer, eid);
    }

    function test_Resolve_NonArbiterReverts() public {
        vm.prank(stranger);
        vm.expectRevert(CreatorHubV2.NotArbiter.selector);
        hub.resolveDispute(eid, true);
        vm.prank(owner);
        vm.expectRevert(CreatorHubV2.NotArbiter.selector);
        hub.resolveDispute(eid, false);
    }

    function test_Resolve_RequiresDisputedState() public {
        uint256 id2 = _list(PRICE);
        uint256 e2 = _buy(buyer2, id2); // Held, not disputed
        vm.prank(arbiter);
        vm.expectRevert(CreatorHubV2.InvalidEscrowState.selector);
        hub.resolveDispute(e2, true);
        vm.prank(arbiter);
        vm.expectRevert(CreatorHubV2.EscrowNotFound.selector);
        hub.resolveDispute(99, true);
    }

    function test_Resolve_RefundPaysBuyerFullNoFeeAndRevokesAccess() public {
        vm.expectEmit(true, true, false, true, address(hub));
        emit CreatorHubV2.EscrowRefunded(eid, buyer, PRICE);
        vm.expectEmit(true, true, false, true, address(hub));
        emit CreatorHubV2.DisputeResolved(eid, true, arbiter);
        vm.prank(arbiter);
        hub.resolveDispute(eid, true);

        assertEq(uint8(_status(eid)), uint8(CreatorHubV2.EscrowStatus.Refunded));
        assertEq(hub.pendingWithdrawals(buyer), PRICE);
        assertEq(hub.pendingWithdrawals(creator), 0);
        assertEq(hub.pendingWithdrawals(owner), 0);
        assertFalse(hub.hasPurchased(buyer, cid));
        vm.prank(buyer);
        vm.expectRevert(CreatorHubV2.Unauthorized.selector);
        hub.getContentUrl(cid);

        // refunded purchases cannot be repurchased
        vm.prank(buyer);
        vm.expectRevert(CreatorHubV2.AlreadyPurchased.selector);
        hub.purchaseContent(cid, PRICE);

        uint256 before = usdc.balanceOf(buyer);
        vm.prank(buyer);
        hub.withdraw();
        assertEq(usdc.balanceOf(buyer), before + PRICE);

        (uint256 earnings, uint256 sales,) = hub.getCreatorStats(creator);
        assertEq(earnings, 0);
        assertEq(sales, 0);
    }

    function test_Resolve_ReleasePaysSellerLessFee() public {
        vm.expectEmit(true, true, false, true, address(hub));
        emit CreatorHubV2.DisputeResolved(eid, false, arbiter);
        vm.prank(arbiter);
        hub.resolveDispute(eid, false);
        assertEq(uint8(_status(eid)), uint8(CreatorHubV2.EscrowStatus.Released));
        assertEq(hub.pendingWithdrawals(creator), 97_500_000);
        assertEq(hub.pendingWithdrawals(owner), 2_500_000);
        assertEq(hub.pendingWithdrawals(buyer), 0);
        assertTrue(hub.hasPurchased(buyer, cid));
    }

    function test_Resolve_CannotResolveTwice() public {
        vm.prank(arbiter);
        hub.resolveDispute(eid, true);
        vm.prank(arbiter);
        vm.expectRevert(CreatorHubV2.InvalidEscrowState.selector);
        hub.resolveDispute(eid, false);
    }

    function test_Resolve_ArbiterCannotBeBuyer() public {
        // Arbiter buys a listing, disputes, and is blocked from resolving it.
        usdc.mint(arbiter, PRICE);
        vm.startPrank(arbiter);
        usdc.approve(address(hub), PRICE);
        hub.purchaseContent(cid, PRICE);
        uint256 e2 = hub.getEscrowIdFor(arbiter, cid);
        hub.openDispute(e2);
        vm.expectRevert(CreatorHubV2.ArbiterConflict.selector);
        hub.resolveDispute(e2, true);
        vm.stopPrank();
    }

    function test_Resolve_ArbiterCannotBeSeller() public {
        // Arbiter lists, someone buys + disputes; arbiter (the seller) cannot resolve.
        vm.prank(arbiter);
        hub.listContent("ArbTitle", "d", "c", "u", HASH, PRICE);
        uint256 id2 = hub.contentCount();
        uint256 e2 = _buy(buyer2, id2);
        _dispute(buyer2, e2);
        vm.prank(arbiter);
        vm.expectRevert(CreatorHubV2.ArbiterConflict.selector);
        hub.resolveDispute(e2, false);
    }

    function test_Resolve_RevertsAtAndAfterTimeout() public {
        uint256 t0 = block.timestamp; // == disputedAt
        // still allowed one second before the deadline: snapshot to check, then revert
        vm.warp(t0 + TIMEOUT - 1);
        uint256 snap = vm.snapshotState();
        vm.prank(arbiter);
        hub.resolveDispute(eid, true);
        vm.revertToState(snap);

        vm.warp(t0 + TIMEOUT);
        vm.prank(arbiter);
        vm.expectRevert(CreatorHubV2.ArbiterTimeoutElapsed.selector);
        hub.resolveDispute(eid, true);
        skip(1 days);
        vm.prank(arbiter);
        vm.expectRevert(CreatorHubV2.ArbiterTimeoutElapsed.selector);
        hub.resolveDispute(eid, false);
    }

    function test_ClaimTimeoutRefund_RevertsBeforeTimeout() public {
        skip(TIMEOUT - 1);
        vm.prank(stranger);
        vm.expectRevert(CreatorHubV2.TimeoutNotReached.selector);
        hub.claimTimeoutRefund(eid);
    }

    function test_ClaimTimeoutRefund_AfterTimeoutByAnyone() public {
        skip(TIMEOUT);
        vm.expectEmit(true, true, false, true, address(hub));
        emit CreatorHubV2.EscrowRefunded(eid, buyer, PRICE);
        vm.prank(stranger);
        hub.claimTimeoutRefund(eid);
        assertEq(uint8(_status(eid)), uint8(CreatorHubV2.EscrowStatus.Refunded));
        assertEq(hub.pendingWithdrawals(buyer), PRICE);
        assertEq(hub.pendingWithdrawals(owner), 0);
        assertFalse(hub.hasPurchased(buyer, cid));
        vm.expectRevert(CreatorHubV2.InvalidEscrowState.selector);
        hub.claimTimeoutRefund(eid);
    }

    function test_ClaimTimeoutRefund_RequiresDisputedState() public {
        uint256 id2 = _list(PRICE);
        uint256 e2 = _buy(buyer2, id2);
        skip(TIMEOUT);
        vm.expectRevert(CreatorHubV2.InvalidEscrowState.selector);
        hub.claimTimeoutRefund(e2);
    }

    function test_SetArbiter_AffectsExistingDispute() public {
        address arb2 = makeAddr("arb2");
        vm.prank(owner);
        hub.setArbiter(arb2);
        vm.prank(arbiter);
        vm.expectRevert(CreatorHubV2.NotArbiter.selector);
        hub.resolveDispute(eid, true);
        vm.prank(arb2);
        hub.resolveDispute(eid, true);
        assertEq(hub.pendingWithdrawals(buyer), PRICE);
    }

    // ───────────── escrow totals & views ─────────────
    function test_EscrowTotals_TrackEveryTransition() public {
        (uint256 held, uint256 disputed) = hub.getCreatorEscrowTotals(creator);
        assertEq(held, 0);
        assertEq(disputed, PRICE); // setUp disputed the only escrow

        uint256 e2 = _buy(buyer2, cid);
        (held, disputed) = hub.getCreatorEscrowTotals(creator);
        assertEq(held, PRICE);
        assertEq(disputed, PRICE);

        _dispute(buyer2, e2);
        (held, disputed) = hub.getCreatorEscrowTotals(creator);
        assertEq(held, 0);
        assertEq(disputed, 2 * PRICE);

        vm.prank(arbiter);
        hub.resolveDispute(eid, true); // refund
        (held, disputed) = hub.getCreatorEscrowTotals(creator);
        assertEq(held, 0);
        assertEq(disputed, PRICE);

        vm.prank(arbiter);
        hub.resolveDispute(e2, false); // release
        (held, disputed) = hub.getCreatorEscrowTotals(creator);
        assertEq(held, 0);
        assertEq(disputed, 0);

        // held -> released path
        vm.prank(stranger);
        uint256 e3;
        hub.purchaseContent(cid, PRICE);
        e3 = hub.getEscrowIdFor(stranger, cid);
        (held, disputed) = hub.getCreatorEscrowTotals(creator);
        assertEq(held, PRICE);
        skip(WINDOW);
        hub.releaseEscrow(e3);
        (held, disputed) = hub.getCreatorEscrowTotals(creator);
        assertEq(held, 0);
        assertEq(disputed, 0);
    }

    function test_EscrowTotals_TimeoutRefundClearsDisputed() public {
        skip(TIMEOUT);
        hub.claimTimeoutRefund(eid);
        (uint256 held, uint256 disputed) = hub.getCreatorEscrowTotals(creator);
        assertEq(held, 0);
        assertEq(disputed, 0);
    }

    function test_GetDisputedEscrowIds() public {
        uint256[] memory ids = hub.getDisputedEscrowIds();
        assertEq(ids.length, 1);
        assertEq(ids[0], eid);

        uint256 e2 = _buy(buyer2, cid);
        _dispute(buyer2, e2);
        ids = hub.getDisputedEscrowIds();
        assertEq(ids.length, 2);
        assertEq(ids[1], e2);

        vm.prank(arbiter);
        hub.resolveDispute(eid, false);
        ids = hub.getDisputedEscrowIds();
        assertEq(ids.length, 1);
        assertEq(ids[0], e2);
    }

    function test_GetBuyerAndCreatorEscrowIds() public {
        uint256 id2 = _list(2 * PRICE);
        uint256 e2 = _buy(buyer, id2);
        uint256[] memory b = hub.getBuyerEscrowIds(buyer);
        assertEq(b.length, 2);
        assertEq(b[0], eid);
        assertEq(b[1], e2);
        assertEq(hub.getBuyerEscrowIds(buyer2).length, 0);
        assertEq(hub.getCreatorEscrowIds(creator).length, 2);
        uint256[] memory purchases = hub.getBuyerPurchases(buyer);
        assertEq(purchases.length, 2);
        assertEq(purchases[1], id2);
        assertEq(hub.getCreatorContents(creator).length, 2);
    }

    function test_GetCreatorStats_AcrossListings() public {
        uint256 id2 = _list(200e6);
        uint256 e2 = _buy(buyer2, id2);
        skip(WINDOW);
        hub.releaseEscrow(e2);
        (uint256 earnings, uint256 sales, uint256 n) = hub.getCreatorStats(creator);
        assertEq(earnings, 195e6);
        assertEq(sales, 2); // disputed escrow still counts as a sale
        assertEq(n, 2);
    }

    function test_GetEscrow_NonexistentReverts() public {
        vm.expectRevert(CreatorHubV2.EscrowNotFound.selector);
        hub.getEscrow(0);
        vm.expectRevert(CreatorHubV2.EscrowNotFound.selector);
        hub.getEscrow(42);
    }
}
