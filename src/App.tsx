import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import Navbar, { type Page } from './components/Navbar'
import ExplorePage from './components/ExplorePage'
import ContentDetail from './components/ContentDetail'
import PurchasesPage from './components/PurchasesPage'
import DashboardPage from './components/DashboardPage'
import ListContentPage from './components/ListContentPage'
import ArbiterPage from './components/ArbiterPage'
import { activeChain } from './config'
import { CREATOR_HUB_V2, V2_CONFIGURED } from './contract'
import type { ContentV2 } from './types'

export default function App() {
  const [page, setPage] = useState<Page>('explore')
  const [selectedContent, setSelectedContent] = useState<ContentV2 | null>(null)
  const { address } = useAccount()

  // The Disputes tab only appears for the contract's arbiter wallet.
  const { data: arbiter } = useReadContract({
    ...CREATOR_HUB_V2,
    functionName: 'arbiter',
    chainId: activeChain.id,
    query: { enabled: V2_CONFIGURED },
  })
  const isArbiter = !!address && !!arbiter && (arbiter as string).toLowerCase() === address.toLowerCase()

  const handleNavigate = (target: Page) => {
    setSelectedContent(null)
    setPage(target)
  }

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      <Navbar page={selectedContent ? 'explore' : page} onNavigate={handleNavigate} showArbiter={isArbiter} />

      <main className="pb-24 md:pb-8">
        {selectedContent ? (
          <ContentDetail content={selectedContent} onBack={() => setSelectedContent(null)} />
        ) : page === 'explore' ? (
          <ExplorePage onSelectContent={setSelectedContent} onListContent={() => handleNavigate('list')} />
        ) : page === 'purchases' ? (
          <PurchasesPage onSelectContent={setSelectedContent} onBrowse={() => handleNavigate('explore')} />
        ) : page === 'dashboard' ? (
          <DashboardPage onSelectContent={setSelectedContent} onListNew={() => handleNavigate('list')} />
        ) : page === 'list' ? (
          <ListContentPage onBack={() => handleNavigate('dashboard')} onSuccess={() => handleNavigate('dashboard')} />
        ) : page === 'arbiter' ? (
          <ArbiterPage />
        ) : null}
      </main>
    </div>
  )
}
