import { useState, useCallback, useMemo, useRef } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useBalance } from 'wagmi'
import { activeChain } from '../config'
import {
  ArrowLeft, ImageIcon, Link2, FileText, DollarSign,
  CheckCircle, AlertCircle, Info, Lock, Eye, EyeOff,
  Sparkles, ChevronRight, Fingerprint, Upload, Loader2, ShieldCheck,
} from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { CREATOR_HUB_V2, V2_CONFIGURED } from '../contract'
import { parseUsdcAmount, parseOnchainError } from '../lib/utils'
import { isValidContentHash, normalizeHash, sha256File } from '../lib/hash'

const TARGET_CHAIN_ID = activeChain.id
const PROTOCOL_FEE_BPS = 250 // 2.5%

// ─── helpers ─────────────────────────────────────────────────────────────────

function calcPayout(priceStr: string): string | null {
  const n = parseFloat(priceStr)
  if (!Number.isFinite(n) || n <= 0) return null
  const payout = n * (1 - PROTOCOL_FEE_BPS / 10_000)
  return payout.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
}

function isValidUrl(s: string): boolean {
  try { new URL(s); return true } catch { return false }
}

type FieldKey = 'title' | 'description' | 'coverImageUrl' | 'contentUrl' | 'contentHash' | 'priceUsdc'

type Errors = Partial<Record<FieldKey, string>>

function validate(form: Record<FieldKey, string>, touched: Partial<Record<FieldKey, boolean>>): Errors {
  const e: Errors = {}
  if (touched.title) {
    if (!form.title.trim()) e.title = 'Title is required.'
    else if (form.title.trim().length < 3) e.title = 'Title must be at least 3 characters.'
    else if (form.title.trim().length > 80) e.title = 'Title must be 80 characters or fewer.'
  }
  if (touched.description) {
    if (!form.description.trim()) e.description = 'Description is required.'
    else if (form.description.trim().length < 10) e.description = 'Add at least 10 characters.'
    else if (form.description.trim().length > 500) e.description = 'Keep it under 500 characters.'
  }
  if (touched.coverImageUrl && form.coverImageUrl && !isValidUrl(form.coverImageUrl)) {
    e.coverImageUrl = 'Enter a valid URL (must start with https://).'
  }
  if (touched.contentUrl) {
    if (!form.contentUrl.trim()) e.contentUrl = 'Content URL is required.'
    else if (!isValidUrl(form.contentUrl)) e.contentUrl = 'Enter a valid URL (must start with https://).'
  }
  if (touched.contentHash) {
    if (!form.contentHash.trim()) e.contentHash = 'Content hash is required.'
    else if (!isValidContentHash(normalizeHash(form.contentHash))) {
      e.contentHash = 'Enter a 64-character hex SHA-256 (not all zeros), or compute it from your file.'
    }
  }
  if (touched.priceUsdc) {
    const n = parseFloat(form.priceUsdc)
    if (!form.priceUsdc) e.priceUsdc = 'Price is required.'
    else if (!Number.isFinite(n) || n <= 0) e.priceUsdc = 'Price must be greater than 0.'
    else if (n < 0.01) e.priceUsdc = 'Minimum price is 0.01 USDC.'
  }
  return e
}

function isFormComplete(form: Record<FieldKey, string>): boolean {
  return (
    form.title.trim().length >= 3 &&
    form.title.trim().length <= 80 &&
    form.description.trim().length >= 10 &&
    form.description.trim().length <= 500 &&
    form.contentUrl.trim().length > 0 &&
    isValidUrl(form.contentUrl) &&
    isValidContentHash(normalizeHash(form.contentHash)) &&
    parseFloat(form.priceUsdc) > 0 &&
    (!form.coverImageUrl || isValidUrl(form.coverImageUrl))
  )
}

// ─── sub-components ──────────────────────────────────────────────────────────

function FieldLabel({
  icon, label, required = false, hint
}: {
  icon: React.ReactNode
  label: string
  required?: boolean
  hint?: string
}) {
  return (
    <div className="mb-2">
      <label className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
        <span style={{ color: 'var(--accent)' }}>{icon}</span>
        {label}
        {required && <span style={{ color: 'var(--danger)' }} aria-hidden>*</span>}
      </label>
      {hint && (
        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{hint}</p>
      )}
    </div>
  )
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--danger)' }}>
      <AlertCircle size={12} />
      {msg}
    </div>
  )
}

