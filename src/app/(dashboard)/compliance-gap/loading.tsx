import { SkeletonPulse, SkeletonStatCard, SkeletonCard } from "@/components/ui/page-skeleton"

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Title */}
      <SkeletonPulse className="h-7 w-48" />
      {/* 3 stat cards */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
      {/* 5 year cards */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  )
}
