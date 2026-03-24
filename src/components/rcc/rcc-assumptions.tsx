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
    <div className="flex items-center gap-4 px-4 py-2.5 bg-slate-100 dark:bg-slate-800/50 rounded-lg mb-5 flex-wrap">
      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
        Global Assumptions
      </span>

      <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        Entity:
        <select
          value={entityType}
          onChange={(e) => onEntityType(e.target.value)}
          className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs bg-white dark:bg-slate-900"
        >
          <option value="individual">Individual (1040)</option>
          <option value="estate">Estate (1041)</option>
          <option value="simple_trust">Simple Trust (1041)</option>
          <option value="complex_trust">Complex Trust (1041)</option>
        </select>
      </label>

      {entityType === "individual" && (
        <>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            Status:
            <select
              value={filingStatus}
              onChange={(e) => onFilingStatus(e.target.value)}
              className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs bg-white dark:bg-slate-900"
            >
              <option value="single">Single</option>
              <option value="mfj">Married Filing Jointly</option>
              <option value="mfs">Married Filing Separately</option>
              <option value="hoh">Head of Household</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={age65}
              onChange={(e) => onAge65(e.target.checked)}
              className="rounded border-slate-300"
            />
            Age 65+
          </label>
        </>
      )}
    </div>
  )
}
