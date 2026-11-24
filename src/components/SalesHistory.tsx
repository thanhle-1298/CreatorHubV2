import { useMemo, useState } from 'react'
import { useReadContracts } from 'wagmi'
import { Receipt } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { activeChain } from '../config'
import { CREATOR_HUB_V2, V2_CONFIGURED } from '../contract'
import type { ContentV2, Escrow } from '../types'
import { useV2Contents } from '../hooks/useV2Contents'
import { useNowSeconds } from '../lib/useNow'
import { displayStatus } from '../lib/escrow'
import { formatAddress, formatUsdc, timeAgo } from '../lib/utils'
import DisputeWindow from './DisputeWindow'

const PAGE = 6

interface SalesHistoryProps {
  address: `0x${string}`
  onChanged: () => void
}

/** Every escrowed sale for this seller with its status and the actions they can take. */
export default function SalesHistory({ address, onChanged }: SalesHistoryProps) {
  const now = useNowSeconds(30_000)
  const [shown, setShown] = useState(PAGE)

  const { data: idsData, isLoading: idsLoading, refetch: refetchIds } = useReadContracts({
    contracts: [{ ...CREATOR_HUB_V2, functionName: 'getCreatorEscrowIds', args: [address], chainId: activeChain.id }],
    query: { enabled: V2_CONFIGURED, refetchInterval: 15_000 },
  })
  const ids = useMemo(() => [...((idsData?.[0]?.result as bigint[] | undefined) ?? [])].reverse(), [idsData])

  const { data: escrowsData, isLoading: escrowsLoading, refetch: refetchEscrows } = useReadContracts({
    contracts: ids.map((id) => ({ ...CREATOR_HUB_V2, functionName: 'getEscrow' as const, args: [id] as [bigint], chainId: activeChain.id })),
    query: { enabled: V2_CONFIGURED && ids.length > 0, refetchInterval: 20_000 },
  })
  const escrows = useMemo(
    () => (escrowsData ?? []).map((d) => d.result as Escrow | undefined).filter((e): e is Escrow => !!e),
    [escrowsData],
  )

  const contentIds = useMemo(
    () => Array.from(new Set(escrows.map((e) => e.contentId.toString()))).map((s) => BigInt(s)),
    [escrows],
  )
  const { contents } = useV2Contents(contentIds)
  const titleById = useMemo(() => {
    const m = new Map<string, ContentV2>()
    contents.forEach((c) => m.set(c.id.toString(), c))
    return m
  }, [contents])

  // Sales that need the seller's attention (window closed) come first.
  const sorted = useMemo(
    () =>
      [...escrows].sort((a, b) => {
        const rank = (e: Escrow) => (displayStatus(e, now) === 'window_closed' ? 0 : 1)
        return rank(a) - rank(b)
      }),
    [escrows, now],
  )

  const refresh = () => { void refetchIds(); void refetchEscrows(); onChanged() }
  const loading = idsLoading || (ids.length > 0 && escrowsLoading)

  return (
    <section className="mb-10" aria-labelledby="sales-heading">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Receipt size={17} style={{ color: 'var(--accent)' }} />
          <h2 id="sales-heading" className="font-semibold text-lg" style={{ color: 'var(--ink)' }}>Sales history</h2>
        </div>
        <span className="text-sm" style={{ color: 'var(--muted)' }}>{escrows.length} sale{escrows.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        </div>
      ) : escrows.length === 0 ? (
        <div className="text-center py-10 rounded-2xl border text-sm" style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--muted)' }}>
          No sales yet. When someone buys, the payment appears here with its escrow status.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {sorted.slice(0, shown).map((escrow) => {
              const content = titleById.get(escrow.contentId.toString())
              const sellerShare = escrow.amount - (escrow.amount * escrow.feeBps) / 10_000n
              return (
                <div
                  key={escrow.id.toString()}
                  className="rounded-2xl border p-4 space-y-3"
                  style={{ background: 'rgba(255,255,255,0.9)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--ink)' }}>{content?.title ?? `Listing #${escrow.contentId.toString()}`}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                        Buyer {formatAddress(escrow.buyer)} · {timeAgo(escrow.paidAt)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="flex items-center gap-1 justify-end text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                        <TokenUSDC size={13} variant="branded" /> {formatUsdc(escrow.amount)}
                      </div>
                      <p className="text-xs" style={{ color: 'var(--subtle)' }}>You get {formatUsdc(sellerShare)}</p>
                    </div>
                  </div>
                  <DisputeWindow escrow={escrow} role="seller" onChanged={refresh} />
                </div>
              )
            })}
          </div>
          {sorted.length > shown && (
            <div className="text-center mt-4">
              <button
                onClick={() => setShown((n) => n + PAGE)}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold border"
                style={{ background: 'var(--surface-strong)', color: 'var(--accent)', borderColor: 'var(--border)' }}
              >
                Show more
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
