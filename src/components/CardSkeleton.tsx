export default function CardSkeleton() {
  return (
    <div
      className="rounded-2xl overflow-hidden border"
      style={{
        background: 'rgba(255,255,255,0.88)',
        borderColor: 'var(--border)',
        boxShadow: '0 2px 6px rgba(18,45,69,0.06)',
      }}
    >
      {/* Image area — matches ContentCard aspect-[4/3] */}
      <div className="w-full aspect-[4/3] skeleton" />

      <div className="p-4 space-y-3">
        {/* Category badge placeholder */}
        <div className="skeleton h-5 w-20 rounded-lg" />
        {/* Title */}
        <div className="skeleton h-4 w-3/4" />
        {/* Description lines */}
        <div className="space-y-1.5">
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-4/5" />
        </div>
        {/* Price + sales row */}
        <div
          className="flex items-center justify-between pt-3 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="skeleton h-5 w-24" />
          <div className="skeleton h-3 w-12" />
        </div>
        {/* Creator row */}
        <div className="flex items-center justify-between">
          <div className="skeleton h-3 w-28" />
          <div className="skeleton h-3 w-10" />
        </div>
      </div>
    </div>
  )
}
