import { zeroAddress } from 'viem'
import type { Abi } from 'viem'
import v1Abi from './abi/CreatorHubV1.json'
import v2Abi from './abi/CreatorHubV2.json'
import { V1_ADDRESS, V2_ADDRESS } from './env'

// ── CreatorHub V2 (escrow + ratings). Address comes from env only. ──────────
/** True once VITE_CREATOR_HUB_V2_ADDRESS is set. Reads are disabled until then. */
export const V2_CONFIGURED = !!V2_ADDRESS
export const CREATOR_HUB_V2_ADDRESS = V2_ADDRESS ?? zeroAddress
export const CREATOR_HUB_V2_ABI = v2Abi as Abi

export const CREATOR_HUB_V2 = {
  address: CREATOR_HUB_V2_ADDRESS,
  abi: CREATOR_HUB_V2_ABI,
} as const

// ── CreatorHub V1 (legacy, immutable, read-only in the UI). ─────────────────
/** True when a V1 contract exists on the active network (mainnet only). */
export const LEGACY_AVAILABLE = !!V1_ADDRESS
export const CREATOR_HUB_ADDRESS = V1_ADDRESS ?? zeroAddress
export const CREATOR_HUB_ABI = v1Abi as Abi

/** The legacy V1 contract. Use only for reading old listings and purchases. */
export const CREATOR_HUB = {
  address: CREATOR_HUB_ADDRESS,
  abi: CREATOR_HUB_ABI,
} as const
