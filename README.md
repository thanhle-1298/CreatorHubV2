# CreatorHub

A marketplace where designers and creators sell digital content (templates, UI kits, photos, fonts, code) for USDC on Arc. Buyers pay once, unlock instantly, and are protected by a 5-day escrow.

Built with [Arc Studio](https://studio.arc.io)

## What you can do

**Buyers**
- Browse and search listings, filter by category and minimum rating, sort by top rated.
- Pay in USDC and unlock the creator's link immediately.
- Keep the payment in escrow for 5 days. Open a dispute before the window ends if the delivery is wrong.
- Check a downloaded file against the creator's committed SHA-256 hash, right in the browser (the file is never uploaded).
- Rate a listing from 1 to 5 stars with an optional review. Only verified buyers can rate, once each.
- See every purchase's status: in dispute window, window closed, disputed, released or refunded.

**Creators**
- List content with a title, description, cover image, private link, price and a required content hash.
- See average rating, sales, pending escrow, frozen disputed funds and withdrawable earnings on the dashboard.
- Release matured escrows, withdraw earnings, hide or show listings, and rotate the private link.

**Arbiter**
- A dedicated Disputes tab for the arbiter wallet to refund the buyer in full or release the funds to the seller. Unresolved disputes refund the buyer after 14 days.

**Legacy purchases**
Purchases made on the original contract (paid directly, no escrow) remain available under My Purchases with their links intact. Creators who earned on the original contract can still withdraw those earnings from the dashboard.

## Tech stack

- React, TypeScript, Vite, Tailwind CSS
- wagmi, viem, ConnectKit for wallet connection
- Solidity (Foundry) for the marketplace contract, OpenZeppelin libraries

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://book.getfoundry.sh).

```bash
bun install
cp .env.example .env   # then fill in the values below
bun run dev
```

Other commands:

```bash
bun run build            # production build into dist/
bun run check            # lint and typecheck
bun run contracts:build  # compile contracts
bun run contracts:test   # run the Foundry test suite
```

### Environment variables

All values are public and ship to the browser. Never put secrets in them.

| Variable | Purpose |
| --- | --- |
| `VITE_NETWORK` | `mainnet` (default) or `testnet`. Chooses which Arc network the app uses. |
| `VITE_CREATOR_HUB_V2_ADDRESS` | Address of the escrow marketplace contract. Required for browsing, listing and buying. |
| `VITE_CREATOR_HUB_V1_ADDRESS` | Optional. The original contract, shown as Legacy. Defaults to the live mainnet one on mainnet. |
| `VITE_RPC_URL` | Optional. Your own RPC URL for the selected network. |
| `VITE_APP_URL` | Optional. The public URL of your deployment, for example your custom domain. Used for the canonical address and share links. |

`RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN` and `RPC_PROXY_CHAINS` may be present when running inside Arc Studio. They are optional and not read by the frontend.

## Deploying and custom domains

The app is a static site with no hard-coded domains or addresses.

1. Set the variables above in your host's environment settings.
2. Run `bun run build` and publish the `dist/` folder to any static host.
3. Point your custom domain at that host and set `VITE_APP_URL` to the final URL.

To move to a new contract or network, change the variables and rebuild. No code changes are needed.

For the exact production values, DNS steps and a go-live checklist, see [docs/custom-domain.md](docs/custom-domain.md).

## Moving from the original contract to the escrow contract

The original contract is immutable, so the escrow version is a new contract at a new address.

- Existing buyers keep their links and purchase history under Legacy purchases.
- Existing creators keep access to their old earnings and re-list their content on the new contract, adding a content hash.
- The original listings are labelled "Legacy, no escrow" and do not appear in Explore.

## Good to know

- A blockchain is public. The app only shows a private link to wallets that paid, but a technical user can read data stored in a contract. Use links you can rotate, and update them from the dashboard if one leaks.
- The content hash proves what the creator committed to. It does not prove the quality of the files.
- Get an independent security review before holding real funds in the contract.
