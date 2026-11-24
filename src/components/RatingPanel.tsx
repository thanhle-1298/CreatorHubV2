import { useEffect, useRef, useState } from 'react'
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { Loader2, MessageSquare, Star } from 'lucide-react'
import { toast } from 'sonner'
import { activeChain } from '../config'
import { CREATOR_HUB_V2 } from '../contract'
import { parseOnchainError } from '../lib/utils'
import { StarInput, StarRating } from './StarRating'

const MAX_REVIEW_BYTES = 1000

interface RatingPanelProps {
  contentId: bigint
  average: number
  count: number
  /** Connected wallet has an active (non-refunded) purchase and is not the creator. */
  canRate: boolean
  /** Creator viewing their own listing. */
  isCreator: boolean
  /** The connected wallet's existing rating (0 = none). */
  myStars: number
  /** Called after a rating confirms so the parent refetches. */
  onRated: () => void
}

/** Rating summary plus the verified-buyer rating form (1-5 stars, optional review). */
export default function RatingPanel({ contentId, average, count, canRate, isCreator, myStars, onRated }: RatingPanelProps) {
  const [stars, setStars] = useState(0)
  const [review, setReview] = useState('')
  const { writeContract, data: txHash, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })
  const submitted = useRef(false)
  const busy = isPending || isConfirming

  useEffect(() => {
    if (!isSuccess || !submitted.current) return
    submitted.current = false
    toast.success('Thanks! Your rating is recorded on-chain.')
    reset()
    onRated()
  }, [isSuccess, onRated, reset])

  const reviewBytes = new TextEncoder().encode(review).length
  const tooLong = reviewBytes > MAX_REVIEW_BYTES

  const submit = () => {
    if (stars < 1 || tooLong) return
    submitted.current = true
    writeContract(
      {
        ...CREATOR_HUB_V2,
        functionName: 'rateContent',
        args: [contentId, stars, review.trim()],
        chainId: activeChain.id,
      },
      {
        onError: (e) => {
          submitted.current = false
          toast.error(parseOnchainError(e))
        },
      },
    )
  }

  return (
    <div
      className="rounded-2xl p-5 border space-y-4"
      style={{ background: 'rgba(255,255,255,0.88)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Star size={16} style={{ color: '#f59e0b' }} fill="#f59e0b" />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Ratings</h2>
        </div>
        <StarRating average={average} count={count} size={16} />
      </div>

      {myStars > 0 ? (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
          You rated this
          <StarRating average={myStars} count={1} size={14} hideCount />
        </div>
      ) : canRate ? (
        <div className="space-y-3">
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>How was it?</p>
          <StarInput value={stars} onChange={setStars} disabled={busy} />
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
              <MessageSquare size={12} /> Review (optional)
            </label>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              rows={3}
              disabled={busy}
              placeholder="What did you like? Was the delivery as described?"
              className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none"
              style={{
                background: 'rgba(255,255,255,0.92)',
                borderColor: tooLong ? 'var(--danger)' : 'var(--border)',
                color: 'var(--ink)',
                resize: 'vertical',
              }}
            />
            <div className="flex justify-between mt-1 text-xs" style={{ color: tooLong ? 'var(--danger)' : 'var(--subtle)' }}>
              <span>Your review text is published in a public transaction event. Only its hash is stored in the contract.</span>
              <span className="tabular-nums flex-shrink-0 ml-3">{reviewBytes}/{MAX_REVIEW_BYTES}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={busy || stars < 1 || tooLong}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--accent)', color: 'white', boxShadow: '0 3px 12px rgba(18,45,69,0.2)' }}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {isPending ? 'Confirm in wallet…' : isConfirming ? 'Submitting…' : 'Submit rating'}
          </button>
        </div>
      ) : (
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>
          {isCreator
            ? 'Only verified buyers can rate your listing.'
            : 'Only verified buyers can rate. Buy this listing to leave a rating.'}
        </p>
      )}
    </div>
  )
}
