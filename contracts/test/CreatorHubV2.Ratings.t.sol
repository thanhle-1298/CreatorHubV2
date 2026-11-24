// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {CreatorHubV2} from "../CreatorHubV2.sol";
import {CreatorHubV2TestBase} from "./CreatorHubV2.Base.t.sol";

/// Ratings, pause semantics, admin access control.
contract CreatorHubV2RatingsAdminTest is CreatorHubV2TestBase {
    uint256 internal cid;
    uint256 internal eid;

    function setUp() public override {
        super.setUp();
        (cid, eid) = _listAndBuy();
    }

    // ───────────── ratings ─────────────
    function test_Rate_StoresAndAverage() public {
        vm.prank(buyer);
        hub.rateContent(cid, 5, "great");
        uint256 e2 = _buy(buyer2, cid);
        e2;
        vm.prank(buyer2);
        hub.rateContent(cid, 2, "");
        (uint256 avg, uint256 count) = hub.getRating(cid);
        assertEq(count, 2);
        assertEq(avg, 350); // (5+2)/2 *100
        (uint8 stars, bytes32 h) = hub.getUserRating(cid, buyer);
        assertEq(stars, 5);
        assertEq(h, keccak256(bytes("great")));
        (stars, h) = hub.getUserRating(cid, buyer2);
        assertEq(stars, 2);
        assertEq(h, bytes32(0)); // empty review stores zero hash
    }

    function test_Rate_AverageFloors() public {
        vm.prank(buyer);
        hub.rateContent(cid, 5, "");
        _buy(buyer2, cid);
        vm.prank(buyer2);
        hub.rateContent(cid, 4, "");
        _buy(stranger, cid);
        vm.prank(stranger);
        hub.rateContent(cid, 4, "");
        (uint256 avg, uint256 count) = hub.getRating(cid);
        assertEq(count, 3);
        assertEq(avg, 433); // 13*100/3 = 433.33 floored
    }

    function test_Rate_EmitsReviewTextAndHashMatches() public {
        string memory text = "Excellent content, worth every cent";
        vm.expectEmit(true, true, false, true, address(hub));
        emit CreatorHubV2.ContentRated(cid, buyer, 4, keccak256(bytes(text)), text);
        vm.prank(buyer);
        hub.rateContent(cid, 4, text);
        (, bytes32 h) = hub.getUserRating(cid, buyer);
        assertEq(h, keccak256(bytes(text)));
    }

    function test_Rate_NonBuyerReverts() public {
        vm.prank(buyer2);
        vm.expectRevert(CreatorHubV2.NotVerifiedBuyer.selector);
        hub.rateContent(cid, 5, "x");
        vm.prank(creator);
        vm.expectRevert(CreatorHubV2.NotVerifiedBuyer.selector);
        hub.rateContent(cid, 5, "x");
    }

    function test_Rate_RefundedBuyerReverts() public {
        _dispute(buyer, eid);
        vm.prank(arbiter);
        hub.resolveDispute(eid, true);
        vm.prank(buyer);
        vm.expectRevert(CreatorHubV2.NotVerifiedBuyer.selector);
        hub.rateContent(cid, 5, "x");
    }

    function test_Rate_InvalidStarsRevert() public {
        vm.startPrank(buyer);
        vm.expectRevert(CreatorHubV2.InvalidRating.selector);
        hub.rateContent(cid, 0, "");
        vm.expectRevert(CreatorHubV2.InvalidRating.selector);
        hub.rateContent(cid, 6, "");
        vm.stopPrank();
        // 1 and 5 are the valid boundaries
        vm.prank(buyer);
        hub.rateContent(cid, 1, "");
        _buy(buyer2, cid);
        vm.prank(buyer2);
        hub.rateContent(cid, 5, "");
    }

    function test_Rate_OnlyOnce() public {
        vm.startPrank(buyer);
        hub.rateContent(cid, 3, "");
        vm.expectRevert(CreatorHubV2.AlreadyRated.selector);
        hub.rateContent(cid, 4, "");
        vm.stopPrank();
    }

    function test_Rate_ReviewTooLong() public {
        bytes memory ok = new bytes(1000);
        bytes memory tooLong = new bytes(1001);
        for (uint256 i; i < ok.length; ++i) ok[i] = "a";
        for (uint256 i; i < tooLong.length; ++i) tooLong[i] = "a";
        vm.startPrank(buyer);
        vm.expectRevert(CreatorHubV2.ReviewTooLong.selector);
        hub.rateContent(cid, 3, string(tooLong));
        hub.rateContent(cid, 3, string(ok)); // exactly 1000 bytes ok
        vm.stopPrank();
    }

    function test_Rate_RevokedOnRefund_ArbiterPath() public {
        _buy(buyer2, cid);
        vm.prank(buyer);
        hub.rateContent(cid, 5, "good");
        vm.prank(buyer2);
        hub.rateContent(cid, 1, "bad");
        (uint256 avg, uint256 count) = hub.getRating(cid);
        assertEq(avg, 300);
        assertEq(count, 2);

        _dispute(buyer, eid);
        vm.expectEmit(true, true, false, false, address(hub));
        emit CreatorHubV2.RatingRevoked(cid, buyer);
        vm.prank(arbiter);
        hub.resolveDispute(eid, true);

        (avg, count) = hub.getRating(cid);
        assertEq(count, 1);
        assertEq(avg, 100);
        (uint8 stars,) = hub.getUserRating(cid, buyer);
        assertEq(stars, 0);
        // cannot re-rate (also not a verified buyer anymore)
        vm.prank(buyer);
        vm.expectRevert();
        hub.rateContent(cid, 5, "again");
    }

    function test_Rate_RevokedOnRefund_TimeoutPath() public {
        vm.prank(buyer);
        hub.rateContent(cid, 4, "");
        _dispute(buyer, eid);
        skip(TIMEOUT);
        hub.claimTimeoutRefund(eid);
        (uint256 avg, uint256 count) = hub.getRating(cid);
        assertEq(count, 0);
        assertEq(avg, 0);
    }

    function test_Rate_KeptWhenDisputeReleasedToSeller() public {
        vm.prank(buyer);
        hub.rateContent(cid, 4, "");
        _dispute(buyer, eid);
        vm.prank(arbiter);
        hub.resolveDispute(eid, false);
        (uint256 avg, uint256 count) = hub.getRating(cid);
        assertEq(count, 1);
        assertEq(avg, 400);
    }

    function test_Rate_AllowedWhileDisputed() public {
        _dispute(buyer, eid);
        vm.prank(buyer);
        hub.rateContent(cid, 2, "");
        (, uint256 count) = hub.getRating(cid);
        assertEq(count, 1);
    }

    // ───────────── pause ─────────────
    function test_Pause_BlocksListAndPurchase() public {
        vm.prank(owner);
        hub.pause();
        vm.prank(creator);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        hub.listContent("T", "d", "c", "u", HASH, PRICE);
        vm.prank(buyer2);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        hub.purchaseContent(cid, PRICE);
    }

    function test_Pause_DoesNotBlockSettlementPaths() public {
        // prepare: e1 (Held, will be released), e2 (disputed, resolve), e3 (disputed, timeout)
        uint256 e2 = _buy(buyer2, cid);
        uint256 e3 = _buy(stranger, cid);
        _dispute(buyer2, e2);
        _dispute(stranger, e3);
        vm.prank(owner);
        hub.pause();

        // openDispute while paused: new escrow bought pre-pause is needed; reuse buyer's eid
        _dispute(buyer, eid);
        // rateContent while paused
        vm.prank(buyer);
        hub.rateContent(cid, 3, "paused");
        // resolveDispute while paused
        vm.prank(arbiter);
        hub.resolveDispute(e2, false);
        // claimTimeoutRefund while paused
        skip(TIMEOUT);
        hub.claimTimeoutRefund(e3);
        hub.claimTimeoutRefund(eid);
        // withdraw while paused
        vm.prank(creator);
        hub.withdraw();
        assertEq(usdc.balanceOf(creator), 97_500_000);
        vm.prank(stranger);
        hub.withdraw();
        assertEq(usdc.balanceOf(stranger), 1_000_000e6); // fully refunded
    }

    function test_Pause_DoesNotBlockReleaseEscrow() public {
        vm.prank(owner);
        hub.pause();
        skip(WINDOW);
        hub.releaseEscrow(eid);
        assertEq(hub.pendingWithdrawals(creator), 97_500_000);
    }

    function test_Pause_CreatorAdminStillWorks() public {
        vm.prank(owner);
        hub.pause();
        vm.startPrank(creator);
        hub.setContentActive(cid, false);
        hub.updateContentUrl(cid, "x");
        vm.stopPrank();
    }

    function test_RenounceOwnership_RevertsWhilePaused() public {
        vm.startPrank(owner);
        hub.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        hub.renounceOwnership();
        hub.unpause();
        hub.renounceOwnership();
        vm.stopPrank();
        assertEq(hub.owner(), address(0));
    }

    function test_Unpause_ResumesIntake() public {
        vm.startPrank(owner);
        hub.pause();
        hub.unpause();
        vm.stopPrank();
        _buy(buyer2, cid);
        assertTrue(hub.hasPurchased(buyer2, cid));
    }

    function test_PauseUnpause_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hub.pause();
        vm.prank(owner);
        hub.pause();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hub.unpause();
    }

    // ───────────── admin ─────────────
    function test_SetArbiter_OwnerOnlyAndEmits() public {
        address newArb = makeAddr("newArb");
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hub.setArbiter(newArb);
        vm.prank(owner);
        vm.expectRevert(CreatorHubV2.ZeroAddress.selector);
        hub.setArbiter(address(0));

        vm.expectEmit(true, true, false, false, address(hub));
        emit CreatorHubV2.ArbiterUpdated(arbiter, newArb);
        vm.prank(owner);
        hub.setArbiter(newArb);
        assertEq(hub.arbiter(), newArb);
    }

    function test_SetProtocolFee_MaxAndEvent() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hub.setProtocolFee(100);

        vm.prank(owner);
        vm.expectRevert(CreatorHubV2.FeeTooHigh.selector);
        hub.setProtocolFee(1001);

        vm.expectEmit(false, false, false, true, address(hub));
        emit CreatorHubV2.ProtocolFeeUpdated(250, 1000);
        vm.prank(owner);
        hub.setProtocolFee(1000);
        assertEq(hub.protocolFeeBps(), 1000);
    }

    function test_SetFeeRecipient_ZeroRevertsAndEvent() public {
        address fr = makeAddr("fr");
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hub.setFeeRecipient(fr);
        vm.prank(owner);
        vm.expectRevert(CreatorHubV2.ZeroAddress.selector);
        hub.setFeeRecipient(address(0));

        vm.expectEmit(true, true, false, false, address(hub));
        emit CreatorHubV2.FeeRecipientUpdated(owner, fr);
        vm.prank(owner);
        hub.setFeeRecipient(fr);
        assertEq(hub.feeRecipient(), fr);
    }
}
