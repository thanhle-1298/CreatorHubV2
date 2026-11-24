import { useEffect, useRef, useState } from 'react'
import { useAccount, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { AlertTriangle, Clock, Loader2, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { activeChain } from '../config'
import { CREATOR_HUB_V2 } from '../contract'
import type { Escrow } from '../types'
import {
  DISPUTE_WINDOW_SECONDS,
  STATUS_META,
  arbiterDeadline,
  displayStatus,
  formatCountdown,
  windowEnd,
} from '../lib/escrow'
import { useNowSeconds } from '../lib/useNow'
import { parseOnchainError } from '../lib/utils'
import { EscrowStatusChip } from './EscrowBadge'

type Action = 'openDispute' | 'releaseEscrow' | 'claimTimeoutRefund'

const SUCCESS_TOAST: Record<Action, string> = {
  openDispute: 'Dispute opened. Funds are frozen for review.',
  releaseEscrow: 'Funds released to the seller.',
  claimTimeoutRefund: 'Refund issued. Withdraw it from My Purchases.',
}

interface DisputeWindowProps {
  escrow: Escrow
  /** buyer: can dispute / claim refund. seller: can release. viewer: read-only. */
  role: 'buyer' | 'seller' | 'viewer'
  /** Called after any action confirms so the parent can refetch. */
  onChanged?: () => void
}

/**
 * Escrow status for one purchase: chip, countdown, progress bar and the actions
 * the connected wallet is allowed to take (open dispute, release, claim refund).
 */
export default function DisputeWindow({ escrow, role, onChanged }: DisputeWindowProps) {
  const now = useNowSeconds(30_000)
  const { chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongChain = !!chainId && chainId !== activeChain.id

  const status = displayStatus(escrow, now)
  const meta = STATUS_META[status]

  const { writeContract, data: txHash, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })
  const lastAction = useRef<Action | null>(null)
  const [confirmDispute, setConfirmDispute] = useState(false)
  const busy = isPending || isConfirming

  useEffect(() => {
    if (!isSuccess || !lastAction.current) return
    toast.success(SUCCESS_TOAST[lastAction.current])
    lastAction.current = null
    setConfirmDispute(false)
    reset()
    onChanged?.()
  }, [isSuccess, onChanged, reset])

  const run = (action: Action) => {
    if (wrongChain) {
      switchChain({ chainId: activeChain.id })
      return
    }
    lastAction.current = action
    writeContract(
      { ...CREATOR_HUB_V2, functionName: action, args: [escrow.id], chainId: activeChain.id },
      {
        onError: (e) => {
          lastAction.current = null
          toast.error(parseOnchainError(e))
        },
      },
    )
  }

  const end = windowEnd(escrow)
  const secondsLeft = end - now
  const elapsedPct = Math.max(0, Math.min(100, ((DISPUTE_WINDOW_SECONDS - secondsLeft) / DISPUTE_WINDOW_SECONDS) * 100))
  const refundReady = status === 'disputed' && now >= arbiterDeadline(escrow)

  const btn =
    'inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3.5 py-2.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ background: 'rgba(255,255,255,0.75)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <EscrowStatusChip status={status} />
        {status === 'in_window' && (
          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--muted)' }}>
            <Clock size={12} /> {formatCountdown(secondsLeft)} left to dispute
          </span>
        )}
        {status === 'disputed' && !refundReady && (
          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--muted)' }}>
            <Clock size={12} /> Arbiter deadline in {formatCountdown(arbiterDeadline(escrow) - now)}
          </span>
        )}
      </div>

      {status === 'in_window' && (
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ background: 'rgba(18,45,69,0.08)' }}
          role="progressbar"
          aria-valuenow={Math.round(elapsedPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Dispute window progress"
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${elapsedPct}%`, background: meta.color, transition: 'width 600ms ease' }}
          />
        </div>
      )}

      <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
        {role === 'seller' ? sellerHint(status) : meta.hint}
      </p>

      {/* Buyer: open dispute (two-step confirm) */}
      {role === 'buyer' && status === 'in_window' && (
        <div>
          {!confirmDispute ? (
            <button
              type="button"
              onClick={() => setConfirmDispute(true)}
              className={btn}
              style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}
            >
              <ShieldAlert size={13} /> Open dispute
            </button>
          ) : (
            <div
              className="rounded-lg p-3 space-y-2 border"
              style={{ background: 'rgba(186,43,76,0.05)', borderColor: 'rgba(186,43,76,0.2)' }}
            >
              <p className="text-xs flex items-start gap-1.5" style={{ color: 'var(--danger)' }}>
                <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                This freezes the payment until the arbiter decides. They can refund you or release the funds to the seller.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run('openDispute')}
                  className={btn}
                  style={{ background: 'var(--danger)', color: 'white' }}
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : null}
                  {isPending ? 'Confirm in wallet…' : isConfirming ? 'Opening…' : 'Yes, open dispute'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDispute(false)}
                  className={btn}
                  style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Window closed: anyone can release; shown to the seller (who is paid) */}
      {role === 'seller' && status === 'window_closed' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run('releaseEscrow')}
          className={btn}
          style={{ background: 'var(--success)', color: 'white', boxShadow: '0 3px 10px rgba(26,128,71,0.22)' }}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : null}
          {isPending ? 'Confirm in wallet…' : isConfirming ? 'Releasing…' : 'Release funds to my balance'}
        </button>
      )}

      {/* Disputed and arbiter deadline passed: buyer can claim the refund */}
      {role !== 'seller' && refundReady && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run('claimTimeoutRefund')}
          className={btn}
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : null}
          {isPending ? 'Confirm in wallet…' : isConfirming ? 'Refunding…' : 'Claim refund'}
        </button>
      )}
    </div>
  )
}

function sellerHint(status: ReturnType<typeof displayStatus>): string {
  switch (status) {
    case 'in_window':
      return 'The buyer can still open a dispute. Funds release to you after the window ends.'
    case 'window_closed':
      return 'The dispute window ended with no dispute. Release the funds to move them to your balance.'
    case 'disputed':
      return 'The buyer opened a dispute. The arbiter will decide, or the buyer is refunded after 14 days.'
    case 'released':
      return 'Released. Your share is in your balance and ready to withdraw.'
    case 'refunded':
      return 'The buyer was refunded in full.'
    default:
      return ''
  }
}
