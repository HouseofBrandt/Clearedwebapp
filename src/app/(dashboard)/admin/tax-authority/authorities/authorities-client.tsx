"use client"

import { useState, useMemo } from "react"
import {
  AlertTriangle,
  Search,
  ChevronDown,
  ChevronRight,
  Filter,
} from "lucide-react"

type AuthorityRow = {
  id: string
  citationString: string
  normalizedCitation: string
  title: string
  authorityTier: string
  authorityStatus: string
  precedentialStatus: string
  promotionLayer: string
  jurisdiction: string | null
  effectiveDate: string | null
  publicationDate: string | null
  versionCount: number
  chunkCount: number
}

function tierBadgeColor(tier: string): string {
  if (tier.startsWith("A")) return "bg-emerald-100 text-emerald-700"
  if (tier.startsWith("B")) return "bg-blue-100 text-blue-700"
  if (tier.startsWith("C")) return "bg-amber-100 text-amber-700"
  if (tier.startsWith("D")) return "bg-[var(--c-gray-100)] text-[var(--c-gray-600)]"
  if (tier === "X") return "bg-red-100 text-red-700"
  return "bg-[var(--c-gray-100)] text-[var(--c-gray-600)]"
}

function statusBadgeColor(status: string): string {
  switch (status) {
    case "CURRENT":
      return "bg-emerald-100 text-emerald-700"
    case "PROPOSED":
      return "bg-blue-100 text-blue-700"
    case "SUPERSEDED":
      return "bg-amber-100 text-amber-700"
    case "WITHDRAWN":
    case "ARCHIVED":
      return "bg-[var(--c-gray-100)] text-[var(--c-gray-500)]"
    case "PENDING_REVIEW":
      return "bg-purple-100 text-purple-700"
    default:
      return "bg-[var(--c-gray-100)] text-[var(--c-gray-600)]"
  }
}

function promotionBadgeColor(layer: string): string {
  switch (layer) {
    case "DISTILLED":
      return "bg-emerald-100 text-emerald-700"
    case "CURATED":
      return "bg-blue-100 text-blue-700"
    case "RAW":
      return "bg-[var(--c-gray-100)] text-[var(--c-gray-600)]"
    default:
      return "bg-[var(--c-gray-100)] text-[var(--c-gray-600)]"
  }
}

const ALL_TIERS = ["A1", "A2", "A3", "A4", "A5", "B1", "B2", "C1", "C2", "D1", "X"]
const ALL_STATUSES = ["CURRENT", "PROPOSED", "WITHDRAWN", "SUPERSEDED", "ARCHIVED", "PENDING_REVIEW"]
const ALL_LAYERS = ["RAW", "CURATED", "DISTILLED"]

