import { SkeletonPulse, SkeletonCard } from "@/components/ui/page-skeleton"

export default function Loading() {
  return (
    <div className="flex gap-6">
      {/* Sidebar skeleton */}
      <div className="w-64 shrink-0 space-y-3">
        <SkeletonPulse className="h-7 w-36" />
        <SkeletonPulse className="h-10 w-full rounded-lg" />
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonPulse key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
      {/* Form area skeleton */}
      <div className="flex-1 space-y-4">
        <SkeletonPulse className="h-7 w-48" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <SkeletonPulse className="h-3 w-24" />
            <SkeletonPulse className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
      {/* RCP panel skeleton */}
      <div className="w-72 shrink-0 space-y-3">
        <SkeletonPulse className="h-7 w-32" />
        <div className="rounded-xl border border-[var(--c-gray-100)] p-5 space-y-3">
          <SkeletonPulse className="h-3 w-20" />
          <SkeletonPulse className="h-8 w-28" />
          <SkeletonPulse className="h-3 w-full" />
          <SkeletonPulse className="h-3 w-3/4" />
        </div>
        <div className="rounded-xl border border-[var(--c-gray-100)] p-5 space-y-3">
          <SkeletonPulse className="h-3 w-24" />
          <SkeletonPulse className="h-8 w-20" />
        </div>
      </div>
    </div>
  )
}