function FieldSuccess({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--success)' }}>
      <CheckCircle size={12} />
      Looks good!
    </div>
  )
}

// Progress dots showing form completion
function FormProgress({ form }: { form: Record<FieldKey, string> }) {
  const steps = [
    { key: 'title', label: 'Title', done: form.title.trim().length >= 3 },
    { key: 'description', label: 'Description', done: form.description.trim().length >= 10 },
    { key: 'contentUrl', label: 'Content URL', done: isValidUrl(form.contentUrl) },
    { key: 'contentHash', label: 'Content hash', done: isValidContentHash(normalizeHash(form.contentHash)) },
    { key: 'priceUsdc', label: 'Price', done: parseFloat(form.priceUsdc) > 0 },
  ]
  const doneCount = steps.filter(s => s.done).length
  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-3 mb-6 border"
      style={{
        background: 'rgba(16,97,166,0.05)',
        borderColor: 'rgba(16,97,166,0.15)',
      }}
    >
      <div className="flex items-center gap-1.5">
        {steps.map((s) => (
          <div
            key={s.key}
            title={s.label}
            className="w-2 h-2 rounded-full transition-all duration-300"
            style={{
              background: s.done ? 'var(--success)' : 'var(--border)',
              transform: s.done ? 'scale(1.2)' : 'scale(1)',
            }}
          />
        ))}
      </div>
      <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
        {doneCount === 5
          ? <span style={{ color: 'var(--success)' }}>All required fields complete — ready to list!</span>
          : <>{doneCount} of 5 required fields complete</>}
      </p>
    </div>
  )
}

// ─── main component ──────────────────────────────────────────────────────────

interface ListContentPageProps {
  onBack: () => void
  onSuccess: () => void
}

