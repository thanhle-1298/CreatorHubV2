import { useState, useMemo, useTransition } from 'react'
import { useAccount, useReadContracts } from 'wagmi'
import { activeChain } from '../config'
import {
  Search, X, ChevronDown, Palette, FileText, Camera,
  PenTool, Type, Code2, Layers, ArrowRight, Star, ShieldCheck,
} from 'lucide-react'
import { CREATOR_HUB_V2, V2_CONFIGURED } from '../contract'
import type { ContentV2 } from '../types'
import { useV2Contents } from '../hooks/useV2Contents'
import { averageRating } from '../lib/escrow'
import ContentCard from './ContentCard'
import CardSkeleton from './CardSkeleton'

const TARGET_CHAIN_ID = activeChain.id

interface ExplorePageProps {
  onSelectContent: (content: ContentV2) => void
  onListContent?: () => void
}

const CATEGORIES = [
  { label: 'All',          icon: null },
  { label: 'Design',       icon: <Palette size={13} /> },
  { label: 'Templates',    icon: <FileText size={13} /> },
  { label: 'Photos',       icon: <Camera size={13} /> },
  { label: 'Illustration', icon: <PenTool size={13} /> },
  { label: 'Fonts',        icon: <Type size={13} /> },
  { label: 'Code',         icon: <Code2 size={13} /> },
]

// ─── Ghost placeholder cards ──────────────────────────────────────────────────
const GHOST_ITEMS = [
  {
    title: 'Brand Identity Kit',
    desc: 'Logo, color palette, typography guide, and brand guidelines.',
    category: 'Branding',
    price: '29.00',
    imageBg: 'linear-gradient(135deg, #fef3c7 0%, #fffbeb 100%)',
    accentColor: '#b45309',
    sales: '14',
  },
  {
    title: 'Figma UI Component Library',
    desc: 'Over 300 hand-crafted components built for modern web apps.',
    category: 'Templates',
    price: '49.00',
    imageBg: 'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 100%)',
    accentColor: '#1a8047',
    sales: '28',
  },
  {
    title: 'Abstract Photo Pack — Vol. 3',
    desc: '50 high-resolution abstract photographs for editorial and design.',
    category: 'Photos',
    price: '12.00',
    imageBg: 'linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%)',
    accentColor: '#1061a6',
    sales: '7',
  },
  {
    title: 'Space Grotesk Pro Bundle',
    desc: 'Extended weights, variable font, and display alternates.',
    category: 'Fonts',
    price: '19.00',
    imageBg: 'linear-gradient(135deg, #ede9fe 0%, #f5f3ff 100%)',
    accentColor: '#7c3aed',
    sales: '33',
  },
  {
    title: 'Icon Set — Line Edition',
    desc: '500+ consistent line icons in SVG, Figma, and Iconjar.',
    category: 'Design',
    price: '9.00',
    imageBg: 'linear-gradient(135deg, #f0f0f4 0%, #f8f8fb 100%)',
    accentColor: '#334155',
    sales: '52',
  },
  {
    title: 'Framer Motion Starter Kit',
    desc: 'Ready-to-use animation presets and composable React components.',
    category: 'Code',
    price: '24.00',
    imageBg: 'linear-gradient(135deg, #e2e8f0 0%, #f1f5f9 100%)',
    accentColor: '#122d45',
    sales: '19',
  },
]

