import { useState } from 'react'
import { Star } from 'lucide-react'

const GOLD = '#f59e0b'
const EMPTY = 'rgba(18,45,69,0.16)'

interface StarRatingProps {
  /** Average rating from 0 to 5 (fractions allowed). */
  average: number
  /** Number of ratings. 0 renders "No ratings yet". */
  count: number
  size?: number
  /** Hide the "(12)" count text. */
  hideCount?: boolean
  className?: string
}

/** Read-only star row with a partially filled last star, plus "4.8 (12)". */
export function StarRating({ average, count, size = 14, hideCount, className }: StarRatingProps) {
  const pct = Math.max(0, Math.min(100, (average / 5) * 100))
  const rated = count > 0

  return (
    <div
      className={`inline-flex items-center gap-1.5 ${className ?? ''}`}
      aria-label={rated ? `Rated ${average.toFixed(1)} out of 5 from ${count} ratings` : 'No ratings yet'}
    >
      <span className="relative inline-flex" style={{ width: size * 5, height: size }}>
        <span className="absolute inset-0 flex">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} size={size} fill={EMPTY} stroke="none" />
          ))}
        </span>
        <span className="absolute inset-0 flex overflow-hidden" style={{ width: `${rated ? pct : 0}%` }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} size={size} fill={GOLD} stroke="none" className="flex-shrink-0" />
          ))}
        </span>
      </span>
      {!hideCount && (
        <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
          {rated ? (
            <>
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>{average.toFixed(1)}</span>
              {' '}({count})
            </>
          ) : (
            'No ratings yet'
          )}
        </span>
      )}
    </div>
  )
}

interface StarInputProps {
  value: number
  onChange: (stars: number) => void
  disabled?: boolean
  size?: number
}

/** Interactive 1-5 star picker with hover preview and keyboard support. */
export function StarInput({ value, onChange, disabled, size = 28 }: StarInputProps) {
  const [hover, setHover] = useState(0)
  const shown = hover || value

  return (
    <div className="inline-flex items-center gap-1" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          disabled={disabled}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(0)}
          className="p-0.5 rounded-md transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ transform: hover === n ? 'scale(1.12)' : 'scale(1)' }}
        >
          <Star size={size} fill={n <= shown ? GOLD : EMPTY} stroke="none" />
        </button>
      ))}
    </div>
  )
}
