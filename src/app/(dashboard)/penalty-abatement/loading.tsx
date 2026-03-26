import { SkeletonPulse } from "@/components/ui/page-skeleton"

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Title */}
      <SkeletonPulse className="h-7 w-48" />
      {/* Case selector */}
      <SkeletonPulse className="h-10 w-72 rounded-lg" />
      {/* Table skeleton */}
      <div className="rounded-xl border border-[var(--c-gray-100)]">
        <div className="flex gap-4 p-3 border-b border-[var(--c-gray-100)]">
          <SkeletonPulse className="h-4 w-20" />
          <SkeletonPulse className="h-4 w-28" />
          <SkeletonPulse className="h-4 w-24" />
          <SkeletonPulse className="h-4 w-24" />
          <SkeletonPulse className="h-4 w-20" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4 p-3 border-b last:border-0 border-[var(--c-gray-100)]">
            <SkeletonPulse className="h-4 w-20" />
            <SkeletonPulse className="h-4 w-28" />
            <SkeletonPulse className="h-4 w-24" />
            <SkeletonPulse className="h-4 w-24" />
            <SkeletonPulse className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
