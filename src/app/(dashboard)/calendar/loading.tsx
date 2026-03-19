import { Card, CardContent } from "@/components/ui/card"

export default function CalendarLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-9 w-64 animate-pulse rounded bg-muted" />
        <div className="h-9 w-32 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-10 w-48 animate-pulse rounded bg-muted" />
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="h-16 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
