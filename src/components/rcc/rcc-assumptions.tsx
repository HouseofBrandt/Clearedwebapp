"use client"

interface RCCAssumptionsProps {
  entityType: string
  filingStatus: string
  age65: boolean
  onEntityType: (v: string) => void
  onFilingStatus: (v: string) => void
  onAge65: (v: boolean) => void
}

export function RCCAssumptions({
  entityType,
  filingStatus,
  age65,
  onEntityType,
  onFilingStatus,
  onAge65,
}: RCCAssumptionsProps) {
  return (
    <div className="flex items-center gap-4 px-4 py-2.5 bg-c-gray-100 dark:bg-c-gray-900/50 rounded-lg mb-5 flex-wrap">
      <span className="text-[11px] font-medium text-c-gray-300 uppercase tracking-wider">
        Global Assumptions
      </span>

      <label className="flex items-center gap-1.5 text-xs text-c-gray-500 dark:text-c-gray-300">
        Entity:
        <select
          value={entityType}
          onChange={(e) => onEntityType(e.target.value)}
          className="px-2 py-1 rounded border border-c-gray-200 dark:border-c-gray-500 text-xs bg-white dark:bg-c-gray-900"
        >
          <option value="individual">Individual (1040)</option>
          <option value="estate">Estate (1041)</option>
          <option value="simple_trust">Simple Trust (1041)</option>
          <option value="complex_trust">Complex Trust (1041)</option>
        </select>
      </label>

      {entityType === "individual" && (
        <>
          <label className="flex items-center gap-1.5 text-xs text-c-gray-500 dark:text-c-gray-300">
            Status:
            <select
              value={filingStatus}
              onChange={(e) => onFilingStatus(e.target.value)}
              className="px-2 py-1 rounded border border-c-gray-200 dark:border-c-gray-500 text-xs bg-white dark:bg-c-gray-900"
            >
              <option value="single">Single</option>
              <option value="mfj">Married Filing Jointly</option>
              <option value="mfs">Married Filing Separately</option>
              <option value="hoh">Head of Household</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-c-gray-500 dark:text-c-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={age65}
              onChange={(e) => onAge65(e.target.checked)}
              className="rounded border-c-gray-200"
            />
            Age 65+
          </label>
        </>
      )}
    </div>
  )
}
