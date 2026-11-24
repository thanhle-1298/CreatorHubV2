import { AlertCircle, CheckCircle, Download, ExternalLink, Loader2, Lock, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface ContentLinkPanelProps {
  url: string | undefined
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  isCreator: boolean
  /** Forces a fresh RPC read. */
  onRetry: () => void
}

/** The buyer's unlocked link with explicit loading, error (with Retry) and empty states. */
export default function ContentLinkPanel({ url, isLoading, isFetching, isError, isCreator, onRetry }: ContentLinkPanelProps) {
  const ready = !!url && url.length > 0
  const pending = (isLoading || isFetching) && !ready
  const failed = !pending && isError && !ready
  const empty = !pending && !failed && !ready

  return (
    <div
      className="rounded-2xl p-5 border"
      style={{ background: 'rgba(26,128,71,0.06)', borderColor: 'rgba(26,128,71,0.2)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CheckCircle size={18} style={{ color: 'var(--success)' }} />
          <span className="font-semibold text-sm" style={{ color: 'var(--success)' }}>
            {isCreator ? 'Your content' : 'Content unlocked'}
          </span>
        </div>
        <button
          onClick={onRetry}
          disabled={isFetching}
          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-40"
          style={{ color: 'var(--accent)', background: 'rgba(16,97,166,0.06)', border: '1px solid rgba(16,97,166,0.12)' }}
        >
          <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
          {isFetching ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {pending && (
        <div className="flex items-center gap-2.5 text-sm py-2" style={{ color: 'var(--muted)' }}>
          <Loader2 size={15} className="animate-spin flex-shrink-0" />
          Fetching your content link…
        </div>
      )}

      {failed && (
        <div className="space-y-3">
          <div
            className="flex items-start gap-2 text-sm p-3 rounded-xl"
            style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}
            role="alert"
          >
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">Could not load the link</p>
              <p className="text-xs opacity-80">
                Your purchase is confirmed on-chain. The network may be a few seconds behind. Retry to force a fresh read.
              </p>
            </div>
          </div>
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg"
            style={{ background: 'var(--surface-strong)', color: 'var(--accent)', border: '1px solid var(--border)' }}
          >
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {ready && (
        <div className="space-y-3">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm font-semibold rounded-xl px-4 py-3.5 transition-all"
            style={{ background: 'var(--success)', color: 'white', boxShadow: '0 4px 14px rgba(26,128,71,0.25)' }}
          >
            <Download size={15} />
            Access Content
            <ExternalLink size={13} className="ml-auto" />
          </a>
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 border"
            style={{ background: 'rgba(255,255,255,0.7)', borderColor: 'rgba(26,128,71,0.15)' }}
          >
            <Lock size={12} style={{ color: 'var(--success)', flexShrink: 0 }} />
            <span className="text-xs mono truncate flex-1 select-all" style={{ color: 'var(--ink)' }} title={url}>
              {url}
            </span>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(url)
                toast.success('Link copied')
              }}
              className="text-xs font-semibold flex-shrink-0"
              style={{ color: 'var(--accent)' }}
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {empty && (
        <div
          className="flex items-start gap-2 text-sm p-3 rounded-xl"
          style={{ background: 'rgba(245,158,11,0.08)', color: '#92400e', border: '1px solid rgba(245,158,11,0.2)' }}
        >
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" style={{ color: '#d97706' }} />
          <span>
            {isCreator
              ? 'You have not added a content link yet. Add one from your dashboard so buyers can access it.'
              : 'The creator has not added a download link yet. You are protected by the dispute window: contact the creator or open a dispute if it is not delivered.'}
          </span>
        </div>
      )}
    </div>
  )
}
