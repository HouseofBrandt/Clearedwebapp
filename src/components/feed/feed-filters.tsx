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
    <div className="polish-filter-row" role="tablist" aria-label="Feed filters">
      {filters.map((f) => (
        <button
          key={f.key}
          type="button"
          role="tab"
          aria-selected={filter === f.key}
          onClick={() => onFilterChange(f.key)}
          className="polish-filter-pill"
          data-active={filter === f.key}
        >
          {f.label}
          {f.count != null && f.count > 0 && (
            <span
              className="ml-1.5 inline-flex items-center justify-center rounded-full"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                minWidth: "16px",
                height: "16px",
                padding: "0 5px",
                background: filter === f.key ? "var(--c-teal)" : "var(--c-gray-200)",
                color: filter === f.key ? "white" : "var(--c-gray-600)",
              }}
            >
              {f.count}
            </span>
          )}
        </button>
      ))}
      {caseFilter && onClearCaseFilter && (
        <button
          onClick={onClearCaseFilter}
          className="ml-auto polish-filter-pill"
          data-active="true"
          aria-label="Clear case filter"
        >
          Case filtered
          <span className="ml-1" aria-hidden>&times;</span>
        </button>
      )}
    </div>
  )
}
