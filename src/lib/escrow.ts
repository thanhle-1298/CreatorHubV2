import { EscrowStatus, type Escrow } from '../types'

/** Must match DISPUTE_WINDOW and ARBITER_TIMEOUT in CreatorHubV2.sol. */
export const DISPUTE_WINDOW_SECONDS = 5 * 24 * 60 * 60
export const ARBITER_TIMEOUT_SECONDS = 14 * 24 * 60 * 60

/** Unix second at which the buyer can no longer open a dispute. */
export function windowEnd(escrow: Pick<Escrow, 'paidAt'>): number {
  return Number(escrow.paidAt) + DISPUTE_WINDOW_SECONDS
}

/** Unix second after which an unresolved dispute refunds the buyer. */
export function arbiterDeadline(escrow: Pick<Escrow, 'disputedAt'>): number {
  return Number(escrow.disputedAt) + ARBITER_TIMEOUT_SECONDS
}

export type DisplayStatus =
  | 'in_window'
  | 'window_closed'
  | 'disputed'
  | 'released'
  | 'refunded'
  | 'none'

/** The status shown to users. `window_closed` = Held, past day 5, release pending. */
export function displayStatus(escrow: Pick<Escrow, 'status' | 'paidAt'>, nowSec: number): DisplayStatus {
  switch (escrow.status) {
    case EscrowStatus.Held:
      return nowSec < windowEnd(escrow) ? 'in_window' : 'window_closed'
    case EscrowStatus.Disputed:
      return 'disputed'
    case EscrowStatus.Released:
      return 'released'
    case EscrowStatus.Refunded:
      return 'refunded'
    default:
      return 'none'
  }
}

export interface StatusMeta {
  label: string
  /** Short explanation shown under the badge. */
  hint: string
  color: string
  bg: string
}

export const STATUS_META: Record<DisplayStatus, StatusMeta> = {
  in_window: {
    label: 'In dispute window',
    hint: 'Your link is unlocked. You can open a dispute until the window ends.',
    color: '#1061a6',
    bg: 'rgba(16,97,166,0.10)',
  },
  window_closed: {
    label: 'Window closed',
    hint: 'The dispute window has ended. Funds are ready to release to the seller.',
    color: '#92400e',
    bg: 'rgba(245,158,11,0.14)',
  },
  disputed: {
    label: 'Disputed',
    hint: 'Funds are frozen while the arbiter reviews. If unresolved in 14 days, you are refunded.',
    color: '#ba2b4c',
    bg: 'rgba(186,43,76,0.10)',
  },
  released: {
    label: 'Released',
    hint: 'Funds were released to the seller. This purchase is final.',
    color: '#1a8047',
    bg: 'rgba(26,128,71,0.12)',
  },
  refunded: {
    label: 'Refunded',
    hint: 'You were refunded in full. Access to the link was removed.',
    color: '#475569',
    bg: 'rgba(71,85,105,0.12)',
  },
  none: { label: 'No purchase', hint: '', color: '#475569', bg: 'rgba(71,85,105,0.10)' },
}

/** "4d 3h", "5h 12m", "9m", "under a minute". */
export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'now'
  const d = Math.floor(totalSeconds / 86400)
  const h = Math.floor((totalSeconds % 86400) / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return 'under a minute'
}

/** Average star rating (0 when unrated) from on-chain sum and count. */
export function averageRating(ratingSum?: bigint, ratingCount?: bigint): number {
  const count = Number(ratingCount ?? 0n)
  if (count === 0) return 0
  return Number(ratingSum ?? 0n) / count
}

/** Decode a getEscrow() tuple result into an Escrow. */
export function toEscrow(raw: unknown): Escrow | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  return raw as Escrow
}
