"use client"

type FilterType = "all" | "post" | "task" | "my_tasks" | "system_event"

interface FeedFiltersProps {
  filter: FilterType
  onFilterChange: (filter: FilterType) => void
  myTaskCount?: number
  caseFilter?: string
  onClearCaseFilter?: () => void
}

export function FeedFilters({
  filter,
  onFilterChange,
  myTaskCount = 0,
  caseFilter,
  onClearCaseFilter,
}: FeedFiltersProps) {
  const filters: { key: FilterType; label: string; count?: number }[] = [
    { key: "all", label: "All" },
    { key: "post", label: "Posts" },
    { key: "task", label: "Tasks" },
    { key: "my_tasks", label: "My Tasks", count: myTaskCount },
    { key: "system_event", label: "Activity" },
  ]

  return (
    <div className="flex items-center gap-1 py-3 mb-3">
      {filters.map((f) => (
        <button
          key={f.key}
          onClick={() => onFilterChange(f.key)}
          className="px-2.5 py-1 text-xs font-medium rounded-full transition-colors"
          style={{
            background: filter === f.key ? 'var(--c-teal-soft)' : 'transparent',
            color: filter === f.key ? 'var(--c-teal)' : 'var(--c-gray-300)',
          }}
        >
          {f.label}
          {f.count != null && f.count > 0 && (
            <span
              className="ml-1 rounded-full px-1.5"
              style={{ fontSize: '10px', background: 'var(--c-teal)', color: 'white' }}
            >
              {f.count}
            </span>
          )}
        </button>
      ))}
      {caseFilter && onClearCaseFilter && (
        <button
          onClick={onClearCaseFilter}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full"
          style={{ background: 'var(--c-teal-soft)', color: 'var(--c-teal)' }}
        >
          Case filtered
          <span className="ml-1">&times;</span>
        </button>
      )}
    </div>
  )
}
