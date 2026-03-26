import { SkeletonPulse, SkeletonCard } from "@/components/ui/page-skeleton"

export default function Loading() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <SkeletonPulse className="h-8 w-40" />
          <SkeletonPulse className="h-4 w-72" />
        </div>
        <SkeletonPulse className="h-10 w-36 rounded-lg" />
      </div>

      {/* Available forms grid skeleton */}
      <div className="space-y-4">
        <SkeletonPulse className="h-4 w-32" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--c-gray-100)] p-5 space-y-3"
            >
              <SkeletonPulse className="h-9 w-9 rounded-lg" />
              <SkeletonPulse className="h-3 w-16" />
              <SkeletonPulse className="h-4 w-3/4" />
              <SkeletonPulse className="h-3 w-full" />
              <div className="pt-3 border-t border-[var(--c-gray-100)]">
                <SkeletonPulse className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent forms table skeleton */}
      <div className="space-y-4">
        <SkeletonPulse className="h-4 w-28" />
        <div className="rounded-xl border border-[var(--c-gray-100)] p-5 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <SkeletonPulse className="h-4 w-24" />
              <SkeletonPulse className="h-4 w-32" />
              <SkeletonPulse className="h-5 w-20 rounded-full" />
              <SkeletonPulse className="h-2 w-24 rounded-full" />
              <SkeletonPulse className="h-4 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
