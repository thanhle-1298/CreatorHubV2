# CreatorHub

A fully onchain digital content marketplace built on Arc Testnet. Creators list content for a fixed USDC price; buyers pay once to unlock permanent access.

## Live Contract

| | |
|---|---|
| **Network** | Arc Testnet (chain ID 5042002) |
| **Address** | `0x28356dc770b3b4d04a5eead0bd5906e8d85e9ce7` |
| **Explorer** | [View on Arc Testnet Explorer](https://explorer.testnet.arc.io/address/0x28356dc770b3b4d04a5eead0bd5906e8d85e9ce7) |
| **USDC** | `0x3600000000000000000000000000000000000000` |
| **Protocol fee** | 2.5% (250 bps) |

---

## Features

### For Creators (Sellers)
- **List content** with title, description, cover image, price in USDC, and a content URL (file share link, gated to buyers)
- **Creator Dashboard** — total earnings, total sales, content count, and per-item stats
- **Manage listings** — hide/show content without deleting it; edit title, description, cover, and price
- **Withdraw earnings** — pull-payment model: accumulated USDC shown on the dashboard, withdrawn on demand

### For Buyers
- **Explore page** — responsive grid of all active listings with search, sort (newest/popular/price), and category filters
- **Content detail** — full description, creator, stats, and a two-step USDC Approve + Purchase flow
- **My Purchases** — every item you've bought, accessible in one place
- **Locked content URL** — only buyers (and the creator) can read the gated content link from the contract

---

## Architecture

### Smart Contract (`contracts/CreatorHub.sol`)

```
Ownable + Pausable + ReentrancyGuard
```

**Key design choices:**

- **Pull-payment pattern** — `purchaseContent` does not push USDC to the creator inline. Instead it credits `pendingWithdrawals[creator]`. Each creator/fee-recipient calls `withdraw()` to collect. This prevents a bad recipient from bricking purchases for everyone.
- **Price bound on purchase** — `purchaseContent(uint256 contentId, uint256 maxPriceUsdc)` reverts if the creator updates the price between the buyer's approval and their tx landing, protecting against front-running.
- **Private `contents` mapping** — the Solidity auto-getter is suppressed; all access goes through `getContent()` (which redacts `contentUrl` for non-buyers) and `getContentUrl()` (gated to buyer/creator).
- **Renounce ownership blocked while paused** — `renounceOwnership` reverts if paused, preventing a permanent brick.

**Core functions:**

| Function | Who calls it |
|---|---|
| `listContent(title, desc, coverUrl, contentUrl, priceUsdc)` | Creator |
| `updateContent(contentId, title, desc, coverUrl, priceUsdc)` | Creator |
| `setContentActive(contentId, bool)` | Creator |
| `purchaseContent(contentId, maxPriceUsdc)` | Buyer (requires prior USDC approval) |
| `withdraw()` | Creator / fee recipient |
| `getContent(contentId)` | Anyone (contentUrl redacted for non-buyers) |
| `getContentUrl(contentId)` | Buyer or creator only |
| `getActiveContentIds()` | Anyone |
| `getCreatorStats(creator)` | Anyone |
| `getBuyerPurchases(buyer)` | Anyone |
| `setProtocolFee(bps)` | Owner only (max 10%) |
| `setFeeRecipient(addr)` | Owner only |
| `pause() / unpause()` | Owner only |

### Frontend (`src/`)

```
src/App.tsx              ← routing shell (explore / purchases / dashboard / list)
src/contract.ts          ← contract address + ABI
src/types.ts             ← Content type
src/lib/utils.ts         ← formatUsdc, parseUsdcAmount, parseOnchainError, timeAgo
src/lib/share.ts         ← getShareBase / buildShareLink
src/components/
  Navbar.tsx             ← sticky nav + mobile bottom nav
  ContentCard.tsx        ← grid card
  ContentDetail.tsx      ← detail view with approve/purchase flow
  ExplorePage.tsx        ← explore grid with search + sort + filter
  PurchasesPage.tsx      ← buyer's purchases
  DashboardPage.tsx      ← creator stats, listings table, withdraw
  ListContentPage.tsx    ← new content form
```

**Stack:** React + TypeScript + Vite + Tailwind CSS + wagmi v2 + ConnectKit + viem

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/)
- A browser wallet (MetaMask or similar)

### Run locally

```bash
bun install
bun run dev
```

App starts at `http://localhost:5173`.

### Get testnet USDC

Use the **Get test USDC** button in the Arc Studio sidebar, or connect your wallet and use any Arc Testnet faucet.

### Try it out

1. Connect your wallet and switch to Arc Testnet
2. Go to **Explore** to browse listed content
3. Click any item and follow the two-step Approve + Buy flow
4. Go to **My Purchases** to access your unlocked content
5. Go to **Dashboard** to list your own content and track earnings

---

## Security

The contract was reviewed at **balanced severity** (Critical + High findings) with two independent analyses before deployment. Key findings resolved:

- `nonReentrant` placed before `whenNotPaused` on all state-changing entrypoints
- Pull-payment pattern eliminates push-payout revert risk
- `contents` mapping made private to remove auto-generated public getter for `contentUrl`
- `renounceOwnership` blocked while paused
- Admin configuration changes (`setProtocolFee`, `setFeeRecipient`) emit events
- `purchaseContent` accepts a `maxPriceUsdc` bound to prevent price front-running

> This contract has not received a paid third-party audit. Do not use with real funds on mainnet without one.

---

## License

MIT
