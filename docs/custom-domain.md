# Putting CreatorHub on your own domain

CreatorHub is a static site. Nothing in the code is tied to a domain, so going live on your own domain is a hosting and settings task.

## 1. Production settings (Arc Mainnet)

Set these in your host's environment settings for the **build**:

| Variable | Value |
| --- | --- |
| `VITE_CREATOR_HUB_V2_ADDRESS` | `0x06dF56c861847c697986fe08e76e76B96201CA99` |
| `VITE_APP_URL` | your final address, for example `https://creatorhub.example.com` |
| `VITE_RPC_URL` | optional: your own Arc Mainnet RPC URL (see below) |
| `VITE_NETWORK` | `mainnet`, or leave it unset (the app defaults to Arc Mainnet, chain 5042) |

The original contract is built in as the "Legacy purchases" source on mainnet. You only need `VITE_CREATOR_HUB_V1_ADDRESS` if you ever move it.

These values are public and end up in the browser bundle. Never put a secret in a `VITE_` variable. If your RPC provider URL contains a private key, restrict that key to your domain in the provider's dashboard instead.

## 2. Build and publish

```bash
bun install
bun run build
```

Publish the `dist/` folder on any static host (Cloudflare Pages, Netlify, Vercel, S3 + CDN, and so on). Set the variables above in the host so they are present when the host runs the build, or build locally with a `.env` file and upload `dist/`.

The app has no page URLs of its own (navigation happens inside one page), so no redirect or rewrite rules are needed.

## 3. Connect the domain

1. Add your domain in the host's dashboard and follow its DNS instructions (usually a CNAME for `www` and an A/ALIAS record for the root).
2. Turn on HTTPS. Wallets and the file hash checker need a secure page.
3. Set `VITE_APP_URL` to the final `https://` address and rebuild. This sets the canonical address used by search engines and share links.

## 4. Go-live checklist

- [ ] Open the site and confirm the network badge shows **Arc** (not Arc Testnet).
- [ ] Connect a wallet on Arc Mainnet; the app asks to switch if the wallet is on another network.
- [ ] Explore loads with no error banner (it shows the empty state until the first listing exists).
- [ ] List a low-priced test item from one wallet, buy it from a second wallet, and open the link.
- [ ] Rate the item, open a dispute on a second small purchase, and resolve it from the arbiter wallet (the Disputes tab).
- [ ] Check My Purchases shows older purchases under Legacy purchases (if you had any).
- [ ] The creator dashboard shows pending escrow and the withdraw button after a release.

## 5. Things to know before real users arrive

- **Arbiter and owner:** both are the wallet `0x7E827996Cd8C6bac4aaAB76fa8b212ee4F44c1cB`. Consider moving them to a multisig and keep the arbiter wallet funded with a little USDC for gas, because only it can resolve disputes.
- **Public RPC:** the default public Arc RPC may rate-limit under load. Set `VITE_RPC_URL` to your own provider for a busy launch.
- **Contract review:** the deployed contract was compiled with your own settings. It is not byte-identical to the build that was reviewed and tested. Verify its source on the explorer and get an independent audit before it holds meaningful funds.
- **Private links:** a blockchain is public, so a technical user could read a stored link without paying. Encourage creators to use links they can rotate.
