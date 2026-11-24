import { useMemo, useState } from 'react'
import { useAccount, useReadContracts, useWriteContract } from 'wagmi'
import { activeChain } from '../config'
import {
  LayoutDashboard, TrendingUp, ShoppingBag, Package, Eye, EyeOff, Edit2, Link2, Save, Star, Plus,
} from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { TokenUSDC } from '@web3icons/react'
import { toast } from 'sonner'
import { CREATOR_HUB_V2, V2_CONFIGURED } from '../contract'
import type { ContentV2 } from '../types'
import { formatUsdc, parseOnchainError } from '../lib/utils'
import { averageRating } from '../lib/escrow'
import { useV2Contents } from '../hooks/useV2Contents'
import { StarRating } from './StarRating'
import { EscrowProtectedBadge } from './EscrowBadge'
import EarningsCard from './EarningsCard'
import SalesHistory from './SalesHistory'

const TARGET_CHAIN_ID = activeChain.id

interface DashboardPageProps {
  onSelectContent: (content: ContentV2) => void
  onListNew: () => void
}

function StatCard({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: React.ReactNode; loading: boolean }) {
  return (
    <div
      className="rounded-2xl border p-4 sm:p-5"
      style={{ background: 'rgba(255,255,255,0.9)', borderColor: 'var(--border)', boxShadow: '0 2px 8px rgba(18,45,69,0.05)' }}
    >
      <div className="flex items-center gap-2 mb-2 text-xs font-medium" style={{ color: 'var(--muted)' }}>
        {icon}
        {label}
      </div>
      {loading ? <div className="skeleton h-7 w-20" /> : (
        <div className="display font-bold text-2xl tabular-nums flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>{value}</div>
      )}
    </div>
  )
}

