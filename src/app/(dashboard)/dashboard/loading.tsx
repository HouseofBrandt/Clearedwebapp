import { SkeletonPulse, SkeletonStatCard, SkeletonCard } from "@/components/ui/page-skeleton"

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Title */}
      <SkeletonPulse className="h-7 w-48" />
      {/* 4 stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
      {/* 5 feed cards */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  )
}
