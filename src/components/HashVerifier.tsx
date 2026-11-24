import { useRef, useState } from 'react'
import { Fingerprint, Copy, FileCheck2, FileX2, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { sha256File } from '../lib/hash'

interface HashVerifierProps {
  /** The creator's committed bytes32 content hash. */
  hash: `0x${string}`
}

type Result = { state: 'idle' } | { state: 'hashing' } | { state: 'match' } | { state: 'mismatch'; actual: string }

/**
 * Shows the on-chain content hash and lets the buyer check a downloaded file
 * against it. Hashing happens locally in the browser; the file is never uploaded.
 */
export default function HashVerifier({ hash }: HashVerifierProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<Result>({ state: 'idle' })
  const [fileName, setFileName] = useState('')

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setFileName(file.name)
    setResult({ state: 'hashing' })
    try {
      const actual = await sha256File(file)
      setResult(actual.toLowerCase() === hash.toLowerCase() ? { state: 'match' } : { state: 'mismatch', actual })
    } catch {
      setResult({ state: 'idle' })
      toast.error('Could not read that file. Try a smaller file or a different browser.')
    }
  }

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ background: 'rgba(255,255,255,0.7)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center gap-2">
        <Fingerprint size={15} style={{ color: 'var(--accent)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Content hash</span>
        <span className="text-xs" style={{ color: 'var(--subtle)' }}>SHA-256 committed by the creator</span>
      </div>

      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2 border"
        style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
      >
        <span className="mono text-xs break-all flex-1 select-all" style={{ color: 'var(--ink)' }}>{hash}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(hash)
            toast.success('Hash copied')
          }}
          className="flex-shrink-0 p-1 rounded-md"
          style={{ color: 'var(--accent)' }}
          title="Copy hash"
        >
          <Copy size={14} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={result.state === 'hashing'}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors disabled:opacity-50"
          style={{ background: 'var(--surface-strong)', color: 'var(--accent)', borderColor: 'var(--border)' }}
        >
          {result.state === 'hashing' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          Verify a downloaded file
        </button>
        <span className="text-xs" style={{ color: 'var(--subtle)' }}>
          Checked in your browser. The file is never uploaded.
        </span>
      </div>

      {result.state === 'match' && (
        <div
          className="flex items-start gap-2 text-sm p-3 rounded-lg"
          style={{ background: 'rgba(26,128,71,0.1)', color: 'var(--success)' }}
          role="status"
        >
          <FileCheck2 size={16} className="mt-0.5 flex-shrink-0" />
          <span><strong>Match.</strong> {fileName} is exactly the file the creator committed to.</span>
        </div>
      )}
      {result.state === 'mismatch' && (
        <div
          className="flex items-start gap-2 text-sm p-3 rounded-lg"
          style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}
          role="alert"
        >
          <FileX2 size={16} className="mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p><strong>No match.</strong> {fileName} differs from the committed file.</p>
            <p className="mono text-xs break-all mt-1 opacity-80">{result.actual}</p>
            <p className="text-xs mt-1 opacity-80">
              If the creator zipped or re-exported the files, the hash will differ. If you think the delivery is wrong, you can open a dispute before the window ends.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
