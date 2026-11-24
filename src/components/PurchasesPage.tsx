import { useEffect, useMemo, useRef } from 'react'
import { useAccount, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { activeChain } from '../config'
import {
  ShoppingBag, ExternalLink, Compass, Download, Loader2, AlertCircle,
  ImageIcon, RefreshCw, ArrowDownToLine, Star,
} from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { TokenUSDC } from '@web3icons/react'
import { CREATOR_HUB_V2, V2_CONFIGURED } from '../contract'
import { EscrowStatus, type ContentV2, type Escrow } from '../types'
import CardSkeleton from './CardSkeleton'
import DisputeWindow from './DisputeWindow'
import LegacyPurchases from './LegacyPurchases'
import { EscrowProtectedBadge, EscrowStatusChip } from './EscrowBadge'
import { useV2Contents } from '../hooks/useV2Contents'
import { useNowSeconds } from '../lib/useNow'
import { displayStatus } from '../lib/escrow'
import { formatUsdc, formatAddress, parseOnchainError, timeAgo } from '../lib/utils'

const TARGET_CHAIN_ID = activeChain.id

interface PurchasesPageProps {
  onSelectContent: (content: ContentV2) => void
  onBrowse?: () => void
}

interface PurchaseCardProps {
  escrow: Escrow
  content: ContentV2
  url: string | undefined
  urlLoading: boolean
  urlFailed: boolean
  onOpen: () => void
  onRetry: () => void
  onChanged: () => void
}

function PurchaseCard({ escrow, content, url, urlLoading, urlFailed, onOpen, onRetry, onChanged }: PurchaseCardProps) {
  const now = useNowSeconds(30_000)
  const status = displayStatus(escrow, now)
  const refunded = escrow.status === EscrowStatus.Refunded
  const ready = !!url && url.length > 0

  return (
    <div
      className="rounded-2xl border overflow-hidden flex flex-col"
      style={{
        background: 'rgba(255,255,255,0.9)',
        borderColor: 'var(--border)',
        boxShadow: '0 2px 8px rgba(18,45,69,0.06), inset 0 1px 0 rgba(255,255,255,0.7)',
      }}
    >
      <div className="flex gap-3 p-4">
        <button
          onClick={onOpen}
          className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
          style={{ background: 'var(--surface-muted)' }}
          aria-label={`Open ${content.title}`}
        >
          {content.coverImageUrl ? (
            <img
              src={content.coverImageUrl}
              alt={content.title}
              className="w-full h-full object-cover"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <ImageIcon size={24} style={{ color: 'var(--subtle)' }} />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <button onClick={onOpen} className="font-semibold text-sm text-left w-full line-clamp-1 hover:underline" style={{ color: 'var(--ink)' }}>
            {content.title}
          </button>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            by {formatAddress(content.creator)} · {timeAgo(escrow.paidAt)}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <TokenUSDC size={14} variant="branded" />
            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatUsdc(escrow.amount)}</span>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>USDC</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <EscrowStatusChip status={status} />
            <EscrowProtectedBadge compact />
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-3 flex-1">
        {/* Link access */}
        {!refunded && (
          <div className="rounded-xl p-3 border" style={{ background: 'rgba(26,128,71,0.05)', borderColor: 'rgba(26,128,71,0.18)' }}>
            {urlLoading && !ready && (
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                <Loader2 size={13} className="animate-spin" /> Fetching content link…
              </div>
            )}
            {urlFailed && !ready && !urlLoading && (
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--danger)' }}>
                  <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                  <span>Could not load the link. Retry to force a fresh read.</span>
                </div>
                <button onClick={onRetry} className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                  <RefreshCw size={11} /> Retry
                </button>
              </div>
            )}
            {ready && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold w-full px-3 py-2.5 rounded-lg"
                style={{ background: 'var(--success)', color: 'white', boxShadow: '0 2px 8px rgba(26,128,71,0.2)' }}
              >
                <Download size={13} /> Access Content <ExternalLink size={11} className="ml-auto" />
              </a>
            )}
            {!urlLoading && !urlFailed && !ready && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>The creator has not added a link yet.</p>
            )}
          </div>
        )}

        <DisputeWindow escrow={escrow} role="buyer" onChanged={onChanged} />

        <button
          onClick={onOpen}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-lg border transition-colors"
          style={{ color: 'var(--accent)', borderColor: 'var(--border)', background: 'var(--surface-strong)' }}
        >
          <Star size={12} /> Details, file check &amp; rating
        </button>
      </div>
    </div>
  )
}

