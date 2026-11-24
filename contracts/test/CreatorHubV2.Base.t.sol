// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {CreatorHubV2} from "../CreatorHubV2.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @dev Shared fixtures/helpers. Contains NO test functions.
abstract contract CreatorHubV2TestBase is Test {
    CreatorHubV2 internal hub;
    MockUSDC internal usdc;

    address internal owner = makeAddr("owner"); // also initial feeRecipient
    address internal arbiter = makeAddr("arbiter");
    address internal creator = makeAddr("creator");
    address internal buyer = makeAddr("buyer");
    address internal buyer2 = makeAddr("buyer2");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant PRICE = 100e6;
    bytes32 internal constant HASH = keccak256("content-v1");
    uint256 internal constant WINDOW = 5 days;
    uint256 internal constant TIMEOUT = 14 days;

    function setUp() public virtual {
        vm.warp(1_700_000_000);
        usdc = new MockUSDC();
        hub = new CreatorHubV2(address(usdc), owner, arbiter);
        address[3] memory buyers = [buyer, buyer2, stranger];
        for (uint256 i; i < buyers.length; ++i) {
            usdc.mint(buyers[i], 1_000_000e6);
            vm.prank(buyers[i]);
            usdc.approve(address(hub), type(uint256).max);
        }
    }

    function _list(uint256 price) internal returns (uint256 id) {
        vm.prank(creator);
        hub.listContent("Title", "Desc", "ipfs://cover", "https://secret/url", HASH, price);
        id = hub.contentCount();
    }

    function _buy(address who, uint256 contentId) internal returns (uint256 escrowId) {
        vm.prank(who);
        hub.purchaseContent(contentId, type(uint256).max);
        escrowId = hub.getEscrowIdFor(who, contentId);
    }

    /// list at PRICE and buy as `buyer`
    function _listAndBuy() internal returns (uint256 contentId, uint256 escrowId) {
        contentId = _list(PRICE);
        escrowId = _buy(buyer, contentId);
    }

    function _dispute(address who, uint256 escrowId) internal {
        vm.prank(who);
        hub.openDispute(escrowId);
    }

    function _status(uint256 escrowId) internal view returns (CreatorHubV2.EscrowStatus) {
        return hub.getEscrow(escrowId).status;
    }

    function _fee(uint256 amount, uint256 bps) internal pure returns (uint256) {
        return amount * bps / 10_000;
    }
}
