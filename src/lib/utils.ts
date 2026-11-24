export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function formatUsdc(amount: bigint, decimals = 6): string {
  const n = Number(amount) / 10 ** decimals
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function parseUsdcAmount(amount: string, decimals = 6): bigint {
  const n = parseFloat(amount)
  if (isNaN(n) || n < 0) return 0n
  return BigInt(Math.round(n * 10 ** decimals))
}

export function timeAgo(timestamp: bigint): string {
  const seconds = Math.floor(Date.now() / 1000) - Number(timestamp)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

// Walk the full viem/ethers error chain to find the deepest revert reason.
function extractRawMessage(error: unknown): string {
  let msg = ''
  let cur: unknown = error
  let depth = 0
  while (cur && depth < 8) {
    if (typeof cur === 'string') { msg += ' ' + cur; break }
    const e = cur as Record<string, unknown>
    if (typeof e['message'] === 'string') msg += ' ' + e['message']
    if (typeof e['shortMessage'] === 'string') msg += ' ' + e['shortMessage']
    if (typeof e['details'] === 'string') msg += ' ' + e['details']
    cur = e['cause']
    depth++
  }
  return msg.toLowerCase()
}

// Extract a human-readable revert reason from the error chain.
function extractRevertReason(error: unknown): string | null {
  let cur: unknown = error
  let depth = 0
  while (cur && depth < 8) {
    const e = cur as Record<string, unknown>
    // viem ContractFunctionRevertedError
    if (e['name'] === 'ContractFunctionRevertedError') {
      const data = e['data'] as Record<string, unknown> | undefined
      if (typeof data?.['errorName'] === 'string') return data['errorName']
      if (typeof e['reason'] === 'string') return e['reason']
    }
    // viem TransactionExecutionError has a short message
    if (typeof e['shortMessage'] === 'string' && (e['shortMessage']).length < 120) {
      const sm = e['shortMessage']
      if (!sm.includes('Unknown')) return sm
    }
    cur = e['cause']
    depth++
  }
  return null
}

export function parseOnchainError(error: unknown): string {
  const msg = extractRawMessage(error)
  const code = (error as { code?: number })?.code

  // User cancelled in wallet
  if (msg.includes('user rejected') || msg.includes('user denied') || code === 4001) {
    return 'Transaction cancelled.'
  }

  // Insufficient gas / funds (Arc uses USDC as gas)
  if (
    msg.includes('insufficient funds') ||
    msg.includes('insufficient balance') ||
    msg.includes('exceeds balance') ||
    msg.includes('gas required exceeds') ||
    msg.includes('out of gas') ||
    msg.includes('cannot afford')
  ) {
    return 'Insufficient USDC for gas. Make sure your wallet has USDC on Arc to pay transaction fees.'
  }

  // Contract-level custom errors
  if (msg.includes('alreadypurchased')) return 'You already own this content.'
  if (msg.includes('contentnotactive')) return 'This content is no longer available.'
  if (msg.includes('priceexceedsmax')) return 'Price changed — please refresh and try again.'
  if (msg.includes('notcontentcreator')) return 'Only the creator can edit this content.'
  if (msg.includes('contentnotfound')) return 'Content not found.'
  if (msg.includes('feetoolhigh')) return 'Protocol fee too high.'
  if (msg.includes('unauthorized')) return 'Not authorized for this action.'

  // V2 escrow / rating / listing errors
  if (msg.includes('zerocontenthash')) return 'A content hash is required. Compute it from your file or paste a SHA-256.'
  if (msg.includes('invalidprice')) return 'Price must be greater than zero.'
  if (msg.includes('emptytitle')) return 'A title is required.'
  if (msg.includes('creatorcannotbuy')) return 'You cannot buy your own listing.'
  if (msg.includes('notbuyer')) return 'Only the buyer can open a dispute.'
  if (msg.includes('notarbiter')) return 'Only the arbiter can resolve disputes.'
  if (msg.includes('arbiterconflict')) return 'The arbiter cannot resolve a dispute they are part of.'
  if (msg.includes('disputewindowclosed')) return 'The 5-day dispute window has ended.'
  if (msg.includes('disputewindowopen')) return 'The dispute window is still open. Funds can be released after it ends.'
  if (msg.includes('arbitertimeoutelapsed')) return 'The arbiter deadline has passed. The buyer can now claim a refund.'
  if (msg.includes('timeoutnotreached')) return 'The 14-day arbiter deadline has not passed yet.'
  if (msg.includes('invalidescrowstate')) return 'This purchase is not in a state that allows that action.'
  if (msg.includes('escrownotfound')) return 'Purchase record not found.'
  if (msg.includes('notverifiedbuyer')) return 'Only buyers with an active purchase can rate.'
  if (msg.includes('invalidrating')) return 'Choose a rating from 1 to 5 stars.'
  if (msg.includes('alreadyrated')) return 'You already rated this listing.'
  if (msg.includes('reviewtoolong')) return 'Review is too long (max 1000 characters).'

  // Network / RPC errors
  if (msg.includes('network') || msg.includes('timeout') || msg.includes('connection')) {
    return 'Network error. Please check your connection and retry.'
  }

  // Try to surface the deepest revert reason
  const reason = extractRevertReason(error)
  if (reason) return `Transaction failed: ${reason}`

  // Last resort: show a truncated version of the raw error message so it's debuggable
  const rawMsg = ((error as { message?: string })?.message ?? '').slice(0, 160)
  if (rawMsg) return `Error: ${rawMsg}`

  return 'Something went wrong. Please try again.'
}