/** Refunds and released earnings share one withdrawable balance in the contract. */
function RefundBalance({ address }: { address: `0x${string}` }) {
  const { data, refetch } = useReadContract({
    ...CREATOR_HUB_V2,
    functionName: 'pendingWithdrawals',
    args: [address],
    chainId: TARGET_CHAIN_ID,
    query: { enabled: V2_CONFIGURED, refetchInterval: 15_000 },
  })
  const amount = (data as bigint | undefined) ?? 0n
  const { writeContract, data: txHash, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })
  const started = useRef(false)

  useEffect(() => {
    if (!isSuccess || !started.current) return
    started.current = false
    toast.success('Withdrawn to your wallet.')
    reset()
    void refetch()
  }, [isSuccess, refetch, reset])

  if (amount === 0n) return null
  const busy = isPending || isConfirming

  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4 mb-6"
      style={{ background: 'rgba(26,128,71,0.06)', borderColor: 'rgba(26,128,71,0.22)' }}
    >
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Balance ready to withdraw</p>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>Refunds from disputes are credited here.</p>
      </div>
      <button
        disabled={busy}
        onClick={() => {
          started.current = true
          writeContract(
            { ...CREATOR_HUB_V2, functionName: 'withdraw', chainId: TARGET_CHAIN_ID },
            { onError: (e) => { started.current = false; toast.error(parseOnchainError(e)) } },
          )
        }}
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
        style={{ background: 'var(--success)', color: 'white', boxShadow: '0 3px 12px rgba(26,128,71,0.25)' }}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />}
        {isPending ? 'Confirm in wallet…' : isConfirming ? 'Withdrawing…' : `Withdraw ${formatUsdc(amount)} USDC`}
      </button>
    </div>
  )
}

