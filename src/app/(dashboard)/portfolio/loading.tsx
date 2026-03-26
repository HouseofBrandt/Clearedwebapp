import { SkeletonPulse, SkeletonCard } from "@/components/ui/page-skeleton"

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Title */}
      <SkeletonPulse className="h-7 w-36" />
      {/* 4 card skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  )
}