export function AuthoritiesClient({ authorities }: { authorities: AuthorityRow[] | null }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [tierFilter, setTierFilter] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [layerFilter, setLayerFilter] = useState<string>("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!authorities) return []
    return authorities.filter((a) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (
          !a.citationString.toLowerCase().includes(q) &&
          !a.title.toLowerCase().includes(q) &&
          !a.normalizedCitation.toLowerCase().includes(q)
        ) {
          return false
        }
      }
      if (tierFilter && a.authorityTier !== tierFilter) return false
      if (statusFilter && a.authorityStatus !== statusFilter) return false
      if (layerFilter && a.promotionLayer !== layerFilter) return false
      return true
    })
  }, [authorities, searchQuery, tierFilter, statusFilter, layerFilter])

  if (!authorities) {
    return (
      <div className="page-enter p-6 rounded-lg border border-amber-200 bg-amber-50 text-amber-700">
        <AlertTriangle className="w-5 h-5 inline mr-2" />
        Canonical authorities table not available. Run migrations to set up.
      </div>
    )
  }

  return (
    <div className="page-enter space-y-6">
      <div>
        <h1 className="text-display-md font-[family-name:var(--font-instrument)]">
          Canonical Authorities
        </h1>
        <p className="text-[var(--c-gray-500)]">
          Browse and filter the authority knowledge graph
        </p>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-gray-400)]" />
          <input
            type="text"
            placeholder="Search by citation or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-md border border-[var(--c-gray-200)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--c-teal)]/50 focus:border-[var(--c-teal)]"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="px-3 py-2 rounded-md border border-[var(--c-gray-200)] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--c-teal)]/50"
          >
            <option value="">All Tiers</option>
            {ALL_TIERS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-md border border-[var(--c-gray-200)] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--c-teal)]/50"
          >
            <option value="">All Statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
          <select
            value={layerFilter}
            onChange={(e) => setLayerFilter(e.target.value)}
            className="px-3 py-2 rounded-md border border-[var(--c-gray-200)] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--c-teal)]/50"
          >
            <option value="">All Layers</option>
            {ALL_LAYERS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs text-[var(--c-gray-500)]">
        Showing {filtered.length} of {authorities.length} authorities
      </p>

      {/* Authorities List */}
      <div className="border border-[var(--c-gray-200)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--c-gray-50)] border-b border-[var(--c-gray-200)]">
                <th className="w-8 px-2 py-3" />
                <th className="text-left px-4 py-3 font-medium text-[var(--c-gray-600)]">Citation</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--c-gray-600)]">Title</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--c-gray-600)]">Tier</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--c-gray-600)]">Status</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--c-gray-600)]">Layer</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--c-gray-600)]">Versions</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--c-gray-600)]">Chunks</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[var(--c-gray-400)] italic">
                    {authorities.length === 0
                      ? "No authorities ingested yet"
                      : "No authorities match your filters"}
                  </td>
                </tr>
              )}
              {filtered.map((a) => (
                <>
                  <tr
                    key={a.id}
                    className="border-b border-[var(--c-gray-100)] hover:bg-[var(--c-gray-50)] transition-colors cursor-pointer"
                    onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                  >
                    <td className="px-2 py-3 text-[var(--c-gray-400)]">
                      {expandedId === a.id ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-[family-name:var(--font-jetbrains)] text-xs text-[var(--c-gray-900)]">
                        {a.citationString}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[var(--c-gray-700)] truncate block max-w-[300px]">
                        {a.title}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${tierBadgeColor(a.authorityTier)}`}>
                        {a.authorityTier}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusBadgeColor(a.authorityStatus)}`}>
                        {a.authorityStatus.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${promotionBadgeColor(a.promotionLayer)}`}>
                        {a.promotionLayer}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-[family-name:var(--font-jetbrains)] text-xs text-[var(--c-gray-600)]">
                      {a.versionCount}
                    </td>
                    <td className="px-4 py-3 text-right font-[family-name:var(--font-jetbrains)] text-xs text-[var(--c-gray-600)]">
                      {a.chunkCount}
                    </td>
                  </tr>
                  {expandedId === a.id && (
                    <tr key={`${a.id}-detail`} className="border-b border-[var(--c-gray-100)]">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="p-4 rounded bg-[var(--c-gray-50)] border border-[var(--c-gray-200)] space-y-2">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                            <div>
                              <p className="font-medium text-[var(--c-gray-600)]">Normalized Citation</p>
                              <p className="text-[var(--c-gray-900)] font-[family-name:var(--font-jetbrains)]">
                                {a.normalizedCitation}
                              </p>
                            </div>
                            <div>
                              <p className="font-medium text-[var(--c-gray-600)]">Precedential Status</p>
                              <p className="text-[var(--c-gray-900)]">{a.precedentialStatus}</p>
                            </div>
                            <div>
                              <p className="font-medium text-[var(--c-gray-600)]">Jurisdiction</p>
                              <p className="text-[var(--c-gray-900)]">{a.jurisdiction ?? "N/A"}</p>
                            </div>
                            <div>
                              <p className="font-medium text-[var(--c-gray-600)]">Effective Date</p>
                              <p className="text-[var(--c-gray-900)]">
                                {a.effectiveDate
                                  ? new Date(a.effectiveDate).toLocaleDateString()
                                  : "N/A"}
                              </p>
                            </div>
                          </div>
                          {a.publicationDate && (
                            <p className="text-xs text-[var(--c-gray-500)]">
                              Published: {new Date(a.publicationDate).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
