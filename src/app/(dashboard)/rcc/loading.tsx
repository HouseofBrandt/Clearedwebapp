import { SkeletonPulse, SkeletonCard } from "@/components/ui/page-skeleton"

export default function Loading() {
  return (
    <div className="flex gap-6">
      {/* Sidebar skeleton */}
      <div className="w-64 shrink-0 space-y-3">
        <SkeletonPulse className="h-7 w-40" />
        <SkeletonPulse className="h-10 w-full rounded-lg" />
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonPulse key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
      {/* Content area skeleton */}
      <div className="flex-1 space-y-4">
        <SkeletonPulse className="h-7 w-48" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
