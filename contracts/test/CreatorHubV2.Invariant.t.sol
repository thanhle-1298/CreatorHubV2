// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {CreatorHubV2} from "../CreatorHubV2.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// Handler driving random but realistic sequences of marketplace actions.
contract CreatorHubV2Handler is Test {
    CreatorHubV2 public hub;
    MockUSDC public usdc;
    address public owner;
    address public arbiter;

    address[] public buyers;
    address[] public creators;
    uint256[] public contentIds;

    uint256 public calls;
    uint256 public purchases;
    uint256 public disputes;
    uint256 public releases;
    uint256 public resolves;
    uint256 public timeouts;
    uint256 public withdrawals;

    constructor(CreatorHubV2 _hub, MockUSDC _usdc, address _owner, address _arbiter) {
        hub = _hub;
        usdc = _usdc;
        owner = _owner;
        arbiter = _arbiter;
        for (uint256 i; i < 4; ++i) {
            address b = makeAddr(string.concat("hBuyer", vm.toString(i)));
            buyers.push(b);
            usdc.mint(b, 10_000_000e6);
            vm.prank(b);
            usdc.approve(address(hub), type(uint256).max);
        }
        for (uint256 i; i < 2; ++i) {
            creators.push(makeAddr(string.concat("hCreator", vm.toString(i))));
        }
    }

    function actors() external view returns (address[] memory all) {
        all = new address[](buyers.length + creators.length + 2);
        uint256 k;
        for (uint256 i; i < buyers.length; ++i) all[k++] = buyers[i];
        for (uint256 i; i < creators.length; ++i) all[k++] = creators[i];
        all[k++] = owner;
        all[k++] = arbiter;
    }

    function listContent(uint256 creatorSeed, uint256 price) external {
        calls++;
        address c = creators[creatorSeed % creators.length];
        price = bound(price, 1, 1_000_000e6);
        vm.prank(c);
        hub.listContent("t", "d", "c", "u", keccak256(abi.encode(contentIds.length)), price);
        contentIds.push(hub.contentCount());
    }

    function purchase(uint256 buyerSeed, uint256 contentSeed) external {
        calls++;
        if (contentIds.length == 0) return;
        address b = buyers[buyerSeed % buyers.length];
        uint256 id = contentIds[contentSeed % contentIds.length];
        vm.prank(b);
        try hub.purchaseContent(id, type(uint256).max) {
            purchases++;
        } catch {}
    }

    function openDispute(uint256 escrowSeed) external {
        calls++;
        uint256 id = _pickEscrow(escrowSeed);
        if (id == 0) return;
        address b = hub.getEscrow(id).buyer;
        vm.prank(b);
        try hub.openDispute(id) {
            disputes++;
        } catch {}
    }

    function releaseEscrow(uint256 escrowSeed) external {
        calls++;
        uint256 id = _pickEscrow(escrowSeed);
        if (id == 0) return;
        try hub.releaseEscrow(id) {
            releases++;
        } catch {}
    }

    function resolveDispute(uint256 escrowSeed, bool refund) external {
        calls++;
        uint256 id = _pickEscrow(escrowSeed);
        if (id == 0) return;
        vm.prank(arbiter);
        try hub.resolveDispute(id, refund) {
            resolves++;
        } catch {}
    }

    function claimTimeoutRefund(uint256 escrowSeed) external {
        calls++;
        uint256 id = _pickEscrow(escrowSeed);
        if (id == 0) return;
        try hub.claimTimeoutRefund(id) {
            timeouts++;
        } catch {}
    }

    function withdraw(uint256 actorSeed) external {
        calls++;
        address[] memory all = this.actors();
        address a = all[actorSeed % all.length];
        vm.prank(a);
        hub.withdraw();
        withdrawals++;
    }

    function warp(uint256 dt) external {
        calls++;
        dt = bound(dt, 0, 6 days);
        skip(dt);
    }

    function _pickEscrow(uint256 seed) internal view returns (uint256) {
        uint256 n = hub.escrowCount();
        if (n == 0) return 0;
        return (seed % n) + 1;
    }
}

contract CreatorHubV2InvariantTest is Test {
    CreatorHubV2 internal hub;
    MockUSDC internal usdc;
    CreatorHubV2Handler internal handler;
    address internal owner = makeAddr("owner");
    address internal arbiter = makeAddr("arbiter");

    function setUp() public {
        vm.warp(1_700_000_000);
        usdc = new MockUSDC();
        hub = new CreatorHubV2(address(usdc), owner, arbiter);
        handler = new CreatorHubV2Handler(hub, usdc, owner, arbiter);
        targetContract(address(handler));
        bytes4[] memory sel = new bytes4[](8);
        sel[0] = handler.listContent.selector;
        sel[1] = handler.purchase.selector;
        sel[2] = handler.openDispute.selector;
        sel[3] = handler.releaseEscrow.selector;
        sel[4] = handler.resolveDispute.selector;
        sel[5] = handler.claimTimeoutRefund.selector;
        sel[6] = handler.withdraw.selector;
        sel[7] = handler.warp.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: sel}));
    }

    function _pendingSum() internal view returns (uint256 sum) {
        address[] memory all = handler.actors();
        for (uint256 i; i < all.length; ++i) sum += hub.pendingWithdrawals(all[i]);
    }

    function _escrowLiabilities() internal view returns (uint256 held, uint256 disputed) {
        uint256 n = hub.escrowCount();
        for (uint256 i = 1; i <= n; ++i) {
            CreatorHubV2.Escrow memory e = hub.getEscrow(i);
            if (e.status == CreatorHubV2.EscrowStatus.Held) held += e.amount;
            else if (e.status == CreatorHubV2.EscrowStatus.Disputed) disputed += e.amount;
        }
    }

    /// PROPERTY: the contract can always pay every credit and every unsettled escrow.
    function invariant_Solvency() public view {
        (uint256 held, uint256 disputed) = _escrowLiabilities();
        assertGe(usdc.balanceOf(address(hub)), _pendingSum() + held + disputed);
    }

    /// PROPERTY: no tokens leak - with no outside transfers, balance equals liabilities exactly.
    function invariant_NoLeakExactAccounting() public view {
        (uint256 held, uint256 disputed) = _escrowLiabilities();
        assertEq(usdc.balanceOf(address(hub)), _pendingSum() + held + disputed);
    }

    /// PROPERTY: per-creator held/disputed totals equal the sum over escrows.
    function invariant_CreatorTotalsMatchEscrows() public view {
        (uint256 held, uint256 disputed) = _escrowLiabilities();
        uint256 sh;
        uint256 sd;
        for (uint256 i; i < 2; ++i) {
            (uint256 h, uint256 d) = hub.getCreatorEscrowTotals(handler.creators(i));
            sh += h;
            sd += d;
        }
        assertEq(sh, held);
        assertEq(sd, disputed);
    }

    function invariant_DisputedIdsMatchStatus() public view {
        uint256[] memory ids = hub.getDisputedEscrowIds();
        for (uint256 i; i < ids.length; ++i) {
            assertEq(uint8(hub.getEscrow(ids[i]).status), uint8(CreatorHubV2.EscrowStatus.Disputed));
        }
    }

    function invariant_CallSummary() public view {
        // keeps handler counters referenced (useful with -vv via forge's invariant report)
        assertGe(handler.calls(), handler.purchases());
    }
}
