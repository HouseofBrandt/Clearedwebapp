import { SkeletonPulse, SkeletonStatCard } from "@/components/ui/page-skeleton"

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Title */}
      <SkeletonPulse className="h-7 w-36" />
      {/* 4 stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
      {/* Calendar placeholder */}
      <div className="rounded-xl border border-[var(--c-gray-100)] p-5">
        {/* Month header */}
        <div className="flex items-center justify-between mb-4">
          <SkeletonPulse className="h-5 w-32" />
          <div className="flex gap-2">
            <SkeletonPulse className="h-8 w-8 rounded-md" />
            <SkeletonPulse className="h-8 w-8 rounded-md" />
          </div>
        </div>
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <SkeletonPulse key={i} className="h-4 w-full" />
          ))}
        </div>
        {/* Calendar grid */}
        {Array.from({ length: 5 }).map((_, row) => (
          <div key={row} className="grid grid-cols-7 gap-1 mb-1">
            {Array.from({ length: 7 }).map((_, col) => (
              <SkeletonPulse key={col} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