export default function PurchasesPage({ onSelectContent, onBrowse }: PurchasesPageProps) {
  const { address, isConnected } = useAccount()

  // 1. The buyer's escrow ids
  const { data: idsData, isLoading: idsLoading, isError: idsError, refetch: refetchIds } = useReadContracts({
    contracts: [
      { ...CREATOR_HUB_V2, functionName: 'getBuyerEscrowIds', args: [address ?? '0x0000000000000000000000000000000000000000'], chainId: TARGET_CHAIN_ID },
    ],
    query: { enabled: V2_CONFIGURED && !!address, refetchInterval: 15_000 },
  })
  const escrowIds = useMemo(() => [...((idsData?.[0]?.result as bigint[] | undefined) ?? [])].reverse(), [idsData])

  // 2. Each escrow
  const { data: escrowsData, isLoading: escrowsLoading, refetch: refetchEscrows } = useReadContracts({
    contracts: escrowIds.map((id) => ({
      ...CREATOR_HUB_V2, functionName: 'getEscrow' as const, args: [id] as [bigint], chainId: TARGET_CHAIN_ID,
    })),
    query: { enabled: V2_CONFIGURED && escrowIds.length > 0, refetchInterval: 20_000 },
  })
  const escrows = useMemo(
    () => (escrowsData ?? []).map((d) => d.result as Escrow | undefined).filter((e): e is Escrow => !!e),
    [escrowsData],
  )

  // 3. The listings behind them
  const contentIds = useMemo(() => Array.from(new Set(escrows.map((e) => e.contentId.toString()))).map((s) => BigInt(s)), [escrows])
  const { contents, isLoading: contentsLoading, refetch: refetchContents } = useV2Contents(contentIds)
  const contentById = useMemo(() => {
    const m = new Map<string, ContentV2>()
    contents.forEach((c) => m.set(c.id.toString(), c))
    return m
  }, [contents])

  // 4. Gated links. `account` sets the eth_call sender, which the contract checks.
  const linkable = escrows.filter((e) => e.status !== EscrowStatus.Refunded)
  const { data: urlsData, isLoading: urlsLoading, refetch: refetchUrls } = useReadContracts({
    contracts: linkable.map((e) => ({
      ...CREATOR_HUB_V2, functionName: 'getContentUrl' as const, args: [e.contentId] as [bigint], chainId: TARGET_CHAIN_ID, account: address,
    })),
    query: { enabled: V2_CONFIGURED && !!address && linkable.length > 0, staleTime: 0, gcTime: 0 },
  })
  const urlByContent = useMemo(() => {
    const m = new Map<string, { url?: string; failed: boolean }>()
    linkable.forEach((e, i) => {
      const r = urlsData?.[i]
      m.set(e.contentId.toString(), { url: r?.result as string | undefined, failed: r?.status === 'failure' })
    })
    return m
  }, [linkable, urlsData])

  const refreshAll = () => {
    void refetchIds()
    void refetchEscrows()
    void refetchContents()
    void refetchUrls()
  }

  const loading = V2_CONFIGURED && (idsLoading || (escrowIds.length > 0 && (escrowsLoading || contentsLoading)))

  if (!isConnected) {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-20 text-center">
        <ShoppingBag size={48} className="mx-auto mb-4" style={{ color: 'var(--subtle)' }} />
        <h2 className="display font-bold text-2xl mb-2" style={{ color: 'var(--ink)' }}>My Purchases</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>Connect your wallet to see what you&apos;ve bought and its escrow status.</p>
        <div className="flex justify-center"><ConnectKitButton /></div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="display font-bold text-3xl text-balance" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>My Purchases</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          {escrows.length > 0
            ? `${escrows.length} purchase${escrows.length !== 1 ? 's' : ''}. Each shows its escrow status and dispute window.`
            : 'Your escrow-protected purchases appear here.'}
        </p>
      </div>

      {address && <RefundBalance address={address} />}

      {V2_CONFIGURED && idsError && (
        <div className="rounded-2xl p-6 text-center border mb-6" style={{ background: 'rgba(186,43,76,0.04)', borderColor: 'rgba(186,43,76,0.14)' }} role="alert">
          <p className="font-semibold mb-1" style={{ color: 'var(--danger)' }}>Unable to load your purchases</p>
          <button onClick={refreshAll} className="mt-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--accent)', color: 'white' }}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {Array.from({ length: 2 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : escrows.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {escrows.map((escrow) => {
            const content = contentById.get(escrow.contentId.toString())
            if (!content) return null
            const link = urlByContent.get(escrow.contentId.toString())
            return (
              <PurchaseCard
                key={escrow.id.toString()}
                escrow={escrow}
                content={content}
                url={link?.url}
                urlLoading={urlsLoading}
                urlFailed={!!link?.failed}
                onOpen={() => onSelectContent(content)}
                onRetry={() => void refetchUrls()}
                onChanged={refreshAll}
              />
            )
          })}
        </div>
      ) : (
        !idsError && (
          <div
            className="text-center py-16 rounded-2xl border flex flex-col items-center"
            style={{ background: 'rgba(255,255,255,0.72)', borderColor: 'var(--border)' }}
          >
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'var(--surface-muted)' }}>
              <ShoppingBag size={28} style={{ color: 'var(--subtle)' }} />
            </div>
            <h3 className="display font-bold text-xl mb-2" style={{ color: 'var(--ink)' }}>No purchases yet</h3>
            <p className="text-sm max-w-xs text-pretty mb-6" style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
              Browse the marketplace. Every purchase is held in escrow for 5 days so you can dispute a bad delivery.
            </p>
            {onBrowse && (
              <button
                onClick={onBrowse}
                className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                <Compass size={15} /> Go to Explore
              </button>
            )}
          </div>
        )
      )}

      <LegacyPurchases />
    </div>
  )
}
