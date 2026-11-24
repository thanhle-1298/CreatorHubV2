import { ImageIcon, Users, Eye, CheckCircle2, ShoppingCart } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import type { Content } from '../types'
import { formatUsdc, formatAddress, timeAgo } from '../lib/utils'
import { averageRating } from '../lib/escrow'
import { StarRating } from './StarRating'
import { EscrowProtectedBadge } from './EscrowBadge'

interface ContentCardProps {
  /** V2 listings carry rating and hash fields; V1 listings do not. */
  content: Content
  hasPurchased?: boolean
  onClick: () => void
}

function deriveCategory(content: Content): string {
  const text = (content.title + ' ' + content.description).toLowerCase()
  if (text.includes('photo') || text.includes('image') || text.includes('picture')) return 'Photos'
  if (text.includes('template') || text.includes('figma') || text.includes('sketch')) return 'Templates'
  if (text.includes('font') || text.includes('typeface') || text.includes('typography')) return 'Fonts'
  if (text.includes('code') || text.includes('component') || text.includes('react') || text.includes('ui kit')) return 'Code'
  if (text.includes('illustration') || text.includes('vector') || text.includes('svg')) return 'Illustration'
  if (text.includes('logo') || text.includes('brand') || text.includes('identity')) return 'Branding'
  return 'Design'
}

const CATEGORY_STYLES: Record<string, { bg: string; text: string; imageBg: string }> = {
  Photos:       { bg: 'rgba(16,97,166,0.12)',   text: '#1061a6', imageBg: 'linear-gradient(135deg,#dbeafe 0%,#eff6ff 100%)' },
  Templates:    { bg: 'rgba(26,128,71,0.12)',   text: '#1a8047', imageBg: 'linear-gradient(135deg,#dcfce7 0%,#f0fdf4 100%)' },
  Fonts:        { bg: 'rgba(109,40,217,0.10)',  text: '#7c3aed', imageBg: 'linear-gradient(135deg,#ede9fe 0%,#f5f3ff 100%)' },
  Code:         { bg: 'rgba(18,45,69,0.08)',    text: '#122d45', imageBg: 'linear-gradient(135deg,#e2e8f0 0%,#f1f5f9 100%)' },
  Illustration: { bg: 'rgba(186,43,76,0.10)',   text: '#be185d', imageBg: 'linear-gradient(135deg,#fce7f3 0%,#fdf2f8 100%)' },
  Branding:     { bg: 'rgba(180,83,9,0.10)',    text: '#b45309', imageBg: 'linear-gradient(135deg,#fef3c7 0%,#fffbeb 100%)' },
  Design:       { bg: 'rgba(18,45,69,0.07)',    text: '#334155', imageBg: 'linear-gradient(135deg,#f0f0f4 0%,#f8f8fb 100%)' },
}

export default function ContentCard({ content, hasPurchased, onClick }: ContentCardProps) {
  const category = deriveCategory(content)
  const styles = CATEGORY_STYLES[category] ?? CATEGORY_STYLES['Design']

  return (
    <button
      onClick={onClick}
      className="group text-left w-full rounded-2xl overflow-hidden border"
      style={{
        background: 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderColor: 'var(--border)',
        boxShadow: '0 2px 6px rgba(18,45,69,0.06), inset 0 1px 0 rgba(255,255,255,0.7)',
        transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 14px 36px rgba(18,45,69,0.13), inset 0 1px 0 rgba(255,255,255,0.7)'
        e.currentTarget.style.borderColor = 'rgba(18,45,69,0.24)'
        e.currentTarget.style.transform = 'translateY(-4px) scale(1.005)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 2px 6px rgba(18,45,69,0.06), inset 0 1px 0 rgba(255,255,255,0.7)'
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.transform = 'translateY(0) scale(1)'
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'translateY(-2px) scale(0.99)' }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'translateY(-4px) scale(1.005)' }}
    >
      {/* Thumbnail */}
      <div
        className="w-full aspect-[4/3] relative overflow-hidden"
        style={{ background: styles.imageBg }}
      >
        {content.coverImageUrl ? (
          <img
            src={content.coverImageUrl}
            alt={content.title}
            className="w-full h-full object-cover"
            style={{ transition: 'transform 400ms ease' }}
            onLoad={(e) => { e.currentTarget.style.opacity = '1' }}
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <ImageIcon size={32} style={{ color: styles.text, opacity: 0.3 }} />
          </div>
        )}

        {/* Hover overlay */}
        <div
          className="absolute inset-0 flex items-end justify-center pb-4 opacity-0 group-hover:opacity-100"
          style={{
            background: 'linear-gradient(to top, rgba(18,45,69,0.55) 0%, transparent 60%)',
            transition: 'opacity 180ms ease',
          }}
        >
          <div
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{
              background: 'white',
              color: 'var(--accent)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              transform: 'translateY(2px)',
              transition: 'transform 180ms ease',
            }}
          >
            {hasPurchased ? (
              <><Eye size={14} /> View Content</>
            ) : (
              <><ShoppingCart size={14} /> Buy Now</>
            )}
          </div>
        </div>

        {/* Category badge */}
        <div className="absolute top-3 left-3">
          <span
            className="px-2.5 py-1 rounded-lg text-xs font-semibold"
            style={{
              background: 'rgba(255,255,255,0.9)',
              color: styles.text,
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            }}
          >
            {category}
          </span>
        </div>

        {/* Right badges */}
        <div className="absolute top-3 right-3 flex gap-1.5">
          {hasPurchased && (
            <span
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold"
              style={{ background: 'rgba(26,128,71,0.9)', color: 'white', backdropFilter: 'blur(8px)' }}
            >
              <CheckCircle2 size={10} />
              Owned
            </span>
          )}
          {!content.isActive && (
            <span
              className="px-2 py-1 rounded-lg text-xs font-semibold"
              style={{ background: 'rgba(0,0,0,0.55)', color: 'white' }}
            >
              Hidden
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        <h3
          className="font-semibold text-base mb-1 line-clamp-1"
          style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
        >
          {content.title}
        </h3>
        <div className="mb-2 flex items-center justify-between gap-2">
          <StarRating
            average={averageRating(content.ratingSum, content.ratingCount)}
            count={Number(content.ratingCount ?? 0n)}
          />
          {content.contentHash && <EscrowProtectedBadge compact />}
        </div>
        <p
          className="text-sm mb-3 line-clamp-2 leading-relaxed"
          style={{ color: 'var(--muted)' }}
        >
          {content.description}
        </p>

        {/* Price + sales */}
        <div
          className="flex items-center justify-between pt-3 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-1.5">
            <TokenUSDC size={15} variant="branded" />
            <span className="font-bold tabular-nums text-base" style={{ color: 'var(--ink)' }}>
              {formatUsdc(content.priceUsdc)}
            </span>
            <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
          </div>
          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--subtle)' }}>
            <Users size={11} />
            {content.totalSales.toString()}
          </div>
        </div>

        {/* Creator + time */}
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs mono truncate max-w-[130px]" style={{ color: 'var(--subtle)' }}>
            {formatAddress(content.creator)}
          </span>
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>
            {timeAgo(content.createdAt)}
          </span>
        </div>
      </div>
    </button>
  )
}
