// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {CreatorHubV2} from "../CreatorHubV2.sol";
import {CreatorHubV2TestBase} from "./CreatorHubV2.Base.t.sol";

/// Fuzz tests for price / fee arithmetic and time boundaries.
contract CreatorHubV2FuzzTest is CreatorHubV2TestBase {
    function testFuzz_ReleaseSplit_SumsToAmount(uint256 price, uint256 feeBps) public {
        price = bound(price, 1, 100_000_000e6);
        feeBps = bound(feeBps, 0, 1000);
        vm.prank(owner);
        hub.setProtocolFee(feeBps);
        usdc.mint(buyer, price);
        uint256 id = _list(price);
        uint256 eid = _buy(buyer, id);

        skip(WINDOW);
        hub.releaseEscrow(eid);

        uint256 fee = price * feeBps / 10_000;
        uint256 seller = hub.pendingWithdrawals(creator);
        assertEq(seller, price - fee);
        assertEq(hub.pendingWithdrawals(owner), fee);
        assertEq(seller + hub.pendingWithdrawals(owner), price);
        assertLe(fee, price / 10 + 1); // never above 10% (+ rounding)
        assertEq(hub.getContent(id).totalEarnings, seller);
    }

    function testFuzz_ArbiterRelease_SameMathAsTimedRelease(uint256 price, uint256 feeBps) public {
        price = bound(price, 1, 100_000_000e6);
        feeBps = bound(feeBps, 0, 1000);
        vm.prank(owner);
        hub.setProtocolFee(feeBps);
        usdc.mint(buyer, price);
        uint256 id = _list(price);
        uint256 eid = _buy(buyer, id);
        _dispute(buyer, eid);
        vm.prank(arbiter);
        hub.resolveDispute(eid, false);
        uint256 fee = price * feeBps / 10_000;
        assertEq(hub.pendingWithdrawals(creator), price - fee);
        assertEq(hub.pendingWithdrawals(owner), fee);
    }

    function testFuzz_Refund_PaysBuyerExactlyPriceNoFee(uint256 price, uint256 feeBps, bool viaTimeout) public {
        price = bound(price, 1, 100_000_000e6);
        feeBps = bound(feeBps, 0, 1000);
        vm.prank(owner);
        hub.setProtocolFee(feeBps);
        usdc.mint(buyer, price);
        uint256 id = _list(price);
        uint256 eid = _buy(buyer, id);
        _dispute(buyer, eid);
        if (viaTimeout) {
            skip(TIMEOUT);
            hub.claimTimeoutRefund(eid);
        } else {
            vm.prank(arbiter);
            hub.resolveDispute(eid, true);
        }
        assertEq(hub.pendingWithdrawals(buyer), price);
        assertEq(hub.pendingWithdrawals(owner), 0);
        assertEq(hub.pendingWithdrawals(creator), 0);
        uint256 before = usdc.balanceOf(buyer);
        vm.prank(buyer);
        hub.withdraw();
        assertEq(usdc.balanceOf(buyer), before + price);
        assertEq(usdc.balanceOf(address(hub)), 0);
    }

    function testFuzz_FeeSnapshotIndependentOfLaterFee(uint256 feeAtBuy, uint256 feeLater) public {
        feeAtBuy = bound(feeAtBuy, 0, 1000);
        feeLater = bound(feeLater, 0, 1000);
        vm.startPrank(owner);
        hub.setProtocolFee(feeAtBuy);
        vm.stopPrank();
        uint256 id = _list(PRICE);
        uint256 eid = _buy(buyer, id);
        vm.prank(owner);
        hub.setProtocolFee(feeLater);
        skip(WINDOW);
        hub.releaseEscrow(eid);
        assertEq(hub.pendingWithdrawals(owner), PRICE * feeAtBuy / 10_000);
    }

    function testFuzz_DisputeWindowBoundary(uint256 elapsed) public {
        elapsed = bound(elapsed, 0, 30 days);
        (, uint256 eid) = _listAndBuy();
        skip(elapsed);
        if (elapsed < WINDOW) {
            // dispute allowed, release not
            vm.expectRevert(CreatorHubV2.DisputeWindowOpen.selector);
            hub.releaseEscrow(eid);
            _dispute(buyer, eid);
            assertEq(uint8(_status(eid)), uint8(CreatorHubV2.EscrowStatus.Disputed));
        } else {
            vm.prank(buyer);
            vm.expectRevert(CreatorHubV2.DisputeWindowClosed.selector);
            hub.openDispute(eid);
            hub.releaseEscrow(eid);
            assertEq(uint8(_status(eid)), uint8(CreatorHubV2.EscrowStatus.Released));
        }
    }

    function testFuzz_TimeoutBoundary(uint256 elapsed) public {
        elapsed = bound(elapsed, 0, 30 days);
        (, uint256 eid) = _listAndBuy();
        _dispute(buyer, eid);
        skip(elapsed);
        if (elapsed < TIMEOUT) {
            vm.expectRevert(CreatorHubV2.TimeoutNotReached.selector);
            hub.claimTimeoutRefund(eid);
            vm.prank(arbiter);
            hub.resolveDispute(eid, true);
        } else {
            vm.prank(arbiter);
            vm.expectRevert(CreatorHubV2.ArbiterTimeoutElapsed.selector);
            hub.resolveDispute(eid, true);
            hub.claimTimeoutRefund(eid);
        }
        assertEq(uint8(_status(eid)), uint8(CreatorHubV2.EscrowStatus.Refunded));
    }

    function testFuzz_Purchase_MaxPrice(uint256 price, uint256 maxPrice) public {
        price = bound(price, 1, 1_000_000e6);
        uint256 id = _list(price);
        vm.prank(buyer);
        if (maxPrice < price) {
            vm.expectRevert(CreatorHubV2.PriceExceedsMax.selector);
        }
        hub.purchaseContent(id, maxPrice);
        assertEq(hub.hasPurchased(buyer, id), maxPrice >= price);
    }

    function testFuzz_RatingAverage(uint8 s1, uint8 s2, uint8 s3) public {
        s1 = uint8(bound(s1, 1, 5));
        s2 = uint8(bound(s2, 1, 5));
        s3 = uint8(bound(s3, 1, 5));
        uint256 id = _list(PRICE);
        _buy(buyer, id);
        _buy(buyer2, id);
        _buy(stranger, id);
        vm.prank(buyer);
        hub.rateContent(id, s1, "");
        vm.prank(buyer2);
        hub.rateContent(id, s2, "");
        vm.prank(stranger);
        hub.rateContent(id, s3, "");
        (uint256 avg, uint256 count) = hub.getRating(id);
        assertEq(count, 3);
        assertEq(avg, (uint256(s1) + s2 + s3) * 100 / 3);
    }

    function testFuzz_ReviewHashMatchesText(string calldata text) public {
        vm.assume(bytes(text).length > 0 && bytes(text).length <= 1000);
        (uint256 id,) = _listAndBuy();
        vm.expectEmit(true, true, false, true, address(hub));
        emit CreatorHubV2.ContentRated(id, buyer, 5, keccak256(bytes(text)), text);
        vm.prank(buyer);
        hub.rateContent(id, 5, text);
        (, bytes32 h) = hub.getUserRating(id, buyer);
        assertEq(h, keccak256(bytes(text)));
    }
}
