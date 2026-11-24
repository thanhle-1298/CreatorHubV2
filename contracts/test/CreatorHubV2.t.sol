// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {CreatorHubV2} from "../CreatorHubV2.sol";
import {CreatorHubV2TestBase} from "./CreatorHubV2.Base.t.sol";

/// Deployment, listing, purchase, dispute window, release math.
contract CreatorHubV2Test is CreatorHubV2TestBase {
    // ───────────── constructor ─────────────
    function test_Constructor_SetsState() public view {
        assertEq(address(hub.usdc()), address(usdc));
        assertEq(hub.owner(), owner);
        assertEq(hub.arbiter(), arbiter);
        assertEq(hub.feeRecipient(), owner);
        assertEq(hub.protocolFeeBps(), 250);
    }

    function test_Constructor_ZeroAddressesRevert() public {
        vm.expectRevert(CreatorHubV2.ZeroAddress.selector);
        new CreatorHubV2(address(0), owner, arbiter);
        vm.expectRevert(CreatorHubV2.ZeroAddress.selector);
        new CreatorHubV2(address(usdc), address(0), arbiter);
        vm.expectRevert(CreatorHubV2.ZeroAddress.selector);
        new CreatorHubV2(address(usdc), owner, address(0));
    }

    // ───────────── listing ─────────────
    function test_ListContent_StoresAndEmits() public {
        vm.expectEmit(true, true, false, true, address(hub));
        emit CreatorHubV2.ContentListed(1, creator, PRICE, HASH);
        uint256 id = _list(PRICE);
        assertEq(id, 1);
        vm.prank(creator);
        CreatorHubV2.Content memory c = hub.getContent(id);
        assertEq(c.creator, creator);
        assertEq(c.title, "Title");
        assertEq(c.priceUsdc, PRICE);
        assertEq(c.contentHash, HASH);
        assertTrue(c.isActive);
        assertEq(c.contentUrl, "https://secret/url");
        assertEq(hub.getCreatorContents(creator).length, 1);
    }

    function test_ListContent_ZeroHashReverts() public {
        vm.prank(creator);
        vm.expectRevert(CreatorHubV2.ZeroContentHash.selector);
        hub.listContent("T", "d", "c", "u", bytes32(0), PRICE);
    }

    function test_ListContent_ZeroPriceReverts() public {
        vm.prank(creator);
        vm.expectRevert(CreatorHubV2.InvalidPrice.selector);
        hub.listContent("T", "d", "c", "u", HASH, 0);
    }

    function test_ListContent_EmptyTitleReverts() public {
        vm.prank(creator);
        vm.expectRevert(CreatorHubV2.EmptyTitle.selector);
        hub.listContent("", "d", "c", "u", HASH, PRICE);
    }

    function test_HashImmutableAfterUpdates() public {
        uint256 id = _list(PRICE);
        vm.startPrank(creator);
        vm.expectEmit(true, false, false, false, address(hub));
        emit CreatorHubV2.ContentUpdated(id);
        hub.updateContent(id, "New", "NewD", "newcover", 5e6);
        hub.updateContentUrl(id, "https://new/url");
        CreatorHubV2.Content memory c = hub.getContent(id);
        vm.stopPrank();
        assertEq(c.contentHash, HASH);
        assertEq(c.title, "New");
        assertEq(c.priceUsdc, 5e6);
        assertEq(c.contentUrl, "https://new/url");
    }

    function test_UpdateContent_AccessAndPrice() public {
        uint256 id = _list(PRICE);
        vm.prank(stranger);
        vm.expectRevert(CreatorHubV2.NotContentCreator.selector);
        hub.updateContent(id, "a", "b", "c", 1);
        vm.prank(stranger);
        vm.expectRevert(CreatorHubV2.NotContentCreator.selector);
        hub.updateContentUrl(id, "x");
        vm.prank(stranger);
        vm.expectRevert(CreatorHubV2.NotContentCreator.selector);
        hub.setContentActive(id, false);
        vm.prank(creator);
        vm.expectRevert(CreatorHubV2.InvalidPrice.selector);
        hub.updateContent(id, "a", "b", "c", 0);
        vm.expectRevert(CreatorHubV2.ContentNotFound.selector);
        hub.updateContentUrl(99, "x");
    }

    function test_SetContentActive_Emits() public {
        uint256 id = _list(PRICE);
        vm.expectEmit(true, false, false, true, address(hub));
        emit CreatorHubV2.ContentActiveChanged(id, false);
        vm.prank(creator);
        hub.setContentActive(id, false);
        assertEq(hub.getActiveContentIds().length, 0);
        assertEq(hub.getAllContentIds().length, 1);
    }

    function test_GetContentUrl_HiddenFromStrangers() public {
        uint256 id = _list(PRICE);
        vm.prank(stranger);
        CreatorHubV2.Content memory c = hub.getContent(id);
        assertEq(bytes(c.contentUrl).length, 0);
        vm.prank(creator);
        assertEq(hub.getContentUrl(id), "https://secret/url");
    }

    // ───────────── purchase ─────────────
    function test_Purchase_CreatesHeldEscrowAndImmediateAccess() public {
        uint256 id = _list(PRICE);
        uint256 balBefore = usdc.balanceOf(buyer);
        uint256 eid = _buy(buyer, id);
        CreatorHubV2.Escrow memory e = hub.getEscrow(eid);
        assertEq(uint8(e.status), uint8(CreatorHubV2.EscrowStatus.Held));
        assertEq(e.buyer, buyer);
        assertEq(e.seller, creator);
        assertEq(e.amount, PRICE);
        assertEq(e.feeBps, 250);
        assertEq(e.paidAt, block.timestamp);
        assertEq(usdc.balanceOf(buyer), balBefore - PRICE);
        assertEq(usdc.balanceOf(address(hub)), PRICE);
        // link readable immediately as buyer
        vm.prank(buyer);
        assertEq(hub.getContentUrl(id), "https://secret/url");
        assertTrue(hub.hasPurchased(buyer, id));
        // nobody is credited yet
        assertEq(hub.pendingWithdrawals(creator), 0);
        assertEq(hub.pendingWithdrawals(owner), 0);
    }

    function test_Purchase_EmitsEscrowCreated() public {
        uint256 id = _list(PRICE);
        vm.expectEmit(true, true, true, true, address(hub));
        emit CreatorHubV2.EscrowCreated(1, id, buyer, creator, PRICE, 250, block.timestamp + WINDOW);
        _buy(buyer, id);
    }

    function test_Purchase_NonBuyerCannotReadUrl() public {
        (uint256 id,) = _listAndBuy();
        vm.prank(buyer2);
        vm.expectRevert(CreatorHubV2.Unauthorized.selector);
        hub.getContentUrl(id);
    }

    function test_Purchase_CreatorCannotBuy() public {
        uint256 id = _list(PRICE);
        usdc.mint(creator, PRICE);
        vm.startPrank(creator);
        usdc.approve(address(hub), PRICE);
        vm.expectRevert(CreatorHubV2.CreatorCannotBuy.selector);
        hub.purchaseContent(id, PRICE);
        vm.stopPrank();
    }

    function test_Purchase_DoubleReverts() public {
        (uint256 id,) = _listAndBuy();
        vm.prank(buyer);
        vm.expectRevert(CreatorHubV2.AlreadyPurchased.selector);
        hub.purchaseContent(id, PRICE);
    }

    function test_Purchase_MaxPriceBound() public {
        uint256 id = _list(PRICE);
        vm.prank(buyer);
        vm.expectRevert(CreatorHubV2.PriceExceedsMax.selector);
        hub.purchaseContent(id, PRICE - 1);
        vm.prank(buyer);
        hub.purchaseContent(id, PRICE); // exactly max is fine
        assertTrue(hub.hasPurchased(buyer, id));
    }

    function test_Purchase_InactiveReverts() public {
        uint256 id = _list(PRICE);
        vm.prank(creator);
        hub.setContentActive(id, false);
        vm.prank(buyer);
        vm.expectRevert(CreatorHubV2.ContentNotActive.selector);
        hub.purchaseContent(id, PRICE);
    }

    function test_Purchase_NonexistentReverts() public {
        vm.prank(buyer);
        vm.expectRevert(CreatorHubV2.ContentNotFound.selector);
        hub.purchaseContent(1, PRICE);
    }

    function test_Purchase_InsufficientAllowanceReverts() public {
        uint256 id = _list(PRICE);
        address poor = makeAddr("poor");
        vm.prank(poor);
        vm.expectRevert();
        hub.purchaseContent(id, PRICE);
        assertEq(hub.escrowCount(), 0);
    }

    // ───────────── dispute window ─────────────
    function test_OpenDispute_JustBeforeDeadline() public {
        (, uint256 eid) = _listAndBuy();
        skip(WINDOW - 1);
        vm.expectEmit(true, true, true, true, address(hub));
        emit CreatorHubV2.DisputeOpened(eid, 1, buyer);
        _dispute(buyer, eid);
        assertEq(uint8(_status(eid)), uint8(CreatorHubV2.EscrowStatus.Disputed));
        assertEq(hub.getEscrow(eid).disputedAt, block.timestamp);
    }

    function test_OpenDispute_RevertsAtDeadline() public {
        (, uint256 eid) = _listAndBuy();
        skip(WINDOW);
        vm.prank(buyer);
        vm.expectRevert(CreatorHubV2.DisputeWindowClosed.selector);
        hub.openDispute(eid);
    }

    function test_OpenDispute_RevertsAfterDeadline() public {
        (, uint256 eid) = _listAndBuy();
        skip(WINDOW + 1 days);
        vm.prank(buyer);
        vm.expectRevert(CreatorHubV2.DisputeWindowClosed.selector);
        hub.openDispute(eid);
    }

    function test_OpenDispute_OnlyBuyer() public {
        (, uint256 eid) = _listAndBuy();
        vm.prank(creator);
        vm.expectRevert(CreatorHubV2.NotBuyer.selector);
        hub.openDispute(eid);
        vm.prank(stranger);
        vm.expectRevert(CreatorHubV2.NotBuyer.selector);
        hub.openDispute(eid);
    }

    function test_OpenDispute_CannotTwice() public {
        (, uint256 eid) = _listAndBuy();
        _dispute(buyer, eid);
        vm.prank(buyer);
        vm.expectRevert(CreatorHubV2.InvalidEscrowState.selector);
        hub.openDispute(eid);
    }

    function test_OpenDispute_NonexistentEscrow() public {
        vm.prank(buyer);
        vm.expectRevert(CreatorHubV2.EscrowNotFound.selector);
        hub.openDispute(7);
    }

    function test_ReleaseEscrow_RevertsBeforeWindow() public {
        (, uint256 eid) = _listAndBuy();
        skip(WINDOW - 1);
        vm.expectRevert(CreatorHubV2.DisputeWindowOpen.selector);
        hub.releaseEscrow(eid);
    }

    function test_ReleaseEscrow_AtExactlyFiveDaysByAnyone() public {
        (, uint256 eid) = _listAndBuy();
        skip(WINDOW);
        vm.expectEmit(true, true, true, true, address(hub));
        emit CreatorHubV2.EscrowReleased(eid, 1, creator, 97_500_000, 2_500_000);
        vm.prank(stranger);
        hub.releaseEscrow(eid);
        assertEq(uint8(_status(eid)), uint8(CreatorHubV2.EscrowStatus.Released));
    }

    function test_ReleaseEscrow_CannotReleaseTwiceOrDisputed() public {
        (, uint256 eid) = _listAndBuy();
        skip(WINDOW);
        hub.releaseEscrow(eid);
        vm.expectRevert(CreatorHubV2.InvalidEscrowState.selector);
        hub.releaseEscrow(eid);

        uint256 id2 = _list(PRICE);
        uint256 eid2 = _buy(buyer2, id2);
        _dispute(buyer2, eid2);
        skip(WINDOW);
        vm.expectRevert(CreatorHubV2.InvalidEscrowState.selector);
        hub.releaseEscrow(eid2);
    }

    // ───────────── release math / pull payments ─────────────
    function test_Release_SplitsNinetySevenPointFive() public {
        (uint256 id, uint256 eid) = _listAndBuy();
        skip(WINDOW);
        hub.releaseEscrow(eid);
        assertEq(hub.pendingWithdrawals(creator), 97_500_000);
        assertEq(hub.pendingWithdrawals(owner), 2_500_000); // feeRecipient defaults to owner
        // pull payments: no push yet
        assertEq(usdc.balanceOf(creator), 0);
        assertEq(usdc.balanceOf(address(hub)), PRICE);
        (uint256 earnings, uint256 sales, uint256 n) = hub.getCreatorStats(creator);
        assertEq(earnings, 97_500_000);
        assertEq(sales, 1);
        assertEq(n, 1);
        assertEq(hub.getContent(id).totalEarnings, 97_500_000);
    }

    function test_Withdraw_PullsPayments() public {
        (, uint256 eid) = _listAndBuy();
        skip(WINDOW);
        hub.releaseEscrow(eid);

        vm.expectEmit(true, false, false, true, address(hub));
        emit CreatorHubV2.Withdrawn(creator, 97_500_000);
        vm.prank(creator);
        hub.withdraw();
        vm.prank(owner);
        hub.withdraw();
        assertEq(usdc.balanceOf(creator), 97_500_000);
        assertEq(usdc.balanceOf(owner), 2_500_000);
        assertEq(hub.pendingWithdrawals(creator), 0);
        assertEq(usdc.balanceOf(address(hub)), 0);

        // second withdraw is a harmless no-op
        vm.prank(creator);
        hub.withdraw();
        assertEq(usdc.balanceOf(creator), 97_500_000);
    }

    function test_FeeSnapshot_UnaffectedByLaterSetProtocolFee() public {
        (, uint256 eid) = _listAndBuy(); // snapshot 250 bps
        vm.prank(owner);
        hub.setProtocolFee(1000);
        assertEq(hub.getEscrow(eid).feeBps, 250);
        skip(WINDOW);
        hub.releaseEscrow(eid);
        assertEq(hub.pendingWithdrawals(creator), 97_500_000);
        assertEq(hub.pendingWithdrawals(owner), 2_500_000);

        // new purchases use the new fee
        uint256 id2 = _list(PRICE);
        uint256 eid2 = _buy(buyer2, id2);
        assertEq(hub.getEscrow(eid2).feeBps, 1000);
    }

    function test_Release_ZeroFeeCreditsNoFeeRecipient() public {
        vm.prank(owner);
        hub.setProtocolFee(0);
        (, uint256 eid) = _listAndBuy();
        skip(WINDOW);
        hub.releaseEscrow(eid);
        assertEq(hub.pendingWithdrawals(creator), PRICE);
        assertEq(hub.pendingWithdrawals(owner), 0);
    }

    function test_Release_UsesFeeRecipientAtReleaseTime() public {
        (, uint256 eid) = _listAndBuy();
        address newFr = makeAddr("newFeeRecipient");
        vm.prank(owner);
        hub.setFeeRecipient(newFr);
        skip(WINDOW);
        hub.releaseEscrow(eid);
        assertEq(hub.pendingWithdrawals(newFr), 2_500_000);
        assertEq(hub.pendingWithdrawals(owner), 0);
    }

    function test_TotalSales_AccumulatesAcrossBuyers() public {
        uint256 id = _list(PRICE);
        _buy(buyer, id);
        _buy(buyer2, id);
        (uint256 earnings, uint256 sales,) = hub.getCreatorStats(creator);
        assertEq(sales, 2);
        assertEq(earnings, 0); // nothing released yet
        assertEq(hub.getContent(id).totalSales, 2);
    }
}
