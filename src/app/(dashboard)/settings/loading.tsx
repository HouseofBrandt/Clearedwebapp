import { SkeletonPulse, SkeletonCard } from "@/components/ui/page-skeleton"

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Title */}
      <SkeletonPulse className="h-7 w-32" />
      {/* Settings cards */}
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[var(--c-gray-100)] p-5 space-y-4">
            <SkeletonPulse className="h-5 w-40" />
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <SkeletonPulse className="h-3 w-24" />
                <SkeletonPulse className="h-10 w-64 rounded-lg" />
              </div>
              <div className="flex items-center gap-4">
                <SkeletonPulse className="h-3 w-24" />
                <SkeletonPulse className="h-10 w-64 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
