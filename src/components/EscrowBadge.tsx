import { ShieldCheck, History } from 'lucide-react'
import { STATUS_META, type DisplayStatus } from '../lib/escrow'

/** "Escrow protected" pill shown on every V2 listing. */
export function EscrowProtectedBadge({ compact }: { compact?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-lg font-semibold"
      style={{
        background: 'rgba(26,128,71,0.12)',
        color: '#1a8047',
        padding: compact ? '3px 7px' : '5px 10px',
        fontSize: compact ? 11 : 12,
      }}
      title="Payments are held in escrow for 5 days. You can open a dispute before funds are released."
    >
      <ShieldCheck size={compact ? 11 : 13} />
      Escrow protected
    </span>
  )
}

/** Marks a V1 listing/purchase: paid directly, no escrow, no content hash. */
export function LegacyBadge({ compact }: { compact?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-lg font-semibold"
      style={{
        background: 'rgba(71,85,105,0.12)',
        color: '#475569',
        padding: compact ? '3px 7px' : '5px 10px',
        fontSize: compact ? 11 : 12,
      }}
      title="Legacy listing: paid directly to the seller, with no escrow and no content hash."
    >
      <History size={compact ? 11 : 13} />
      Legacy · no escrow
    </span>
  )
}

/** Colored status chip for a purchase: in window / closed / disputed / released / refunded. */
export function EscrowStatusChip({ status }: { status: DisplayStatus }) {
  const meta = STATUS_META[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold"
      style={{ background: meta.bg, color: meta.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  )
}
