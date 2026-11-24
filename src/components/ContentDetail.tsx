import { useCallback, useEffect, useRef } from 'react'
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from 'wagmi'
import { erc20Abi, zeroAddress } from 'viem'
import { activeChain } from '../config'
import {
  ArrowLeft, ImageIcon, ExternalLink, CheckCircle, Lock, Eye, ShieldCheck, Fingerprint, Clock,
} from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { toast } from 'sonner'
import { CREATOR_HUB_V2, CREATOR_HUB_V2_ADDRESS, V2_CONFIGURED } from '../contract'
import { EscrowStatus, type ContentV2, type Escrow } from '../types'
import { formatUsdc, formatAddress, parseOnchainError, timeAgo } from '../lib/utils'
import { averageRating } from '../lib/escrow'
import { getUsdc, buildTxExplorerUrl } from '../onchain-facts'
import { useV2Contents } from '../hooks/useV2Contents'
import { StarRating } from './StarRating'
import { EscrowProtectedBadge } from './EscrowBadge'
import ContentLinkPanel from './ContentLinkPanel'
import HashVerifier from './HashVerifier'
import DisputeWindow from './DisputeWindow'
import RatingPanel from './RatingPanel'

const TARGET_CHAIN_ID = activeChain.id

interface ContentDetailProps {
  content: ContentV2
  onBack: () => void
}

