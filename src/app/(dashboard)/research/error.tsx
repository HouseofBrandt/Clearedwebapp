"use client"

export default function ResearchError({ reset }: { reset: () => void }) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="rounded-[14px] p-8 text-center max-w-md" style={{ background: "var(--surface-primary)", border: "1px solid var(--c-gray-100)", boxShadow: "var(--shadow-1)" }}>
        <h2 className="text-[15px] font-semibold mb-2" style={{ color: "var(--c-gray-900)" }}>Something went wrong</h2>
        <p className="text-[13px] mb-4" style={{ color: "var(--c-gray-500)" }}>
          An error occurred while loading this page. This may be a temporary issue with the database connection.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center rounded-[10px] px-5 py-2 text-[13px] font-medium text-white"
          style={{ background: "linear-gradient(180deg, #1E3A5F 0%, #142440 100%)" }}
        >
          Try again
        </button>
      </div>
    </div>
  )
}
