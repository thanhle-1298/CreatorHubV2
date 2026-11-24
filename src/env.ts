/**
 * Typed environment access. This is the ONLY place deployment-specific values
 * (network, contract addresses, RPC, public app URL) are read, so moving the
 * app to a custom domain or another network is a configuration change.
 *
 * All values are public (they ship to the browser). Never put secrets here.
 */
import { getAddress, isAddress } from 'viem'

export type AppNetwork = 'mainnet' | 'testnet'

const env = import.meta.env

function parseAddress(value: string | undefined): `0x${string}` | undefined {
  const v = value?.trim()
  // strict:false accepts a wrong-case paste; getAddress then normalises to EIP-55.
  return v && isAddress(v, { strict: false }) ? getAddress(v) : undefined
}

/** Which Arc network the app talks to. Defaults to mainnet. */
export const NETWORK: AppNetwork = env.VITE_NETWORK === 'testnet' ? 'testnet' : 'mainnet'

/** CreatorHub V2 (escrow + ratings). Required for the marketplace to work. */
export const V2_ADDRESS = parseAddress(env.VITE_CREATOR_HUB_V2_ADDRESS)

/**
 * CreatorHub V1 (legacy, immutable, read-only in the UI). It only exists on Arc
 * mainnet, so the built-in default applies to mainnet builds only.
 */
const V1_MAINNET_DEFAULT = '0xcD68a0B299B51C67CfdbaE5Ff319DFBA2C9AF062'
export const V1_ADDRESS =
  parseAddress(env.VITE_CREATOR_HUB_V1_ADDRESS) ??
  (NETWORK === 'mainnet' ? getAddress(V1_MAINNET_DEFAULT) : undefined)

/** Optional RPC override (for example a provider URL with your own key). */
export const RPC_URL: string | undefined = env.VITE_RPC_URL?.trim() || undefined

/** Optional public URL of the deployed app (custom domain), used for share links. */
export const APP_URL: string | undefined = env.VITE_APP_URL?.trim().replace(/\/$/, '') || undefined
