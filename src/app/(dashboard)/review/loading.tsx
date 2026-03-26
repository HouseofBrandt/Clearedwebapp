import { SkeletonPulse, SkeletonCard } from "@/components/ui/page-skeleton"

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Title */}
      <SkeletonPulse className="h-7 w-40" />
      {/* Filter bar skeleton */}
      <div className="flex gap-3">
        <SkeletonPulse className="h-9 w-28 rounded-lg" />
        <SkeletonPulse className="h-9 w-28 rounded-lg" />
        <SkeletonPulse className="h-9 w-28 rounded-lg" />
      </div>
      {/* 6 review cards */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  )
}
