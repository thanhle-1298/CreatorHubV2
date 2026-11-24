import { useEffect, useRef } from 'react'
import {
  useAccount, useReadContract, useReadContracts, useSwitchChain, useWaitForTransactionReceipt, useWriteContract,
} from 'wagmi'
import type { Abi } from 'viem'
import { ArrowDownToLine, CheckCircle, Clock, History, Loader2, RefreshCw, ShieldAlert, Wallet } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { toast } from 'sonner'
import { activeChain, arcMainnet } from '../config'
import { CREATOR_HUB, CREATOR_HUB_V2, LEGACY_AVAILABLE, V2_CONFIGURED } from '../contract'
import { formatUsdc, parseOnchainError } from '../lib/utils'
import { buildTxExplorerUrl } from '../onchain-facts'

interface Target {
  address: `0x${string}`
  abi: Abi
}

interface WithdrawButtonProps {
  target: Target
  chainId: number
  amount: bigint
  label: string
  onDone: () => void
}

/** Calls withdraw() on the given contract and shows pending, success and error feedback. */
function WithdrawButton({ target, chainId, amount, label, onDone }: WithdrawButtonProps) {
  const { chainId: walletChain } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongChain = !!walletChain && walletChain !== chainId
  const { writeContract, data: txHash, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })
  const started = useRef<bigint | null>(null)

  useEffect(() => {
    if (!isSuccess || started.current === null) return
    toast.success(`${formatUsdc(started.current)} USDC sent to your wallet.`, {
      action: txHash
        ? { label: 'View', onClick: () => window.open(buildTxExplorerUrl(chainId, txHash) ?? '#', '_blank', 'noopener') }
        : undefined,
    })
    started.current = null
    reset()
    onDone()
  }, [isSuccess, txHash, chainId, onDone, reset])

  const busy = isPending || isConfirming
  const has = amount > 0n

  return (
    <button
      disabled={(!has && !wrongChain) || busy}
      onClick={() => {
        if (wrongChain) { switchChain({ chainId }); return }
        started.current = amount
        writeContract(
          { address: target.address, abi: target.abi, functionName: 'withdraw', chainId },
          { onError: (e) => { started.current = null; toast.error(parseOnchainError(e)) } },
        )
      }}
      className="flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed"
      style={{
        background: wrongChain ? 'var(--danger)' : has ? 'var(--success)' : 'var(--surface-muted)',
        color: wrongChain || has ? 'white' : 'var(--subtle)',
        boxShadow: has && !wrongChain ? '0 4px 14px rgba(26,128,71,0.25)' : 'none',
        opacity: busy ? 0.8 : 1,
      }}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowDownToLine size={15} />}
      {wrongChain
        ? 'Switch network first'
        : isPending
          ? 'Confirm in wallet…'
          : isConfirming
            ? 'Processing…'
            : has
              ? `${label} ${formatUsdc(amount)} USDC`
              : 'Nothing to withdraw yet'}
    </button>
  )
}

function Row({ icon, title, hint, children, tone }: { icon: React.ReactNode; title: string; hint: string; children: React.ReactNode; tone?: 'success' | 'warn' | 'danger' }) {
  const bg = tone === 'success' ? 'rgba(26,128,71,0.07)' : tone === 'warn' ? 'rgba(245,158,11,0.09)' : tone === 'danger' ? 'rgba(186,43,76,0.07)' : 'var(--surface-muted)'
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl" style={{ background: bg }}>
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="mt-0.5 flex-shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{title}</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>{hint}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-sm font-semibold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>
        <TokenUSDC size={13} variant="branded" />
        {children}
      </div>
    </div>
  )
}

interface EarningsCardProps {
  address: `0x${string}`
  /** Lifetime released earnings across all listings. */
  lifetimeEarnings: bigint
  onChanged: () => void
}

