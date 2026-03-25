export function PageSkeleton({ title }: { title?: string }) {
  return (
    <div className="animate-pulse space-y-6">
      {title && (
        <div className="space-y-2">
          <div className="h-8 w-48 rounded bg-slate-200" />
          <div className="h-4 w-72 rounded bg-slate-100" />
        </div>
      )}
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="space-y-4">
          <div className="h-4 w-full rounded bg-slate-100" />
          <div className="h-4 w-3/4 rounded bg-slate-100" />
          <div className="h-4 w-1/2 rounded bg-slate-100" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="h-4 w-20 rounded bg-slate-100 mb-2" />
            <div className="h-6 w-16 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  )
}
