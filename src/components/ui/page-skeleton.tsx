import { cn } from "@/lib/utils"

function SkeletonPulse({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[8px] bg-[var(--c-gray-100)]",
        className
      )}
      {...props}
    >
      <div
        className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite]"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)",
        }}
      />
    </div>
  )
}

function SkeletonStatCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-[var(--c-gray-100)] bg-white p-6",
        className
      )}
      style={{ boxShadow: "var(--shadow-1)" }}
      {...props}
    >
      <SkeletonPulse className="h-3 w-20 mb-3" />
      <SkeletonPulse className="h-7 w-16 mb-2" />
      <SkeletonPulse className="h-2.5 w-28" />
    </div>
  )
}

function SkeletonCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-[var(--c-gray-100)] bg-white p-6",
        className
      )}
      style={{ boxShadow: "var(--shadow-1)" }}
      {...props}
    >
      <div className="flex items-center gap-3 mb-4">
        <SkeletonPulse className="h-9 w-9 rounded-[10px]" />
        <div className="flex-1">
          <SkeletonPulse className="h-3.5 w-32 mb-2" />
          <SkeletonPulse className="h-2.5 w-48" />
        </div>
      </div>
      <div className="space-y-2.5">
        <SkeletonPulse className="h-2.5 w-full" />
        <SkeletonPulse className="h-2.5 w-4/5" />
        <SkeletonPulse className="h-2.5 w-3/5" />
      </div>
    </div>
  )
}

function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div
      className="rounded-[14px] border border-[var(--c-gray-100)] bg-white overflow-hidden"
      style={{ boxShadow: "var(--shadow-1)" }}
    >
      <div className="border-b-2 border-[var(--c-gray-100)] px-4 py-3 flex gap-4">
        {[80, 120, 160, 100, 60].map((w, i) => (
          <SkeletonPulse key={i} className="h-2.5" style={{ width: w }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="px-4 py-3.5 flex gap-4 border-b border-[var(--c-gray-100)] last:border-0"
        >
          {[80, 120, 160, 100, 60].map((w, j) => (
            <SkeletonPulse
              key={j}
              className="h-3"
              style={{ width: w, opacity: 1 - i * 0.1 }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <SkeletonPulse className="h-6 w-48 mb-2" />
          <SkeletonPulse className="h-3.5 w-72" />
        </div>
        <SkeletonPulse className="h-9 w-32 rounded-[10px]" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
      <SkeletonTable />
    </div>
  )
}

export {
  SkeletonPulse,
  SkeletonStatCard,
  SkeletonCard,
  SkeletonTable,
  PageSkeleton,
}