export default function DashboardPage({ onSelectContent, onListNew }: DashboardPageProps) {
  const { address, isConnected } = useAccount()

  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useReadContracts({
    contracts: [
      { ...CREATOR_HUB_V2, functionName: 'getCreatorStats', args: [address ?? '0x0000000000000000000000000000000000000000'], chainId: TARGET_CHAIN_ID },
      { ...CREATOR_HUB_V2, functionName: 'getCreatorContents', args: [address ?? '0x0000000000000000000000000000000000000000'], chainId: TARGET_CHAIN_ID },
    ],
    query: { enabled: V2_CONFIGURED && !!address, refetchInterval: 12_000 },
  })
  const stats = statsData?.[0]?.result as readonly [bigint, bigint, bigint] | undefined
  const contentIds = useMemo(() => (statsData?.[1]?.result as bigint[] | undefined) ?? [], [statsData])

  const { contents: fetched, isLoading: contentsLoading, refetch: refetchContents } = useV2Contents(contentIds, { refetchInterval: 12_000 })
  const contents = useMemo(() => [...fetched].reverse(), [fetched])

  // Overall rating across the seller's listings, weighted by number of ratings
  const overall = useMemo(() => {
    const sum = contents.reduce((a, c) => a + c.ratingSum, 0n)
    const count = contents.reduce((a, c) => a + c.ratingCount, 0n)
    return { average: averageRating(sum, count), count: Number(count) }
  }, [contents])

  // Set or rotate the gated link on an existing listing
  const [urlEditId, setUrlEditId] = useState<string | null>(null)
  const [urlDraft, setUrlDraft] = useState('')
  const { writeContract: updateUrl, isPending: isUpdatingUrl } = useWriteContract()
  const { writeContract: setActive, isPending: isToggling } = useWriteContract()

  const refreshAll = () => { void refetchStats(); void refetchContents() }

  const handleUpdateUrl = (id: bigint) => {
    const url = urlDraft.trim()
    try { new URL(url) } catch { toast.error('Enter a valid link starting with https://'); return }
    updateUrl(
      { ...CREATOR_HUB_V2, functionName: 'updateContentUrl', args: [id, url], chainId: TARGET_CHAIN_ID },
      {
        onSuccess: () => {
          toast.success('Content link updated.')
          setUrlEditId(null)
          setUrlDraft('')
          refreshAll()
        },
        onError: (e) => toast.error(parseOnchainError(e)),
      },
    )
  }

  const handleToggle = (c: ContentV2) => {
    setActive(
      { ...CREATOR_HUB_V2, functionName: 'setContentActive', args: [c.id, !c.isActive], chainId: TARGET_CHAIN_ID },
      {
        onSuccess: () => { toast.success(c.isActive ? 'Listing hidden.' : 'Listing published.'); refreshAll() },
        onError: (e) => toast.error(parseOnchainError(e)),
      },
    )
  }

  if (!isConnected || !address) {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-20 text-center">
        <LayoutDashboard size={48} className="mx-auto mb-4" style={{ color: 'var(--subtle)' }} />
        <h2 className="display font-bold text-2xl mb-2" style={{ color: 'var(--ink)' }}>Creator Dashboard</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>Connect your wallet to manage listings, ratings and escrow earnings.</p>
        <div className="flex justify-center"><ConnectKitButton /></div>
      </div>
    )
  }

  const loading = statsLoading || (contentIds.length > 0 && contentsLoading)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="display font-bold text-3xl text-balance" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Creator Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Listings, ratings and escrowed earnings in one place.</p>
        </div>
        <button
          onClick={onListNew}
          className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: 'var(--accent)', color: 'white', boxShadow: '0 4px 14px rgba(18,45,69,0.22)' }}
        >
          <Plus size={15} /> List content
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard loading={statsLoading} icon={<TrendingUp size={14} />} label="Released earnings"
          value={<><TokenUSDC size={16} variant="branded" />{formatUsdc(stats?.[0] ?? 0n)}</>} />
        <StatCard loading={statsLoading} icon={<ShoppingBag size={14} />} label="Sales" value={(stats?.[1] ?? 0n).toString()} />
        <StatCard loading={statsLoading} icon={<Package size={14} />} label="Listings" value={(stats?.[2] ?? 0n).toString()} />
        <StatCard loading={loading} icon={<Star size={14} />} label="Average rating"
          value={overall.count > 0 ? <><span>{overall.average.toFixed(1)}</span><span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>({overall.count})</span></> : <span className="text-base font-medium" style={{ color: 'var(--subtle)' }}>No ratings</span>} />
      </div>

      <EarningsCard address={address} lifetimeEarnings={stats?.[0] ?? 0n} onChanged={refreshAll} />

      <SalesHistory address={address} onChanged={refreshAll} />

      {/* Listings */}
      <section aria-labelledby="listings-heading">
        <div className="flex items-center justify-between mb-4">
          <h2 id="listings-heading" className="font-semibold text-lg" style={{ color: 'var(--ink)' }}>Your listings</h2>
          <span className="text-sm" style={{ color: 'var(--muted)' }}>{contents.length} item{contents.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>
        ) : contents.length === 0 ? (
          <div className="text-center py-14 rounded-2xl border" style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)' }}>
            <Package size={44} className="mx-auto mb-4" style={{ color: 'var(--subtle)' }} />
            <h3 className="font-semibold text-lg mb-1" style={{ color: 'var(--ink)' }}>No listings yet</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>List your first design, template or asset and get paid in USDC.</p>
            <button onClick={onListNew} className="px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'var(--accent)', color: 'white' }}>
              List your first content
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {contents.map((c) => {
              const idStr = c.id.toString()
              const noUrl = c.contentUrl.length === 0
              return (
                <div
                  key={idStr}
                  className="rounded-2xl border p-4 transition-all"
                  style={{
                    background: 'var(--surface-strong)',
                    borderColor: c.isActive ? 'var(--border)' : 'rgba(186,43,76,0.2)',
                    opacity: c.isActive ? 1 : 0.75,
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl flex-shrink-0 overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
                      {c.coverImageUrl && (
                        <img src={c.coverImageUrl} alt={c.title} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--ink)' }}>{c.title}</h3>
                        {!c.isActive && (
                          <span className="text-xs px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(186,43,76,0.1)', color: 'var(--danger)' }}>Hidden</span>
                        )}
                        <EscrowProtectedBadge compact />
                      </div>
                      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs" style={{ color: 'var(--muted)' }}>
                        <span className="flex items-center gap-1 tabular-nums"><TokenUSDC size={11} variant="branded" />{formatUsdc(c.priceUsdc)}</span>
                        <span>{c.totalSales.toString()} sales</span>
                        <StarRating average={averageRating(c.ratingSum, c.ratingCount)} count={Number(c.ratingCount)} size={12} />
                        {noUrl && (
                          <button
                            onClick={() => { setUrlEditId(urlEditId === idStr ? null : idStr); setUrlDraft('') }}
                            className="flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded-md"
                            style={{ background: 'rgba(245,158,11,0.14)', color: '#92400e' }}
                          >
                            <Link2 size={11} /> No content link
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => onSelectContent(c)} className="p-2 rounded-lg" style={{ color: 'var(--muted)' }} title="View listing" aria-label="View listing">
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleToggle(c)}
                        disabled={isToggling}
                        className="p-2 rounded-lg disabled:opacity-40"
                        style={{ color: c.isActive ? 'var(--muted)' : 'var(--success)' }}
                        title={c.isActive ? 'Hide listing' : 'Show listing'}
                        aria-label={c.isActive ? 'Hide listing' : 'Show listing'}
                      >
                        {c.isActive ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {urlEditId === idStr && (
                    <div className="mt-3 pt-3 border-t flex flex-col sm:flex-row gap-2" style={{ borderColor: 'var(--border)' }}>
                      <input
                        type="url"
                        value={urlDraft}
                        onChange={(e) => setUrlDraft(e.target.value)}
                        placeholder="https://drive.google.com/…"
                        className="flex-1 px-3 py-2.5 rounded-lg border text-sm outline-none"
                        style={{ background: 'white', borderColor: 'var(--border)', color: 'var(--ink)' }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdateUrl(c.id)}
                          disabled={isUpdatingUrl}
                          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                          style={{ background: 'var(--accent)', color: 'white' }}
                        >
                          <Save size={13} /> {isUpdatingUrl ? 'Saving…' : 'Save link'}
                        </button>
                        <button
                          onClick={() => { setUrlEditId(null); setUrlDraft('') }}
                          className="px-3 py-2.5 rounded-lg text-xs font-medium"
                          style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
