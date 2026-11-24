/** Listing shape shared by V1 (legacy) and V2. V2 adds the optional fields. */
export interface Content {
  id: bigint
  creator: string
  title: string
  description: string
  coverImageUrl: string
  contentUrl: string
  priceUsdc: bigint
  totalSales: bigint
  totalEarnings: bigint
  isActive: boolean
  createdAt: bigint
  /** V2 only: sha256 commitment to the delivered files. */
  contentHash?: `0x${string}`
  /** V2 only: sum of all star ratings and the number of ratings. */
  ratingSum?: bigint
  ratingCount?: bigint
}

/** A V2 listing: every V2 field is present. */
export interface ContentV2 extends Content {
  contentHash: `0x${string}`
  ratingSum: bigint
  ratingCount: bigint
}

/** Mirrors the contract's EscrowStatus enum. */
export const EscrowStatus = {
  None: 0,
  Held: 1,
  Disputed: 2,
  Released: 3,
  Refunded: 4,
} as const
export type EscrowStatusValue = (typeof EscrowStatus)[keyof typeof EscrowStatus]

/** Mirrors the contract's Escrow struct (timestamps are unix seconds). */
export interface Escrow {
  id: bigint
  contentId: bigint
  buyer: `0x${string}`
  seller: `0x${string}`
  amount: bigint
  feeBps: bigint
  paidAt: bigint
  disputedAt: bigint
  status: number
}