export default function ListContentPage({ onBack, onSuccess }: ListContentPageProps) {
  const { isConnected, chainId, address } = useAccount()
  const { switchChain } = useSwitchChain()

  // Arc uses USDC as native gas — check balance for preflight warning
  const { data: nativeBalance } = useBalance({ address, chainId: TARGET_CHAIN_ID })
  const hasGas = !nativeBalance || nativeBalance.value > 0n

  const [form, setForm] = useState<Record<FieldKey, string>>({
    title: '',
    description: '',
    coverImageUrl: '',
    contentUrl: '',
    contentHash: '',
    priceUsdc: '',
  })
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({})
  const hashFileInput = useRef<HTMLInputElement>(null)
  const [hashing, setHashing] = useState(false)
  const [hashedFileName, setHashedFileName] = useState('')
  const [showContentUrl, setShowContentUrl] = useState(false)
  const [coverError, setCoverError] = useState(false)

  const isWrongChain = isConnected && chainId !== TARGET_CHAIN_ID

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const errors = useMemo(() => validate(form, touched), [form, touched])
  const isValid = isFormComplete(form)
  const payout = calcPayout(form.priceUsdc)

  const handleChange = useCallback((field: FieldKey, value: string) => {
    setForm(f => ({ ...f, [field]: value }))
    if (field === 'coverImageUrl') setCoverError(false)
  }, [])

  const handleBlur = useCallback((field: FieldKey) => {
    setTouched(t => ({ ...t, [field]: true }))
  }, [])

  // touch everything on submit attempt
  const touchAll = useCallback(() => {
    setTouched({
      title: true, description: true, coverImageUrl: true, contentUrl: true, contentHash: true, priceUsdc: true,
    })
  }, [])

  // Hash a local file in the browser (never uploaded) and fill the field.
  const computeHash = async (file: File | undefined) => {
    if (!file) return
    setHashing(true)
    try {
      const hash = await sha256File(file)
      setForm((f) => ({ ...f, contentHash: hash }))
      setHashedFileName(file.name)
      setTouched((t) => ({ ...t, contentHash: true }))
    } catch {
      toast.error('Could not read that file. Try a smaller file or paste the hash instead.')
    } finally {
      setHashing(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    touchAll()
    if (!isConnected) return
    if (isWrongChain) { switchChain({ chainId: TARGET_CHAIN_ID }); return }
    if (!isValid) return

    const price = parseUsdcAmount(form.priceUsdc)
    if (price === 0n) { toast.error('Enter a valid price.'); return }

    writeContract(
      {
        ...CREATOR_HUB_V2,
        functionName: 'listContent',
        chainId: TARGET_CHAIN_ID,
        args: [
          form.title.trim(),
          form.description.trim(),
          form.coverImageUrl.trim(),
          form.contentUrl.trim(),
          normalizeHash(form.contentHash) as `0x${string}`,
          price,
        ],
      },
      {
        onSuccess: () => {
          toast.success('Content listed! Redirecting to your dashboard…')
          setTimeout(onSuccess, 1400)
        },
        onError: (e) => {
          console.error('[CreatorHub] listContent error:', e)
          toast.error(parseOnchainError(e))
        },
      },
    )
  }

  const inputBase =
    'w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all font-medium placeholder:font-normal'
  const inputStyle = (hasError: boolean) => ({
    background: 'rgba(255,255,255,0.92)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    borderColor: hasError ? 'var(--danger)' : 'var(--border)',
    color: 'var(--ink)',
    boxShadow: hasError ? '0 0 0 3px rgba(186,43,76,0.1)' : 'none',
  })

  const focusStyle = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>, hasError: boolean) => {
    if (!hasError) {
      e.currentTarget.style.borderColor = 'var(--focus)'
      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(16,97,166,0.12)'
    }
  }
  const blurStyle = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>, hasError: boolean) => {
    e.currentTarget.style.borderColor = hasError ? 'var(--danger)' : 'var(--border)'
    e.currentTarget.style.boxShadow = hasError ? '0 0 0 3px rgba(186,43,76,0.1)' : 'none'
  }

  // ── V2 contract not configured ─────────────────────────────────────────────
  if (!V2_CONFIGURED) {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-20 text-center">
        <AlertCircle size={40} className="mx-auto mb-4" style={{ color: 'var(--subtle)' }} />
        <h2 className="display font-bold text-2xl mb-2" style={{ color: 'var(--ink)' }}>Listing is not available yet</h2>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          The escrow marketplace contract has not been connected to this app. Set the V2 contract address in the app configuration to enable listing.
        </p>
      </div>
    )
  }

  // ── not connected ──────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-20 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{ background: 'rgba(16,97,166,0.08)' }}
        >
          <Sparkles size={28} style={{ color: 'var(--accent)' }} />
        </div>
        <h2 className="display font-bold text-2xl mb-2" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
          Start selling your work
        </h2>
        <p className="text-sm mb-8 max-w-xs mx-auto" style={{ color: 'var(--muted)' }}>
          Connect your wallet to list digital content and earn USDC instantly.
        </p>
        <div className="flex justify-center">
          <ConnectKitButton />
        </div>
      </div>
    )
  }

  // ── success ────────────────────────────────────────────────────────────────
  if (isSuccess) {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-20 text-center">
        <div
          className="rounded-3xl p-12 border"
          style={{
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderColor: 'rgba(26,128,71,0.2)',
            boxShadow: '0 12px 40px rgba(26,128,71,0.1)',
          }}
        >
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
            style={{ background: 'rgba(26,128,71,0.1)' }}
          >
            <CheckCircle size={36} style={{ color: 'var(--success)' }} />
          </div>
          <h3 className="display font-bold text-3xl mb-3" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            You're live!
          </h3>
          <p className="text-sm mb-2" style={{ color: 'var(--muted)' }}>
            Your content is now listed on CreatorHub.
          </p>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            Redirecting to your dashboard…
          </p>
        </div>
      </div>
    )
  }

  // ── form ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium mb-6 transition-colors"
        style={{ color: 'var(--muted)' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ink)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
      >
        <ArrowLeft size={16} />
        Back to dashboard
      </button>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(16,97,166,0.1)' }}
          >
            <Sparkles size={16} style={{ color: 'var(--accent)' }} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
            New listing
          </p>
        </div>
        <h1
          className="display font-bold text-3xl sm:text-4xl mb-2 text-balance"
          style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
        >
          List Your Content
        </h1>
        <p className="text-sm text-pretty" style={{ color: 'var(--muted)' }}>
          Sell designs, templates, photos, or any creative asset. Buyers pay instantly in USDC — you withdraw earnings anytime.
        </p>
      </div>

      {/* Progress indicator */}
      <FormProgress form={form} />

      {/* Wrong chain banner */}
      {isWrongChain && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl text-sm font-medium mb-6 border"
          style={{
            background: 'rgba(186,43,76,0.06)',
            borderColor: 'rgba(186,43,76,0.2)',
            color: 'var(--danger)',
          }}
        >
          <AlertCircle size={18} className="flex-shrink-0" />
          <span className="flex-1">You're on the wrong network. Switch to Arc to list content.</span>
          <button
            className="text-xs font-semibold underline underline-offset-2"
            onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
          >
            Switch now
          </button>
        </div>
      )}

      {/* No gas warning — Arc uses USDC as gas */}
      {isConnected && !isWrongChain && !hasGas && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl border mb-6"
          style={{
            background: 'rgba(201,120,15,0.06)',
            borderColor: 'rgba(201,120,15,0.25)',
            color: 'rgb(154,88,8)',
          }}
        >
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold mb-0.5">You need USDC to pay gas</p>
            <p className="text-xs leading-relaxed">
              On Arc, USDC is the native gas token. Your wallet has no USDC on Arc mainnet — transactions will fail.
              Add USDC to your wallet first.
            </p>
          </div>
        </div>
      )}

      {/* Form card */}
      <div
        className="rounded-2xl border"
        style={{
          background: 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderColor: 'var(--border)',
          boxShadow: '0 8px 32px rgba(18,45,69,0.07), inset 0 1px 0 rgba(255,255,255,0.7)',
        }}
      >
        <form onSubmit={handleSubmit} noValidate>

          {/* ── Section: Basic Info ── */}
          <div className="px-6 sm:px-8 pt-7 pb-6 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: 'var(--muted)' }}>
              Basic Info
            </h2>
            <div className="space-y-5">

              {/* Title */}
              <div>
                <FieldLabel
                  icon={<FileText size={14} />}
                  label="Title"
                  required
                  hint="Give your content a clear, searchable name."
                />
                <div className="relative">
                  <input
                    type="text"
                    placeholder="e.g. Minimal Brand Identity Kit"
                    value={form.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                    onBlur={() => handleBlur('title')}
                    onFocus={(e) => focusStyle(e, !!errors.title)}
                    className={inputBase}
                    style={inputStyle(!!errors.title)}
                    maxLength={80}
                  />
                  <span
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs tabular-nums"
                    style={{ color: form.title.length > 72 ? 'var(--danger)' : 'var(--subtle)' }}
                  >
                    {form.title.length}/80
                  </span>
                </div>
                <FieldError msg={errors.title} />
                <FieldSuccess show={!errors.title && !!touched.title && form.title.trim().length >= 3} />
              </div>

              {/* Description */}
              <div>
                <FieldLabel
                  icon={<FileText size={14} />}
                  label="Description"
                  required
                  hint="What's included? Who is it for? What makes it special?"
                />
                <div className="relative">
                  <textarea
                    placeholder="e.g. A complete brand identity kit with 12 logo variations, 8 color palettes, and a full style guide — perfect for freelancers."
                    value={form.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    onBlur={(e) => { handleBlur('description'); blurStyle(e, !!errors.description) }}
                    onFocus={(e) => focusStyle(e, !!errors.description)}
                    rows={4}
                    maxLength={500}
                    className={inputBase}
                    style={{ ...inputStyle(!!errors.description), resize: 'vertical' }}
                  />
                  <span
                    className="absolute right-3.5 bottom-3 text-xs tabular-nums"
                    style={{ color: form.description.length > 450 ? 'var(--danger)' : 'var(--subtle)' }}
                  >
                    {form.description.length}/500
                  </span>
                </div>
                <FieldError msg={errors.description} />
                <FieldSuccess show={!errors.description && !!touched.description && form.description.trim().length >= 10} />
              </div>

            </div>
          </div>

          {/* ── Section: Media ── */}
          <div className="px-6 sm:px-8 py-6 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: 'var(--muted)' }}>
              Cover Image
            </h2>

            <FieldLabel
              icon={<ImageIcon size={14} />}
              label="Cover Image URL"
              hint="Paste a direct link to a .jpg, .png, or .webp file. Use Imgur, Cloudinary, or similar for free hosting."
            />

            {/* Image upload area */}
            <div
              className="mb-3 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 py-5 px-4 text-center transition-colors cursor-default"
              style={{ borderColor: 'var(--border)', background: 'rgba(16,97,166,0.02)' }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(16,97,166,0.08)' }}
              >
                <ImageIcon size={20} style={{ color: 'var(--accent)' }} />
              </div>
              <p className="text-xs font-medium" style={{ color: 'var(--ink)' }}>
                Paste an image URL below
              </p>
              <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                Recommended: 1200 × 900px, 4:3 ratio, max 5 MB
              </p>
              <div
                className="mt-1 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ background: 'rgba(16,97,166,0.08)', color: 'var(--accent)' }}
              >
                <Info size={11} />
                File upload coming soon — use a URL for now
              </div>
            </div>

            <input
              type="url"
              placeholder="https://i.imgur.com/your-image.jpg"
              value={form.coverImageUrl}
              onChange={(e) => handleChange('coverImageUrl', e.target.value)}
              onBlur={(e) => { handleBlur('coverImageUrl'); blurStyle(e, !!errors.coverImageUrl) }}
              onFocus={(e) => focusStyle(e, !!errors.coverImageUrl)}
              className={inputBase}
              style={inputStyle(!!errors.coverImageUrl)}
            />
            <FieldError msg={errors.coverImageUrl} />

            {/* Live image preview */}
            {form.coverImageUrl && isValidUrl(form.coverImageUrl) && !coverError && (
              <div className="mt-3">
                <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Preview</p>
                <div
                  className="w-full aspect-[4/3] rounded-xl overflow-hidden border relative"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}
                >
                  <img
                    src={form.coverImageUrl}
                    alt="Cover preview"
                    className="w-full h-full object-cover"
                    onError={() => setCoverError(true)}
                  />
                  <div
                    className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium"
                    style={{ background: 'rgba(26,128,71,0.9)', color: 'white' }}
                  >
                    <CheckCircle size={10} />
                    Image loaded
                  </div>
                </div>
              </div>
            )}
            {form.coverImageUrl && isValidUrl(form.coverImageUrl) && coverError && (
              <div className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: 'var(--danger)' }}>
                <AlertCircle size={12} />
                Couldn't load image — check the URL is a direct image link.
              </div>
            )}

            {/* Tips */}
            <div
              className="mt-3 p-3 rounded-xl border text-xs space-y-1.5"
              style={{ borderColor: 'rgba(16,97,166,0.15)', background: 'rgba(16,97,166,0.04)', color: 'var(--muted)' }}
            >
              <p className="font-semibold" style={{ color: 'var(--ink)' }}>How to get a direct image URL:</p>
              <div className="flex items-start gap-1.5">
                <ChevronRight size={11} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                <span><strong>Imgur:</strong> upload → right-click image → "Copy image address"</span>
              </div>
              <div className="flex items-start gap-1.5">
                <ChevronRight size={11} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                <span><strong>Cloudinary / Vercel Blob / S3:</strong> copy the direct file URL</span>
              </div>
              <div className="flex items-start gap-1.5">
                <ChevronRight size={11} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                <span>URL must end in <code className="px-1 rounded" style={{ background: 'rgba(18,45,69,0.07)' }}>.jpg .png .webp .gif</code></span>
              </div>
            </div>
          </div>

          {/* ── Section: Content URL ── */}
          <div className="px-6 sm:px-8 py-6 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: 'var(--muted)' }}>
              Gated Content
            </h2>

            {/* Lock callout */}
            <div
              className="flex items-start gap-3 p-4 rounded-xl border mb-4"
              style={{
                background: 'rgba(16,97,166,0.05)',
                borderColor: 'rgba(16,97,166,0.2)',
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(16,97,166,0.1)' }}
              >
                <Lock size={16} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--ink)' }}>
                  Buyers-only link
                </p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                  The app only reveals this link to wallets that have paid. Blockchain data is public, so a technical user could still read it from the chain: use a link you can rotate, and update it any time from your dashboard.
                </p>
              </div>
            </div>

            <FieldLabel
              icon={<Link2 size={14} />}
              label="Content URL"
              required
              hint="Link to your file — Google Drive, Dropbox, Gumroad, or any direct download URL."
            />
            <div className="relative">
              <input
                type={showContentUrl ? 'url' : 'password'}
                placeholder="https://drive.google.com/file/d/..."
                value={form.contentUrl}
                onChange={(e) => handleChange('contentUrl', e.target.value)}
                onBlur={(e) => { handleBlur('contentUrl'); blurStyle(e, !!errors.contentUrl) }}
                onFocus={(e) => focusStyle(e, !!errors.contentUrl)}
                className={`${inputBase} pr-12`}
                style={inputStyle(!!errors.contentUrl)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors"
                style={{ color: 'var(--muted)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ink)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
                onClick={() => setShowContentUrl(v => !v)}
                title={showContentUrl ? 'Hide URL' : 'Show URL'}
              >
                {showContentUrl ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <FieldError msg={errors.contentUrl} />
            <FieldSuccess show={!errors.contentUrl && !!touched.contentUrl && isValidUrl(form.contentUrl)} />

            <div
              className="mt-2.5 flex items-start gap-1.5 text-xs"
              style={{ color: 'var(--subtle)' }}
            >
              <Info size={11} className="mt-0.5 flex-shrink-0" />
              Make sure your file link has public access or "anyone with the link can view" enabled.
            </div>
          </div>

          {/* ── Section: Content hash (commitment) ── */}
          <div className="px-6 sm:px-8 py-6 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: 'var(--muted)' }}>
              Content Commitment
            </h2>

            <div
              className="flex items-start gap-3 p-4 rounded-xl border mb-4"
              style={{ background: 'rgba(26,128,71,0.05)', borderColor: 'rgba(26,128,71,0.2)' }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(26,128,71,0.1)' }}
              >
                <ShieldCheck size={16} style={{ color: 'var(--success)' }} />
              </div>
              <div>
                <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--ink)' }}>Builds buyer trust</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                  The SHA-256 hash of your files is stored on-chain and cannot be changed later. After buying, buyers can check their download matches it. Use the exact file (or zip) you share at the link.
                </p>
              </div>
            </div>

            <FieldLabel
              icon={<Fingerprint size={14} />}
              label="Content hash (SHA-256)"
              required
              hint="Pick your file to compute the hash here, or paste a 64-character hex SHA-256."
            />

            <input
              ref={hashFileInput}
              type="file"
              className="hidden"
              onChange={(e) => {
                void computeHash(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                placeholder="0x… or 64 hex characters"
                value={form.contentHash}
                onChange={(e) => handleChange('contentHash', e.target.value)}
                onBlur={(e) => { handleBlur('contentHash'); blurStyle(e, !!errors.contentHash) }}
                onFocus={(e) => focusStyle(e, !!errors.contentHash)}
                className={`${inputBase} mono text-xs flex-1`}
                style={inputStyle(!!errors.contentHash)}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => hashFileInput.current?.click()}
                disabled={hashing}
                className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.9)', color: 'var(--accent)', borderColor: 'var(--border)' }}
              >
                {hashing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                Compute from file
              </button>
            </div>
            <FieldError msg={errors.contentHash} />
            <FieldSuccess
              show={!errors.contentHash && !!touched.contentHash && isValidContentHash(normalizeHash(form.contentHash))}
            />
            {hashedFileName && (
              <p className="mt-1.5 text-xs" style={{ color: 'var(--subtle)' }}>
                Computed locally from {hashedFileName}. The file was not uploaded.
              </p>
            )}
          </div>

          {/* ── Section: Pricing ── */}
          <div className="px-6 sm:px-8 pt-6 pb-7">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: 'var(--muted)' }}>
              Pricing
            </h2>

            <FieldLabel
              icon={<DollarSign size={14} />}
              label="Price"
              required
              hint="Set a price in USDC. Payments are held in escrow for 5 days, then released to you minus a 2.5% protocol fee."
            />

            <div className="flex items-stretch gap-3">
              <div className="relative flex-1">
                <span
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold select-none"
                  style={{ color: 'var(--muted)' }}
                >
                  $
                </span>
                <input
                  type="number"
                  placeholder="5.00"
                  value={form.priceUsdc}
                  onChange={(e) => handleChange('priceUsdc', e.target.value)}
                  onBlur={(e) => { handleBlur('priceUsdc'); blurStyle(e, !!errors.priceUsdc) }}
                  onFocus={(e) => focusStyle(e, !!errors.priceUsdc)}
                  min="0.01"
                  step="0.01"
                  className={`${inputBase} pl-8 tabular-nums`}
                  style={inputStyle(!!errors.priceUsdc)}
                />
                <span
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold"
                  style={{ color: 'var(--muted)' }}
                >
                  USDC
                </span>
              </div>

              {/* Quick-select presets */}
              <div className="flex items-center gap-1.5">
                {['1', '5', '10', '25'].map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { handleChange('priceUsdc', p); handleBlur('priceUsdc') }}
                    className="px-3 py-2 rounded-xl text-xs font-semibold border transition-all"
                    style={{
                      background: form.priceUsdc === p ? 'var(--accent)' : 'rgba(255,255,255,0.8)',
                      color: form.priceUsdc === p ? 'white' : 'var(--ink)',
                      borderColor: form.priceUsdc === p ? 'var(--accent)' : 'var(--border)',
                    }}
                  >
                    ${p}
                  </button>
                ))}
              </div>
            </div>

            <FieldError msg={errors.priceUsdc} />

            {/* Payout preview */}
            {payout && !errors.priceUsdc ? (
              <div
                className="mt-3 flex items-center justify-between px-4 py-3 rounded-xl border"
                style={{
                  background: 'rgba(26,128,71,0.05)',
                  borderColor: 'rgba(26,128,71,0.2)',
                }}
              >
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
                  <CheckCircle size={14} style={{ color: 'var(--success)' }} />
                  <span>You'll receive</span>
                </div>
                <div className="text-right">
                  <span className="text-base font-bold" style={{ color: 'var(--success)' }}>
                    {payout} USDC
                  </span>
                  <span className="ml-1.5 text-xs" style={{ color: 'var(--subtle)' }}>
                    per sale
                  </span>
                </div>
              </div>
            ) : (
              <div
                className="mt-3 flex items-center justify-between px-4 py-3 rounded-xl border"
                style={{ borderColor: 'var(--border)', background: 'rgba(18,45,69,0.02)' }}
              >
                <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                  2.5% protocol fee — enter a price to see your net earnings
                </span>
              </div>
            )}
          </div>

          {/* ── Submit ── */}
          <div
            className="px-6 sm:px-8 py-5 border-t flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
            style={{ borderColor: 'var(--border)', background: 'rgba(18,45,69,0.025)' }}
          >
            <div className="flex-1 text-xs" style={{ color: 'var(--subtle)' }}>
              {isValid
                ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Ready to list</span>
                : 'Fill in all required fields to continue.'
              }
            </div>

            <button
              type="submit"
              disabled={!isValid || isPending || isConfirming}
              className="sm:w-48 py-3.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                background: isWrongChain ? 'var(--danger)' : 'var(--accent)',
                color: 'white',
                boxShadow: isValid && !isWrongChain
                  ? '0 4px 14px rgba(16,97,166,0.3)'
                  : 'none',
              }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(16,97,166,0.36)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = isValid && !isWrongChain
                  ? '0 4px 14px rgba(16,97,166,0.3)'
                  : 'none'
              }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'translateY(0) scale(0.98)' }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'translateY(-1px) scale(1)' }}
            >
              {isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Confirm in wallet…
                </>
              ) : isConfirming ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Listing…
                </>
              ) : isWrongChain ? (
                'Switch Network'
              ) : (
                <>
                  <Sparkles size={15} />
                  List Content
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
