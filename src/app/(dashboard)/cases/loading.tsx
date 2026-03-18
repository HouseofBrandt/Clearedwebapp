import { Card, CardContent, CardHeader } from "@/components/ui/card"

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className || ""}`} />
}

export default function CasesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-2 h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-[200px]" />
            <Skeleton className="h-10 w-[160px]" />
          </div>
        </CardHeader>
        <CardContent>
          {/* Table header */}
          <div className="flex items-center gap-4 border-b pb-3 mb-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
          {/* Table rows */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3 border-b last:border-0">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
