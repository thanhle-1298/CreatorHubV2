import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useAccount, useReadContract, useReadContracts, useSwitchChain, useWaitForTransactionReceipt, useWriteContract,
} from 'wagmi'
import { Gavel, Loader2, ShieldCheck, Undo2, Clock } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { toast } from 'sonner'
import { activeChain } from '../config'
import { CREATOR_HUB_V2, V2_CONFIGURED } from '../contract'
import type { ContentV2, Escrow } from '../types'
import { useV2Contents } from '../hooks/useV2Contents'
import { useNowSeconds } from '../lib/useNow'
import { arbiterDeadline, formatCountdown } from '../lib/escrow'
import { formatAddress, formatUsdc, parseOnchainError, timeAgo } from '../lib/utils'

/** Arbiter-only: review disputed purchases and choose a full refund or a full release. */
export default function ArbiterPage() {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const now = useNowSeconds(30_000)
  const wrongChain = !!chainId && chainId !== activeChain.id

  const { data: arbiter } = useReadContract({
    ...CREATOR_HUB_V2, functionName: 'arbiter', chainId: activeChain.id, query: { enabled: V2_CONFIGURED },
  })
  const isArbiter = !!address && !!arbiter && (arbiter as string).toLowerCase() === address.toLowerCase()

  const { data: idsData, isLoading, isError, refetch: refetchIds } = useReadContracts({
    contracts: [{ ...CREATOR_HUB_V2, functionName: 'getDisputedEscrowIds', chainId: activeChain.id }],
    query: { enabled: V2_CONFIGURED && isArbiter, refetchInterval: 15_000 },
  })
  const ids = useMemo(() => (idsData?.[0]?.result as bigint[] | undefined) ?? [], [idsData])

  const { data: escrowsData, refetch: refetchEscrows } = useReadContracts({
    contracts: ids.map((id) => ({ ...CREATOR_HUB_V2, functionName: 'getEscrow' as const, args: [id] as [bigint], chainId: activeChain.id })),
    query: { enabled: V2_CONFIGURED && isArbiter && ids.length > 0 },
  })
  const escrows = useMemo(
    () => (escrowsData ?? []).map((d) => d.result as Escrow | undefined).filter((e): e is Escrow => !!e),
    [escrowsData],
  )
  const contentIds = useMemo(() => Array.from(new Set(escrows.map((e) => e.contentId.toString()))).map((s) => BigInt(s)), [escrows])
  const { contents } = useV2Contents(contentIds)
  const byId = useMemo(() => {
    const m = new Map<string, ContentV2>()
    contents.forEach((c) => m.set(c.id.toString(), c))
    return m
  }, [contents])

  const { writeContract, data: txHash, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })
  const [activeId, setActiveId] = useState<bigint | null>(null)
  const pendingMsg = useRef('')
  const busy = isPending || isConfirming

  useEffect(() => {
    if (!isSuccess || !pendingMsg.current) return
    toast.success(pendingMsg.current)
    pendingMsg.current = ''
    setActiveId(null)
    reset()
    void refetchIds()
    void refetchEscrows()
  }, [isSuccess, refetchIds, refetchEscrows, reset])

  const resolve = (escrow: Escrow, refundBuyer: boolean) => {
    if (wrongChain) { switchChain({ chainId: activeChain.id }); return }
    setActiveId(escrow.id)
    pendingMsg.current = refundBuyer ? 'Buyer refunded in full.' : 'Funds released to the seller.'
    writeContract(
      { ...CREATOR_HUB_V2, functionName: 'resolveDispute', args: [escrow.id, refundBuyer], chainId: activeChain.id },
      { onError: (e) => { pendingMsg.current = ''; setActiveId(null); toast.error(parseOnchainError(e)) } },
    )
  }

  if (!isArbiter) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <Gavel size={44} className="mx-auto mb-4" style={{ color: 'var(--subtle)' }} />
        <h2 className="display font-bold text-2xl mb-2" style={{ color: 'var(--ink)' }}>Arbiter only</h2>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect the arbiter wallet to review disputed purchases.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="display font-bold text-3xl" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Disputes</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          Decide each case: refund the buyer in full, or release the funds to the seller (minus the protocol fee). Unresolved disputes refund the buyer after 14 days.
        </p>
      </div>

      {isLoading && <div className="skeleton h-32 rounded-2xl" />}
      {isError && (
        <div className="rounded-2xl p-6 text-center border" style={{ background: 'rgba(186,43,76,0.04)', borderColor: 'rgba(186,43,76,0.14)' }} role="alert">
          <p className="font-semibold" style={{ color: 'var(--danger)' }}>Unable to load disputes</p>
          <button onClick={() => void refetchIds()} className="mt-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--accent)', color: 'white' }}>Retry</button>
        </div>
      )}
      {!isLoading && !isError && escrows.length === 0 && (
        <div className="text-center py-14 rounded-2xl border" style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)' }}>
          <ShieldCheck size={40} className="mx-auto mb-3" style={{ color: 'var(--success)' }} />
          <p className="font-semibold" style={{ color: 'var(--ink)' }}>No open disputes</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>New disputes appear here as buyers open them.</p>
        </div>
      )}

      <div className="space-y-4">
        {escrows.map((e) => {
          const content = byId.get(e.contentId.toString())
          const thisBusy = busy && activeId === e.id
          const conflict = [e.buyer.toLowerCase(), e.seller.toLowerCase()].includes((address ?? '').toLowerCase())
          return (
            <div key={e.id.toString()} className="rounded-2xl border p-5 space-y-4" style={{ background: 'rgba(255,255,255,0.9)', borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold" style={{ color: 'var(--ink)' }}>{content?.title ?? `Listing #${e.contentId.toString()}`}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                    Buyer {formatAddress(e.buyer)} · Seller {formatAddress(e.seller)} · disputed {timeAgo(e.disputedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-base font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>
                  <TokenUSDC size={15} variant="branded" /> {formatUsdc(e.amount)}
                </div>
              </div>
              <p className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
                <Clock size={12} /> Auto-refund to buyer in {formatCountdown(arbiterDeadline(e) - now)}
              </p>
              {content?.contentHash && (
                <p className="mono text-xs break-all" style={{ color: 'var(--subtle)' }}>Committed hash: {content.contentHash}</p>
              )}
              {conflict ? (
                <p className="text-xs" style={{ color: 'var(--danger)' }}>You are a party to this purchase and cannot resolve it.</p>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    disabled={busy}
                    onClick={() => resolve(e, true)}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
                    style={{ background: 'var(--accent)', color: 'white' }}
                  >
                    {thisBusy ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
                    Refund buyer
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => resolve(e, false)}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
                    style={{ background: 'var(--success)', color: 'white' }}
                  >
                    {thisBusy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                    Release to seller
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
