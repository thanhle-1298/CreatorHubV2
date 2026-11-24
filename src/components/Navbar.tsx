import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import {
  Layers, Compass, ShoppingBag, LayoutDashboard,
  Menu, X, Plus, Radio, Gavel,
} from 'lucide-react'
import { getUsdc } from '../onchain-facts'
import { formatUsdc, formatAddress } from '../lib/utils'
import { activeChain } from '../config'
import { NETWORK } from '../env'

export type Page = 'explore' | 'purchases' | 'dashboard' | 'list' | 'arbiter'

interface NavbarProps {
  page: Page
  onNavigate: (page: Page) => void
  /** True when the connected wallet is the contract's arbiter. */
  showArbiter?: boolean
}

// Shown in the network badge. Mainnet is just "Arc".
const NETWORK_LABEL = NETWORK === 'testnet' ? 'Arc Testnet' : 'Arc'

export default function Navbar({ page, onNavigate, showArbiter }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { address, isConnected, chainId } = useAccount()

  const usdcFact = getUsdc(activeChain.id)
  const { data: balance } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: activeChain.id,
    query: { enabled: !!address && !!usdcFact, refetchInterval: 15_000 },
  })

  const isArcMainnet = chainId === activeChain.id
  const onArc = isConnected && isArcMainnet

  const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: 'explore',   label: 'Explore',      icon: <Compass size={16} /> },
    { id: 'purchases', label: 'My Purchases', icon: <ShoppingBag size={16} /> },
    { id: 'dashboard', label: 'Dashboard',    icon: <LayoutDashboard size={16} /> },
    ...(showArbiter ? [{ id: 'arbiter' as Page, label: 'Disputes', icon: <Gavel size={16} /> }] : []),
  ]

  const handleNav = (p: Page) => {
    onNavigate(p)
    setMenuOpen(false)
  }

  return (
    <>
      {/* ── Top bar ── */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          background: 'rgba(255,255,255,0.94)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">

          {/* Logo */}
          <button
            onClick={() => handleNav('explore')}
            className="flex items-center gap-2.5 flex-shrink-0 group"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: 'var(--accent)',
                boxShadow: '0 2px 10px rgba(18,45,69,0.26)',
                transition: 'box-shadow 160ms ease',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 14px rgba(16,97,166,0.34)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 10px rgba(18,45,69,0.26)' }}
            >
              <Layers size={18} className="text-white" />
            </div>
            <div className="hidden sm:block">
              <span
                className="display font-bold text-xl block leading-tight"
                style={{ color: 'var(--ink)', letterSpacing: '-0.025em' }}
              >
                CreatorHub
              </span>
              <span
                className="text-[10px] font-semibold tracking-widest uppercase block"
                style={{ color: 'var(--subtle)', letterSpacing: '0.09em', marginTop: '-1px' }}
              >
                Digital Marketplace
              </span>
            </div>
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5">
            {navItems.map((item) => {
              const active = page === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  className="relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm transition-all"
                  style={{
                    color: active ? 'var(--accent)' : 'var(--muted)',
                    background: active ? 'rgba(18,45,69,0.07)' : 'transparent',
                    fontWeight: active ? 600 : 500,
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = 'rgba(18,45,69,0.04)'
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {item.icon}
                  {item.label}
                  {active && (
                    <span
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full"
                      style={{ background: 'var(--accent)' }}
                    />
                  )}
                </button>
              )
            })}
          </nav>

          {/* Right cluster */}
          <div className="flex items-center gap-2">

            {/* Network badge — always visible when connected */}
            {isConnected && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                style={{
                  background: onArc ? 'rgba(26,128,71,0.09)' : 'rgba(186,43,76,0.09)',
                  color: onArc ? 'var(--success)' : 'var(--danger)',
                  border: `1px solid ${onArc ? 'rgba(26,128,71,0.18)' : 'rgba(186,43,76,0.18)'}`,
                }}
              >
                <Radio size={10} className={onArc ? '' : 'opacity-70'} />
                <span className="hidden sm:inline">{onArc ? NETWORK_LABEL : 'Wrong network'}</span>
                <span className="sm:hidden">{onArc ? 'Arc' : '!'}</span>
              </div>
            )}

            {/* USDC balance — desktop */}
            {onArc && balance !== undefined && (
              <div
                className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold tabular-nums"
                style={{
                  background: 'var(--surface-muted)',
                  borderColor: 'var(--border)',
                  color: 'var(--ink)',
                }}
              >
                {formatUsdc(balance)} USDC
                <span className="mono font-normal" style={{ color: 'var(--subtle)' }}>
                  {formatAddress(address!)}
                </span>
              </div>
            )}

            {/* List Content CTA */}
            <button
              onClick={() => handleNav('list')}
              className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
              style={{
                background: 'var(--accent)',
                color: 'white',
                boxShadow: '0 2px 10px rgba(18,45,69,0.22)',
                transition: 'background 160ms ease, box-shadow 160ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--accent-hover)'
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(16,97,166,0.32)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--accent)'
                e.currentTarget.style.boxShadow = '0 2px 10px rgba(18,45,69,0.22)'
              }}
            >
              <Plus size={15} />
              List Content
            </button>

            <ConnectKitButton />

            {/* Hamburger — mobile */}
            <button
              className="md:hidden p-2 rounded-xl transition-colors"
              style={{ color: 'var(--muted)', background: menuOpen ? 'var(--surface-muted)' : 'transparent' }}
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {menuOpen && (
          <div
            className="md:hidden border-t"
            style={{ background: 'rgba(255,255,255,0.98)', borderColor: 'var(--border)' }}
          >
            <div className="px-4 py-3 space-y-1">
              {navItems.map((item) => {
                const active = page === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-left"
                    style={{
                      color: active ? 'var(--accent)' : 'var(--ink)',
                      background: active ? 'rgba(18,45,69,0.06)' : 'transparent',
                      fontWeight: active ? 600 : 500,
                    }}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                )
              })}

              <button
                onClick={() => handleNav('list')}
                className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-semibold mt-1"
                style={{
                  background: 'var(--accent)',
                  color: 'white',
                  boxShadow: '0 2px 8px rgba(18,45,69,0.18)',
                }}
              >
                <Plus size={15} />
                List Content
              </button>

              {isConnected && address && (
                <div
                  className="flex items-center justify-between px-3 py-3 rounded-xl mt-1"
                  style={{ background: 'var(--surface-muted)' }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: isArcMainnet ? 'var(--success)' : 'var(--danger)' }}
                    />
                    <span className="text-xs mono" style={{ color: 'var(--muted)' }}>
                      {formatAddress(address)}
                    </span>
                  </div>
                  {isArcMainnet && balance !== undefined && (
                    <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {formatUsdc(balance)} USDC
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ── Mobile bottom tab bar ── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t flex"
        style={{
          background: 'rgba(255,255,255,0.96)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderColor: 'var(--border)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {navItems.map((item) => {
          const active = page === item.id
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className="flex-1 flex flex-col items-center gap-1 pt-2.5 pb-3 text-[11px] font-medium transition-colors"
              style={{ color: active ? 'var(--accent)' : 'var(--subtle)' }}
            >
              <span
                className="flex items-center justify-center w-6 h-6 rounded-lg transition-all"
                style={{ background: active ? 'rgba(18,45,69,0.08)' : 'transparent' }}
              >
                {item.icon}
              </span>
              {item.label === 'My Purchases' ? 'Purchases' : item.label}
            </button>
          )
        })}
        <button
          onClick={() => handleNav('list')}
          className="flex-1 flex flex-col items-center gap-1 pt-2.5 pb-3 text-[11px] font-semibold transition-colors"
          style={{ color: page === 'list' ? 'var(--accent)' : 'var(--accent)' }}
        >
          <span
            className="flex items-center justify-center w-6 h-6 rounded-lg"
            style={{ background: 'var(--accent)' }}
          >
            <Plus size={14} className="text-white" />
          </span>
          List
        </button>
      </nav>
    </>
  )
}
