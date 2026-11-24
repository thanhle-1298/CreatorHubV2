/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { requireChain, type OnchainChain } from './onchain-facts'
import { NETWORK, RPC_URL } from './env'

// Chain definitions come from the shared onchain-facts registry, never typed by hand.
function toChain(facts: OnchainChain) {
  return defineChain({
    id: facts.chainId,
    name: facts.name,
    nativeCurrency: { name: 'USD Coin', symbol: facts.nativeCurrency.symbol, decimals: facts.nativeCurrency.decimals },
    rpcUrls: { default: { http: facts.rpcUrls } },
    blockExplorers: { default: { name: 'Arc Explorer', url: facts.explorerBase } },
    testnet: facts.isTestnet,
  })
}

/** Arc Mainnet (chain 5042). USDC is the native gas token. */
export const arcMainnet = toChain(requireChain(5042))
/** Arc Testnet, used only when VITE_NETWORK=testnet. */
export const arcTestnet = toChain(requireChain(5042002))

/** The chain the app targets, selected by VITE_NETWORK. */
export const activeChain = NETWORK === 'testnet' ? arcTestnet : arcMainnet

const activeRpc = RPC_URL ?? activeChain.rpcUrls.default.http[0]

// Pre-register chain RPC so trace events show correct chain names immediately
registerChain(activeChain.id, activeRpc)

export const config = createConfig({
  chains: [activeChain, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [activeChain.id]: http(activeRpc),
    [mainnet.id]: http(), // ENS resolution
  },
})