export default function ContentDetail({ content, onBack }: ContentDetailProps) {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const usdcFact = getUsdc(TARGET_CHAIN_ID)!

  const isWrongChain = isConnected && chainId !== TARGET_CHAIN_ID
  const isCreator = !!address && address.toLowerCase() === content.creator.toLowerCase()
  const account = address ?? zeroAddress

  // Fresh copy of the listing (ratings and sales change after purchases and ratings)
  const { contents: liveList, refetch: refetchContent } = useV2Contents([content.id])
  const live = liveList[0] ?? content

  // ── Purchase transaction state (declared first: other queries poll while it settles) ──
  const { writeContract: purchase, data: purchaseTxHash, isPending: isPurchasing } = useWriteContract()
  const { isLoading: isPurchaseConfirming, isSuccess: isPurchaseSuccess } =
    useWaitForTransactionReceipt({ hash: purchaseTxHash })
  const { writeContract: approve, data: approveTxHash, isPending: isApproving } = useWriteContract()
  const { isLoading: isApproveConfirming } = useWaitForTransactionReceipt({ hash: approveTxHash })

  // ── Escrow / access state ──
  const { data: escrowIdRaw, refetch: refetchEscrowId } = useReadContract({
    ...CREATOR_HUB_V2,
    functionName: 'getEscrowIdFor',
    args: [account, content.id],
    chainId: TARGET_CHAIN_ID,
    query: {
      enabled: V2_CONFIGURED && !!address && !isCreator,
      staleTime: 0,
      // After the purchase confirms, poll fast until the node returns the new escrow id
      refetchInterval: (q) =>
        isPurchaseSuccess && !((q.state.data as bigint | undefined) && (q.state.data as bigint) > 0n) ? 2_000 : false,
    },
  })
  const escrowId = (escrowIdRaw as bigint | undefined) ?? 0n

  const { data: escrowRaw, refetch: refetchEscrow } = useReadContract({
    ...CREATOR_HUB_V2,
    functionName: 'getEscrow',
    args: [escrowId],
    chainId: TARGET_CHAIN_ID,
    query: { enabled: V2_CONFIGURED && escrowId > 0n, staleTime: 0, refetchInterval: 20_000 },
  })
  const escrow = escrowRaw as Escrow | undefined
  const buyerHasAccess =
    !!escrow && escrow.status !== EscrowStatus.None && escrow.status !== EscrowStatus.Refunded
  const refunded = !!escrow && escrow.status === EscrowStatus.Refunded
  const unlocked = buyerHasAccess || isCreator

  // ── Gated content URL (account sets eth_call `from`, the contract checks msg.sender) ──
  const {
    data: contentUrl,
    isLoading: isUrlLoading,
    isFetching: isUrlFetching,
    isError: isUrlError,
    refetch: refetchContentUrl,
  } = useReadContract({
    ...CREATOR_HUB_V2,
    functionName: 'getContentUrl',
    args: [content.id],
    chainId: TARGET_CHAIN_ID,
    account: address,
    query: {
      enabled: V2_CONFIGURED && unlocked,
      staleTime: 0,
      gcTime: 0,
      refetchInterval: (q) => (q.state.status === 'error' ? 4_000 : false),
      retry: 2,
      retryDelay: 1_500,
    },
  })

  // ── My existing rating ──
  const { data: myRatingRaw, refetch: refetchMyRating } = useReadContract({
    ...CREATOR_HUB_V2,
    functionName: 'getUserRating',
    args: [content.id, account],
    chainId: TARGET_CHAIN_ID,
    query: { enabled: V2_CONFIGURED && !!address && buyerHasAccess },
  })
  const myStars = Number((myRatingRaw as readonly [number, string] | undefined)?.[0] ?? 0)

  // ── USDC allowance ──
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdcFact.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account, CREATOR_HUB_V2_ADDRESS],
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address && V2_CONFIGURED },
  })
  const needsApproval = allowance === undefined || allowance < live.priceUsdc

  const refetchAll = useCallback(async () => {
    await refetchEscrowId()
    await refetchEscrow()
    await refetchContent()
    await refetchMyRating()
    await refetchContentUrl()
  }, [refetchEscrowId, refetchEscrow, refetchContent, refetchMyRating, refetchContentUrl])

  const notified = useRef(false)
  useEffect(() => {
    if (!isPurchaseSuccess || notified.current) return
    notified.current = true
    toast.success('Purchase confirmed. Your link is unlocked.')
    void refetchAllowance()
    void refetchAll()
  }, [isPurchaseSuccess, refetchAll, refetchAllowance])

  const handleApprove = () => {
    if (isWrongChain) { switchChain({ chainId: TARGET_CHAIN_ID }); return }
    approve(
      {
        address: usdcFact.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'approve',
        args: [CREATOR_HUB_V2_ADDRESS, live.priceUsdc],
        chainId: TARGET_CHAIN_ID,
      },
      {
        onSuccess: () => { toast.success('USDC approved. Now confirm the purchase.'); void refetchAllowance() },
        onError: (e) => toast.error(parseOnchainError(e)),
      },
    )
  }

  const handlePurchase = () => {
    if (isWrongChain) { switchChain({ chainId: TARGET_CHAIN_ID }); return }
    purchase(
      {
        ...CREATOR_HUB_V2,
        functionName: 'purchaseContent',
        args: [content.id, live.priceUsdc],
        chainId: TARGET_CHAIN_ID,
      },
      { onError: (e) => toast.error(parseOnchainError(e)) },
    )
  }

  const isTxLoading = isApproving || isApproveConfirming || isPurchasing || isPurchaseConfirming

  const buttonLabel = (() => {
    if (!isConnected) return 'Connect wallet to purchase'
    if (isWrongChain) return 'Switch to Arc'
    if (isApproving) return 'Confirm approval in wallet…'
    if (isApproveConfirming) return 'Approving USDC…'
    if (isPurchasing) return 'Confirm purchase in wallet…'
    if (isPurchaseConfirming) return 'Purchasing…'
    if (needsApproval) return `Approve ${formatUsdc(live.priceUsdc)} USDC`
    return `Buy for ${formatUsdc(live.priceUsdc)} USDC`
  })()

  const average = averageRating(live.ratingSum, live.ratingCount)
  const ratingCount = Number(live.ratingCount)

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium mb-6 transition-colors"
        style={{ color: 'var(--muted)' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ink)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
      >
        <ArrowLeft size={16} />
        Back to Explore
      </button>

      <div className="grid md:grid-cols-5 gap-8">
        {/* Left: cover + access + escrow + ratings */}
        <div className="md:col-span-3 space-y-4">
          <div
            className="w-full aspect-video rounded-2xl overflow-hidden flex items-center justify-center"
            style={{ background: 'var(--surface-muted)' }}
          >
            {live.coverImageUrl ? (
              <img
                src={live.coverImageUrl}
                alt={live.title}
                className="w-full h-full object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            ) : (
              <ImageIcon size={48} style={{ color: 'var(--subtle)' }} />
            )}
          </div>

          {refunded && (
            <div
              className="rounded-2xl p-5 border text-sm"
              style={{ background: 'rgba(71,85,105,0.08)', borderColor: 'rgba(71,85,105,0.2)', color: 'var(--ink-2)' }}
            >
              <p className="font-semibold mb-1">Refunded</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                You were refunded in full for this purchase and access to the link was removed. Withdraw your refund from My Purchases.
              </p>
            </div>
          )}

          {unlocked && (
            <>
              <ContentLinkPanel
                url={contentUrl as string | undefined}
                isLoading={isUrlLoading}
                isFetching={isUrlFetching}
                isError={isUrlError}
                isCreator={isCreator}
                onRetry={() => void refetchContentUrl()}
              />
              <HashVerifier hash={live.contentHash} />
              {!isCreator && escrow && (
                <DisputeWindow escrow={escrow} role="buyer" onChanged={() => void refetchAll()} />
              )}
            </>
          )}

          <RatingPanel
            contentId={content.id}
            average={average}
            count={ratingCount}
            canRate={buyerHasAccess && !isCreator && myStars === 0}
            isCreator={isCreator}
            myStars={myStars}
            onRated={() => void refetchAll()}
          />
        </div>

        {/* Right: info + buy */}
        <div className="md:col-span-2 space-y-4">
          <div
            className="rounded-2xl p-6 border"
            style={{
              background: 'rgba(255,255,255,0.88)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderColor: 'var(--border)',
              boxShadow: '0 8px 32px rgba(18,45,69,0.07), inset 0 1px 0 rgba(255,255,255,0.6)',
            }}
          >
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <EscrowProtectedBadge />
              {!live.isActive && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-lg" style={{ background: 'rgba(0,0,0,0.08)', color: 'var(--muted)' }}>
                  Hidden
                </span>
              )}
            </div>
            <h1 className="display font-bold text-2xl mb-2 text-balance" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              {live.title}
            </h1>
            <div className="mb-3">
              <StarRating average={average} count={ratingCount} size={16} />
            </div>
            <p className="text-sm mb-5 text-pretty" style={{ color: 'var(--muted)', lineHeight: '1.6' }}>
              {live.description}
            </p>

            <div className="flex items-center gap-4 py-4 border-y mb-5" style={{ borderColor: 'var(--border)' }}>
              <Stat label="Sales" value={live.totalSales.toString()} />
              <Stat label="Listed" value={timeAgo(live.createdAt)} />
              <Stat label="Creator" value={formatAddress(live.creator)} mono />
            </div>

            <div className="flex items-center gap-2 mb-5">
              <TokenUSDC size={24} variant="branded" />
              <span className="display text-3xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                {formatUsdc(live.priceUsdc)}
              </span>
              <span className="text-base font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
            </div>

            {unlocked ? (
              <div
                className="flex items-center gap-2 justify-center py-3.5 rounded-xl font-semibold text-sm"
                style={{ background: 'rgba(26,128,71,0.1)', color: 'var(--success)', border: '1px solid rgba(26,128,71,0.18)' }}
              >
                <CheckCircle size={16} />
                {isCreator ? 'Your listing' : 'Purchased'}
              </div>
            ) : refunded ? null : (
              <div className="space-y-3">
                {!isConnected && (
                  <div className="flex items-center gap-2 text-xs py-2.5 px-3 rounded-lg" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
                    <Lock size={12} />
                    <span>Connect your wallet to purchase</span>
                  </div>
                )}
                <button
                  onClick={needsApproval ? handleApprove : handlePurchase}
                  disabled={isTxLoading || !isConnected || !live.isActive}
                  className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'var(--accent)', color: 'white', boxShadow: '0 4px 14px rgba(18,45,69,0.2)' }}
                  onMouseEnter={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.background = 'var(--accent-hover)'
                      e.currentTarget.style.boxShadow = '0 6px 18px rgba(16,97,166,0.28)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--accent)'
                    e.currentTarget.style.boxShadow = '0 4px 14px rgba(18,45,69,0.2)'
                  }}
                >
                  {isTxLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {buttonLabel}
                    </span>
                  ) : (
                    buttonLabel
                  )}
                </button>
              </div>
            )}
          </div>

          {isPurchaseSuccess && purchaseTxHash && (
            <a
              href={buildTxExplorerUrl(TARGET_CHAIN_ID, purchaseTxHash) ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium"
              style={{ color: 'var(--accent)' }}
            >
              <ExternalLink size={12} />
              View transaction
            </a>
          )}

          {/* How escrow works */}
          {!unlocked && (
            <div
              className="rounded-xl p-4 border space-y-2.5"
              style={{ background: 'rgba(26,128,71,0.05)', borderColor: 'rgba(26,128,71,0.18)' }}
            >
              <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                <ShieldCheck size={15} style={{ color: 'var(--success)' }} /> Protected by escrow
              </p>
              <ul className="text-xs space-y-1.5" style={{ color: 'var(--muted)', lineHeight: 1.55 }}>
                <li className="flex gap-2"><Eye size={13} className="mt-0.5 flex-shrink-0" /> Your link unlocks the moment payment confirms.</li>
                <li className="flex gap-2"><Clock size={13} className="mt-0.5 flex-shrink-0" /> Funds are held for 5 days. Open a dispute any time before they release.</li>
                <li className="flex gap-2"><Fingerprint size={13} className="mt-0.5 flex-shrink-0" /> Verify your download against the creator&apos;s committed file hash.</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--subtle)', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div className={`font-semibold ${mono ? 'mono text-xs' : ''}`} style={{ color: 'var(--ink)' }}>
        {value}
      </div>
    </div>
  )
}
