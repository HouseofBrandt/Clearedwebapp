export function SkeletonPulse({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-md ${className || ""}`}
      style={{
        background: "linear-gradient(90deg, var(--c-gray-100) 25%, var(--c-gray-50) 50%, var(--c-gray-100) 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite linear",
        ...style,
      }}
    />
  )
}

export function SkeletonLine({ width = "100%", height = "14px" }: { width?: string; height?: string }) {
  return <SkeletonPulse style={{ width, height }} />
}

export function SkeletonStatCard() {
  return (
    <div className="rounded-xl border border-[var(--c-gray-100)] p-5">
      <SkeletonPulse className="h-3 w-24 mb-3" />
      <SkeletonPulse className="h-8 w-16" />
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-[var(--c-gray-100)] p-5 space-y-3">
      <SkeletonPulse className="h-4 w-3/4" />
      <SkeletonPulse className="h-3 w-full" />
      <SkeletonPulse className="h-3 w-2/3" />
    </div>
  )
}

export function PageSkeleton({ title }: { title?: string }) {
  return (
    <div className="space-y-6">
      {title && <SkeletonPulse className="h-7 w-48" />}
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  )
}