function GhostCard({ item }: { item: typeof GHOST_ITEMS[0] }) {
  return (
    <div
      className="rounded-2xl overflow-hidden border select-none pointer-events-none"
      style={{
        background: 'rgba(255,255,255,0.82)',
        borderColor: 'var(--border)',
        boxShadow: '0 2px 8px rgba(18,45,69,0.06)',
        opacity: 0.72,
      }}
    >
      {/* Image */}
      <div
        className="w-full aspect-[4/3] flex items-center justify-center relative"
        style={{ background: item.imageBg }}
      >
        <Layers size={36} style={{ color: item.accentColor, opacity: 0.22 }} />
        {/* Category badge */}
        <div className="absolute top-3 left-3">
          <span
            className="px-2.5 py-1 rounded-lg text-xs font-semibold"
            style={{ background: 'rgba(255,255,255,0.9)', color: item.accentColor }}
          >
            {item.category}
          </span>
        </div>
        {/* Coming soon chip */}
        <div className="absolute bottom-3 right-3">
          <span
            className="px-2 py-1 rounded-lg text-xs font-medium"
            style={{ background: 'rgba(255,255,255,0.82)', color: 'var(--subtle)' }}
          >
            Coming soon
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        <h3
          className="font-semibold text-base mb-1 line-clamp-1"
          style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
        >
          {item.title}
        </h3>
        <p className="text-sm mb-3 line-clamp-2 leading-relaxed" style={{ color: 'var(--muted)' }}>
          {item.desc}
        </p>
        <div
          className="flex items-center justify-between pt-3 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded-full skeleton flex-shrink-0" />
            <span className="font-bold tabular-nums text-base" style={{ color: 'var(--ink)' }}>
              {item.price}
            </span>
            <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
          </div>
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>
            {item.sales} sales
          </span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="skeleton h-3 w-24 rounded" />
          <div className="skeleton h-3 w-10 rounded" />
        </div>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function ExplorePage({ onSelectContent, onListContent }: ExplorePageProps) {
  const { address } = useAccount()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [sortBy, setSortBy] = useState<'newest' | 'popular' | 'rating' | 'price-asc' | 'price-desc'>('newest')
  const [minRating, setMinRating] = useState(0)
  const [isPending, startTransition] = useTransition()

  const { data: activeIds, isLoading: idsLoading, isError: idsError, refetch: refetchIds } = useReadContracts({
    contracts: [{ ...CREATOR_HUB_V2, functionName: 'getActiveContentIds', chainId: TARGET_CHAIN_ID }],
    query: { enabled: V2_CONFIGURED, refetchInterval: 15_000 },
  })

  const ids = useMemo(() => (activeIds?.[0]?.result as bigint[] | undefined) ?? [], [activeIds])

  const purchasedContracts = address
    ? ids.map((id) => ({
        ...CREATOR_HUB_V2, functionName: 'hasPurchased' as const,
        args: [address, id] as [`0x${string}`, bigint], chainId: TARGET_CHAIN_ID,
      }))
    : []

  const {
    contents,
    isLoading: contentsLoading,
    isError: contentsError,
    refetch: refetchContents,
  } = useV2Contents(ids, { refetchInterval: 15_000 })

  const { data: purchasedData } = useReadContracts({
    contracts: purchasedContracts,
    query: { enabled: V2_CONFIGURED && !!address && ids.length > 0 },
  })

  const purchasedMap = useMemo(() => {
    const m: Record<string, boolean> = {}
    ;(purchasedData ?? []).forEach((d, i) => {
      const id = ids[i]?.toString()
      if (id) m[id] = !!d.result
    })
    return m
  }, [purchasedData, ids])

  const filtered = useMemo(() => {
    let list = [...contents]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((c) => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
    }
    if (category !== 'All') {
      list = list.filter((c) => {
        const text = (c.title + ' ' + c.description).toLowerCase()
        switch (category) {
          case 'Photos': return text.includes('photo') || text.includes('image') || text.includes('picture')
          case 'Templates': return text.includes('template') || text.includes('figma') || text.includes('sketch')
          case 'Fonts': return text.includes('font') || text.includes('typeface') || text.includes('typography')
          case 'Code': return text.includes('code') || text.includes('component') || text.includes('react')
          case 'Illustration': return text.includes('illustration') || text.includes('vector') || text.includes('svg')
          case 'Design': return true
          default: return true
        }
      })
    }
    if (minRating > 0) {
      list = list.filter((c) => averageRating(c.ratingSum, c.ratingCount) >= minRating)
    }
    switch (sortBy) {
      case 'rating':
        list.sort((a, b) => {
          const diff = averageRating(b.ratingSum, b.ratingCount) - averageRating(a.ratingSum, a.ratingCount)
          return diff !== 0 ? diff : Number(b.ratingCount - a.ratingCount)
        })
        break
      case 'popular': list.sort((a, b) => Number(b.totalSales - a.totalSales)); break
      case 'price-asc': list.sort((a, b) => Number(a.priceUsdc - b.priceUsdc)); break
      case 'price-desc': list.sort((a, b) => Number(b.priceUsdc - a.priceUsdc)); break
      default: list.sort((a, b) => Number(b.createdAt - a.createdAt))
    }
    return list
  }, [contents, search, sortBy, category, minRating])

  const loadFailed = idsError || contentsError
  const isLoadingData = V2_CONFIGURED && (idsLoading || (ids.length > 0 && contentsLoading))
  const showSkeletons = isLoadingData
  const showResults = V2_CONFIGURED && !isLoadingData && !loadFailed && filtered.length > 0
  const showEmpty = V2_CONFIGURED && !isLoadingData && !loadFailed && filtered.length === 0
  const hasFilters = !!search.trim() || minRating > 0 || category !== 'All'

  const clearFilters = () => {
    setSearch('')
    setMinRating(0)
    setCategory('All')
  }

  const handleSortChange = (v: typeof sortBy) => {
    startTransition(() => setSortBy(v))
  }

  const handleCategoryChange = (c: string) => {
    startTransition(() => setCategory(c))
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-24 md:pb-10">

      {/* Hero */}
      <div className="mb-8 sm:mb-10">
        <p
          className="text-[11px] font-bold tracking-widest uppercase mb-2"
          style={{ color: 'var(--subtle)', letterSpacing: '0.1em' }}
        >
          Digital Marketplace
        </p>
        <h1
          className="display font-bold text-3xl sm:text-[2.6rem] mb-3 text-balance"
          style={{ color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1.15 }}
        >
          Discover Digital Content
        </h1>
        <p className="text-base text-pretty max-w-xl" style={{ color: 'var(--muted)', lineHeight: 1.65 }}>
          Premium designs, templates, and creative assets. Pay once in USDC, unlock instantly, and stay protected by a 5-day escrow.
        </p>
        <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: 'rgba(26,128,71,0.1)', color: 'var(--success)' }}>
          <ShieldCheck size={13} />
          Every purchase is escrow protected
        </div>
      </div>

      {/* Search + sort row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        {/* Search */}
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--subtle)' }}
          />
          <input
            type="text"
            placeholder="Search titles, descriptions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-3 rounded-xl border text-sm outline-none font-medium"
            style={{
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              borderColor: 'var(--border)',
              color: 'var(--ink)',
              boxShadow: '0 1px 3px rgba(18,45,69,0.05)',
              transition: 'border-color 150ms ease, box-shadow 150ms ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--focus)'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(133,177,237,0.22), 0 1px 3px rgba(18,45,69,0.05)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(18,45,69,0.05)'
            }}
          />
          {search && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full"
              style={{ color: 'var(--subtle)' }}
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Sort */}
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => handleSortChange(e.target.value as typeof sortBy)}
            className="pl-4 pr-9 py-3 rounded-xl border text-sm appearance-none outline-none cursor-pointer font-medium"
            style={{
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              borderColor: 'var(--border)',
              color: 'var(--ink)',
              boxShadow: '0 1px 3px rgba(18,45,69,0.05)',
              opacity: isPending ? 0.65 : 1,
              transition: 'opacity 120ms ease, border-color 150ms ease',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--focus)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <option value="newest">Newest first</option>
            <option value="rating">Top rated</option>
            <option value="popular">Most popular</option>
            <option value="price-asc">Price: low → high</option>
            <option value="price-desc">Price: high → low</option>
          </select>
          <ChevronDown
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--subtle)' }}
          />
        </div>

        {/* Minimum rating */}
        <div className="relative">
          <Star
            size={14}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: '#f59e0b' }}
            fill="#f59e0b"
          />
          <select
            value={minRating}
            onChange={(e) => startTransition(() => setMinRating(Number(e.target.value)))}
            aria-label="Minimum rating"
            className="pl-9 pr-9 py-3 rounded-xl border text-sm appearance-none outline-none cursor-pointer font-medium"
            style={{
              background: 'rgba(255,255,255,0.92)',
              borderColor: 'var(--border)',
              color: 'var(--ink)',
              boxShadow: '0 1px 3px rgba(18,45,69,0.05)',
              opacity: isPending ? 0.65 : 1,
              transition: 'opacity 120ms ease, border-color 150ms ease',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--focus)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <option value={0}>Any rating</option>
            <option value={4}>4 stars &amp; up</option>
            <option value={3}>3 stars &amp; up</option>
          </select>
          <ChevronDown
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--subtle)' }}
          />
        </div>
      </div>

      {/* Category chips */}
      <div className="flex gap-2 no-scrollbar overflow-x-auto pb-3 mb-7">
        {CATEGORIES.map(({ label, icon }) => {
          const active = category === label
          return (
            <button
              key={label}
              onClick={() => handleCategoryChange(label)}
              className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border"
              style={{
                background: active ? 'var(--accent)' : 'rgba(255,255,255,0.9)',
                color: active ? 'white' : 'var(--muted)',
                borderColor: active ? 'var(--accent)' : 'rgba(18,45,69,0.11)',
                boxShadow: active ? '0 2px 10px rgba(18,45,69,0.2)' : '0 1px 2px rgba(18,45,69,0.04)',
                opacity: isPending ? 0.7 : 1,
                transition: 'background 150ms ease, color 150ms ease, box-shadow 150ms ease, opacity 120ms ease',
              }}
            >
              {icon}
              {label}
            </button>
          )
        })}
      </div>

      {/* V2 contract not configured */}
      {!V2_CONFIGURED && (
        <div
          className="rounded-2xl p-8 text-center border"
          style={{ background: 'rgba(255,255,255,0.8)', borderColor: 'var(--border)' }}
        >
          <p className="font-semibold mb-1" style={{ color: 'var(--ink)' }}>The marketplace is being upgraded</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            The escrow contract is not connected yet. Your earlier purchases are still available under My Purchases.
          </p>
        </div>
      )}

      {/* Error */}
      {V2_CONFIGURED && loadFailed && (
        <div
          className="rounded-2xl p-8 text-center border"
          style={{ background: 'rgba(186,43,76,0.04)', borderColor: 'rgba(186,43,76,0.14)' }}
          role="alert"
        >
          <p className="font-semibold mb-1" style={{ color: 'var(--danger)' }}>Unable to load content</p>
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Check your connection or wallet network and try again.</p>
          <button
            onClick={() => { void refetchIds(); void refetchContents() }}
            className="px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Skeleton loaders */}
      {showSkeletons && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      )}

      {/* Empty state */}
      {showEmpty && (
        <div>
          {/* Preview grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
            {GHOST_ITEMS.map((item) => <GhostCard key={item.title} item={item} />)}
          </div>

          {/* CTA card */}
          <div className="flex justify-center">
            <div
              className="relative w-full max-w-lg rounded-2xl p-8 border text-center"
              style={{
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                borderColor: 'var(--border)',
                boxShadow: '0 12px 40px rgba(18,45,69,0.09)',
              }}
            >
              {/* Spectral top strip */}
              <div
                className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
                style={{ background: 'linear-gradient(90deg, #5fbeff 0%, #af8ff4 40%, #f05c6b 70%, #ffcd83 100%)' }}
              />

              {/* Icon */}
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
                style={{ background: 'rgba(18,45,69,0.07)' }}
              >
                <Layers size={26} style={{ color: 'var(--accent)' }} />
              </div>

              <h2
                className="display font-bold text-xl mb-2"
                style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
              >
                {hasFilters ? 'No results found' : 'Be the first creator'}
              </h2>

              <p
                className="text-sm mb-7 text-pretty mx-auto max-w-sm"
                style={{ color: 'var(--muted)', lineHeight: 1.65 }}
              >
                {hasFilters
                  ? 'Nothing matched your search and filters. Try different keywords or clear the filters.'
                  : 'List your first digital content and start earning USDC from every escrow-protected sale.'}
              </p>

              {hasFilters ? (
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
                >
                  <X size={14} /> Clear filters
                </button>
              ) : (
                <button
                  onClick={onListContent}
                  className="inline-flex items-center gap-2 mx-auto px-7 py-3.5 rounded-xl text-sm font-semibold"
                  style={{
                    background: 'var(--accent)',
                    color: 'white',
                    boxShadow: '0 4px 16px rgba(18,45,69,0.24)',
                    transition: 'background 160ms ease, box-shadow 160ms ease, transform 120ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--accent-hover)'
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(16,97,166,0.32)'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--accent)'
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(18,45,69,0.24)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                  onMouseDown={(e) => { e.currentTarget.style.transform = 'translateY(0) scale(0.98)' }}
                >
                  List Your First Content
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {showResults && (
        <>
          <p
            className="text-xs font-semibold mb-5 uppercase tracking-wider"
            style={{ color: 'var(--subtle)', letterSpacing: '0.08em', opacity: isPending ? 0.5 : 1, transition: 'opacity 120ms ease' }}
          >
            {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          </p>
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
            style={{ opacity: isPending ? 0.6 : 1, transition: 'opacity 120ms ease' }}
          >
            {filtered.map((content) => (
              <ContentCard
                key={content.id.toString()}
                content={content}
                hasPurchased={purchasedMap[content.id.toString()]}
                onClick={() => onSelectContent(content)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
