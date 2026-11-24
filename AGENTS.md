# CreatorHub — Agent Memory

## Project
Content marketplace dApp on Arc. Creators list digital content for USDC; buyers pay into a 5-day escrow and unlock access immediately.

## Contracts

### CreatorHubV2 (escrow + ratings) — source `contracts/CreatorHubV2.sol`
- Constructor: `(usdcToken, initialOwner, initialArbiter)`. Fee recipient defaults to the owner.
- Escrow: 5-day dispute window, permissionless release after it, arbiter resolves disputes (full refund or full release only), 14-day timeout refunds the buyer. Fee (2.5%) is snapshotted per purchase and taken at release. All payouts are pull payments through `withdraw()`.
- `contentHash` (bytes32) is required and immutable. Ratings: verified, non-refunded buyers only, once each, average/count on-chain, review text only in the `ContentRated` event (state keeps the hash).
- `getContentUrl` authorises on `msg.sender`: frontend reads MUST pass `account: address` or the call reverts (msg.sender would be address(0)).
- Known limitation: `contentUrl` is stored in plaintext, so it is readable from chain state by technical users. Documented in the UI and README.
- Tests: `contracts/test/CreatorHubV2*.t.sol` (88 passing: unit, fuzz, solvency invariant).
- **Deployment status:** Arc mainnet (chain 5042): `0x06dF56c861847c697986fe08e76e76B96201CA99`, deployed by the user (solc 0.8.28 + optimizer; owner, arbiter and fee recipient = `0x7E827996Cd8C6bac4aaAB76fa8b212ee4F44c1cB`). Selected by `VITE_CREATOR_HUB_V2_ADDRESS` (`netlify.toml` `[build.environment]` for Netlify builds, local `.env` for dev); `VITE_NETWORK` is unset (mainnet default). NOTE: deployed runtime code is 12,362 bytes; this repo's build is 12,448 bytes (paris, 200 runs; no tested setting reproduces 12,362, probably a different OpenZeppelin version or compiler settings). All 47 ABI selectors are present; state looks right (fee 250 bps, USDC 0x3600..., 0 listings). Not byte-identical to the reviewed build. Superseded mainnet deploy: `0x655afb37b7756Ace688df0E4357F5596e7aF831f` (21,167 bytes, solc 0.8.34, empty). Arc Testnet verification copy: `0x8815004dd69007e83450a5b690765532b62ad8a5`. Arc Studio never deploys to mainnet.

### CreatorHub V1 (legacy, live on Arc mainnet, immutable)
- Address: `0xcD68a0B299B51C67CfdbaE5Ff319DFBA2C9AF062` (chain 5042). Default for `VITE_CREATOR_HUB_V1_ADDRESS` on mainnet.
- Source archived at `archive/CreatorHubV1.sol.txt` (outside `contracts/` on purpose so it is not compiled or confused with V2). Frozen ABI: `src/abi/CreatorHubV1.json`.
- Read-only in the UI (Legacy purchases, legacy earnings withdraw).

### Older deployments (superseded, do not use)
- `0x3887972ADB950AE3DaDD8289B4E460eEE6350299` (mainnet, first contract, no `updateContentUrl`)
- `0x28356dc770b3b4d04a5eead0bd5906e8d85e9ce7` (testnet)

## Networks
- Arc mainnet: chain 5042, `https://rpc.mainnet.arc.io`. Arc testnet: chain 5042002. Chain facts come from `src/onchain-facts.ts` only.
- `VITE_NETWORK` selects the active chain (default mainnet). Read env ONLY through `src/env.ts`.

## Frontend Architecture
- `src/env.ts` — typed env (network, V1/V2 addresses, RPC, app URL). `.env.example` documents each.
- `src/config.ts` — wagmi config, `activeChain`, `arcMainnet`, `arcTestnet`.
- `src/contract.ts` — `CREATOR_HUB_V2` (+ `V2_CONFIGURED`), legacy `CREATOR_HUB` (+ `LEGACY_AVAILABLE`). ABIs in `src/abi/`.
- `src/types.ts` — `Content`, `ContentV2`, `Escrow`, `EscrowStatus`.
- `src/lib/escrow.ts` (status/countdown helpers), `src/lib/hash.ts` (SHA-256 in browser), `src/lib/useNow.ts`, `src/lib/utils.ts`.
- `src/hooks/useV2Contents.ts` — batch-load V2 listings with the connected account.
- Components: `ExplorePage`, `ContentCard`, `ContentDetail`, `ContentLinkPanel`, `RatingPanel`, `HashVerifier`, `DisputeWindow`, `StarRating`, `EscrowBadge`, `PurchasesPage`, `LegacyPurchases`, `DashboardPage`, `EarningsCard`, `SalesHistory`, `ListContentPage`, `ArbiterPage`, `Navbar`.

## Gotchas
- Never hard-code an address or domain outside `src/env.ts`. Wrong-case address pastes are normalised with `getAddress`.
- Never commit `.env` / `.envcat` (both gitignored). A `.env` with real Circle/RPC-proxy secrets was once pushed to the public GitHub repo; those keys must be treated as leaked.
- GitHub "Add files via upload" dropped every folder (`src/`, `contracts/`, `scripts/`, `docs/`, `archive/`); push with git so directories are included. Until then `src/main.tsx` is a temporary "being updated" placeholder so Netlify builds pass; the real source replaces it.
- The platform deployer wallet is shared and must not be used as owner/arbiter/fee recipient for anything real.

## Custom domain
- Static site, no hard-coded domains. Production settings and go-live checklist: `docs/custom-domain.md`.
- `src/env.ts` is the only place env values are read. `VITE_APP_URL` drives the canonical URL (`src/lib/seo.ts`) and share links (`src/lib/share.ts`).
- The Hugging Face Space still serves an older testnet build until it is redeployed.