/** Seller balance: claimable now, held in escrow, frozen in disputes, plus V1 legacy earnings. */
export default function EarningsCard({ address, lifetimeEarnings, onChanged }: EarningsCardProps) {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { ...CREATOR_HUB_V2, functionName: 'pendingWithdrawals', args: [address], chainId: activeChain.id },
      { ...CREATOR_HUB_V2, functionName: 'getCreatorEscrowTotals', args: [address], chainId: activeChain.id },
    ],
    query: { enabled: V2_CONFIGURED, refetchInterval: 10_000 },
  })
  const claimable = (data?.[0]?.result as bigint | undefined) ?? 0n
  const totals = data?.[1]?.result as readonly [bigint, bigint] | undefined
  const held = totals?.[0] ?? 0n
  const disputed = totals?.[1] ?? 0n

  const { data: legacyData, refetch: refetchLegacy } = useReadContract({
    ...CREATOR_HUB,
    functionName: 'pendingWithdrawals',
    args: [address],
    chainId: arcMainnet.id,
    query: { enabled: LEGACY_AVAILABLE, refetchInterval: 20_000 },
  })
  const legacyPending = (legacyData as bigint | undefined) ?? 0n

  const done = () => { void refetch(); void refetchLegacy(); onChanged() }

  return (
    <div
      className="rounded-2xl border p-5 sm:p-6 mb-8"
      style={{
        background: 'rgba(255,255,255,0.9)',
        borderColor: claimable > 0n ? 'rgba(26,128,71,0.25)' : 'var(--border)',
        boxShadow: '0 6px 24px rgba(18,45,69,0.07), inset 0 1px 0 rgba(255,255,255,0.7)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet size={17} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold text-base" style={{ color: 'var(--ink)' }}>Earnings &amp; escrow</h2>
        </div>
        <button
          onClick={() => void refetch()}
          className="p-2 rounded-lg"
          style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
          title="Refresh balances"
          aria-label="Refresh balances"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="space-y-2.5 mb-4">
        <Row
          tone={claimable > 0n ? 'success' : undefined}
          icon={<CheckCircle size={15} style={{ color: 'var(--success)' }} />}
          title="Ready to withdraw"
          hint="Released after the 5-day window (97.5% of each sale)"
        >
          {isLoading ? <span className="skeleton inline-block h-4 w-16" /> : formatUsdc(claimable)}
        </Row>
        <Row
          tone={held > 0n ? 'warn' : undefined}
          icon={<Clock size={15} style={{ color: '#b45309' }} />}
          title="Pending in escrow"
          hint="Inside the dispute window. Releases automatically after day 5."
        >
          {isLoading ? <span className="skeleton inline-block h-4 w-16" /> : formatUsdc(held)}
        </Row>
        <Row
          tone={disputed > 0n ? 'danger' : undefined}
          icon={<ShieldAlert size={15} style={{ color: 'var(--danger)' }} />}
          title="Frozen by dispute"
          hint="Held until the arbiter decides (or the buyer is refunded after 14 days)"
        >
          {isLoading ? <span className="skeleton inline-block h-4 w-16" /> : formatUsdc(disputed)}
        </Row>
        <Row icon={<History size={15} style={{ color: 'var(--muted)' }} />} title="Lifetime earned" hint="Total released to you across all listings">
          {formatUsdc(lifetimeEarnings)}
        </Row>
      </div>

      <div className="flex items-center gap-3">
        <WithdrawButton target={CREATOR_HUB_V2} chainId={activeChain.id} amount={claimable} label="Withdraw" onDone={done} />
      </div>

      {LEGACY_AVAILABLE && legacyPending > 0n && (
        <div className="mt-4 pt-4 border-t space-y-2.5" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            You also have earnings from the original CreatorHub contract. These were paid with no escrow.
          </p>
          <div className="flex items-center gap-3">
            <WithdrawButton target={CREATOR_HUB} chainId={arcMainnet.id} amount={legacyPending} label="Withdraw legacy" onDone={done} />
          </div>
        </div>
      )}
    </div>
  )
}
