import { Card, CardContent } from "@/components/ui/card"

export default function KnowledgeLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-9 w-48 animate-pulse rounded bg-muted" />
        <div className="h-9 w-36 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}><CardContent className="pt-6"><div className="h-12 animate-pulse rounded bg-muted" /></CardContent></Card>
        ))}
      </div>
      <div className="h-10 animate-pulse rounded bg-muted" />
      {[1, 2, 3].map((i) => (
        <Card key={i}><CardContent className="p-4"><div className="h-14 animate-pulse rounded bg-muted" /></CardContent></Card>
      ))}
    </div>
  )
}
