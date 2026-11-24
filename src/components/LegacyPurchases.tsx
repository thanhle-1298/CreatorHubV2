import { useMemo } from 'react'
import { useAccount, useReadContracts } from 'wagmi'
import { arcMainnet } from '../config'
import { AlertCircle, CheckCircle, Download, ExternalLink, ImageIcon, Loader2, RefreshCw } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { toast } from 'sonner'
import { CREATOR_HUB, LEGACY_AVAILABLE } from '../contract'
import type { Content } from '../types'
import { formatUsdc, formatAddress, timeAgo } from '../lib/utils'
import { LegacyBadge } from './EscrowBadge'

// V1 only exists on Arc mainnet.
const LEGACY_CHAIN_ID = arcMainnet.id

interface LegacyItemProps {
  content: Content
  url: string | undefined
  loading: boolean
  failed: boolean
  onRetry: () => void
}

function LegacyItem({ content, url, loading, failed, onRetry }: LegacyItemProps) {
  const ready = !!url && url.length > 0
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.88)', borderColor: 'var(--border)' }}
    >
      <div className="flex gap-3 p-4">
        <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: 'var(--surface-muted)' }}>
          {content.coverImageUrl ? (
            <img
              src={content.coverImageUrl}
              alt={content.title}
              className="w-full h-full object-cover"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <ImageIcon size={22} style={{ color: 'var(--subtle)' }} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--ink)' }}>{content.title}</h3>
            <LegacyBadge compact />
          </div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            by {formatAddress(content.creator)} · {timeAgo(content.createdAt)}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <TokenUSDC size={14} variant="branded" />
            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatUsdc(content.priceUsdc)}</span>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>USDC</span>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="rounded-xl p-3 border" style={{ background: 'rgba(26,128,71,0.05)', borderColor: 'rgba(26,128,71,0.18)' }}>
          {loading && !ready && (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
              <Loader2 size={13} className="animate-spin" /> Fetching content link…
            </div>
          )}
          {failed && !ready && !loading && (
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
            <div className="space-y-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold w-full px-3 py-2.5 rounded-lg"
                style={{ background: 'var(--success)', color: 'white' }}
              >
                <CheckCircle size={13} /> <Download size={13} />
                Access Content
                <ExternalLink size={11} className="ml-auto" />
              </a>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(url)
                  toast.success('Link copied')
                }}
                className="w-full text-xs font-medium py-1.5 rounded-lg"
                style={{ color: 'var(--success)' }}
              >
                Copy link
              </button>
            </div>
          )}
          {!loading && !failed && !ready && (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>No content link was provided by the creator.</p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Read-only list of purchases made on the original V1 contract. V1 buyers keep
 * their links. Renders nothing when there is no V1 contract or no V1 purchases.
 */
export default function LegacyPurchases() {
  const { address } = useAccount()
  const enabled = LEGACY_AVAILABLE && !!address

  const { data: idsData } = useReadContracts({
    contracts: [
      { ...CREATOR_HUB, functionName: 'getBuyerPurchases', args: [address ?? '0x0000000000000000000000000000000000000000'], chainId: LEGACY_CHAIN_ID },
    ],
    query: { enabled },
  })
  const ids = useMemo(() => (idsData?.[0]?.result as bigint[] | undefined) ?? [], [idsData])

  const { data: contentsData } = useReadContracts({
    contracts: ids.map((id) => ({
      ...CREATOR_HUB, functionName: 'getContent' as const, args: [id] as [bigint], chainId: LEGACY_CHAIN_ID, account: address,
    })),
    query: { enabled: enabled && ids.length > 0 },
  })

  // The V1 contract authorises by msg.sender, so `account` must be the buyer.
  const { data: urlsData, isLoading: urlsLoading, refetch: refetchUrls } = useReadContracts({
    contracts: ids.map((id) => ({
      ...CREATOR_HUB, functionName: 'getContentUrl' as const, args: [id] as [bigint], chainId: LEGACY_CHAIN_ID, account: address,
    })),
    query: { enabled: enabled && ids.length > 0, staleTime: 0, gcTime: 0 },
  })

  const contents = useMemo(
    () => (contentsData ?? []).map((d) => d.result as Content | undefined).filter((c): c is Content => !!c),
    [contentsData],
  )

  if (!enabled || ids.length === 0) return null

  return (
    <section className="mt-12" aria-labelledby="legacy-heading">
      <div className="flex items-center gap-2 mb-1">
        <h2 id="legacy-heading" className="display font-bold text-xl" style={{ color: 'var(--ink)' }}>Legacy purchases</h2>
        <LegacyBadge compact />
      </div>
      <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>
        Bought on the original CreatorHub contract. These were paid directly to the seller, so there is no escrow or dispute window. Your access is unchanged.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {contents.map((content) => {
          const idx = ids.findIndex((id) => id === content.id)
          const entry = urlsData?.[idx]
          return (
            <LegacyItem
              key={content.id.toString()}
              content={content}
              url={entry?.result as string | undefined}
              loading={urlsLoading}
              failed={entry?.status === 'failure'}
              onRetry={() => void refetchUrls()}
            />
          )
        })}
      </div>
    </section>
  )
}
