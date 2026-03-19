"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { UploadDialog } from "./upload-dialog"
import {
  FileText, Search, Trash2, RefreshCw, BookOpen,
  TrendingUp, Database, Loader2, ChevronDown, ChevronRight,
} from "lucide-react"
import Link from "next/link"

const CATEGORY_LABELS: Record<string, string> = {
  IRC_STATUTE: "IRC Statute",
  TREASURY_REGULATION: "Treasury Regulation",
  IRM_SECTION: "IRM Section",
  REVENUE_PROCEDURE: "Revenue Procedure",
  REVENUE_RULING: "Revenue Ruling",
  CASE_LAW: "Case Law",
  TREATISE: "Treatise",
  FIRM_TEMPLATE: "Firm Template",
  WORK_PRODUCT: "Work Product",
  APPROVED_OUTPUT: "Approved Output",
  FIRM_PROCEDURE: "Firm Procedure",
  TRAINING_MATERIAL: "Training Material",
  CLIENT_GUIDE: "Client Guide",
  CUSTOM: "Custom",
}

const CATEGORY_COLORS: Record<string, string> = {
  IRC_STATUTE: "bg-blue-100 text-blue-800",
  IRM_SECTION: "bg-green-100 text-green-800",
  TREATISE: "bg-purple-100 text-purple-800",
  APPROVED_OUTPUT: "bg-amber-100 text-amber-800",
  FIRM_TEMPLATE: "bg-indigo-100 text-indigo-800",
  TRAINING_MATERIAL: "bg-pink-100 text-pink-800",
}

interface KnowledgeListProps {
  documents: any[]
  stats: {
    totalDocs: number
    totalChunks: number
    approvedOutputs: number
    topDocuments: { title: string; hitCount: number }[]
  }
}

export function KnowledgeList({ documents, stats }: KnowledgeListProps) {
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [reindexing, setReindexing] = useState<string | null>(null)
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({})
  const router = useRouter()
  const { addToast } = useToast()

  const filtered = documents.filter((d: any) => {
    if (categoryFilter !== "all" && d.category !== categoryFilter) return false
    if (search) {
      const s = search.toLowerCase()
      return d.title.toLowerCase().includes(s) ||
        d.description?.toLowerCase().includes(s) ||
        d.tags?.some((t: string) => t.includes(s))
    }
    return true
  })

  // Group by category
  const grouped: Record<string, any[]> = {}
  for (const doc of filtered) {
    if (!grouped[doc.category]) grouped[doc.category] = []
    grouped[doc.category].push(doc)
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this knowledge document and all its chunks?")) return
    const res = await fetch(`/api/knowledge/${id}`, { method: "DELETE" })
    if (res.ok) {
      addToast({ title: "Document deleted" })
      router.refresh()
    }
  }

  async function handleReindex(id: string) {
    setReindexing(id)
    try {
      const res = await fetch(`/api/knowledge/${id}/reindex`, { method: "POST" })
      const data = await res.json()
      addToast({ title: "Re-indexed", description: `${data.chunksCreated} chunks created` })
      router.refresh()
    } catch {
      addToast({ title: "Re-index failed", variant: "destructive" })
    } finally {
      setReindexing(null)
    }
  }

  function toggleCategory(cat: string) {
    setCollapsedCategories((c) => ({ ...c, [cat]: !c[cat] }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Knowledge Base</h1>
        <UploadDialog />
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stats.totalDocs}</p>
                <p className="text-xs text-muted-foreground">Documents</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stats.totalChunks.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Chunks</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stats.approvedOutputs}</p>
                <p className="text-xs text-muted-foreground">Approved Outputs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium text-muted-foreground mb-1">Most Referenced</p>
            {stats.topDocuments.length > 0 ? (
              <div className="space-y-1">
                {stats.topDocuments.slice(0, 3).map((d, i) => (
                  <p key={i} className="text-xs truncate">
                    <span className="font-medium">{d.hitCount}</span> — {d.title}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No references yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search knowledge base..."
            className="pl-10"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Document list grouped by category */}
      {Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BookOpen className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">No documents yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Upload IRM sections, treatise chapters, firm templates, or CLE notes.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, docs]) => (
            <div key={category}>
              <button
                className="flex items-center gap-2 mb-2 w-full text-left"
                onClick={() => toggleCategory(category)}
              >
                {collapsedCategories[category] ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <span className="text-sm font-semibold">
                  {CATEGORY_LABELS[category] || category} ({docs.length})
                </span>
              </button>
              {!collapsedCategories[category] && (
                <div className="space-y-2 ml-6">
                  {docs.map((doc: any) => (
                    <Card key={doc.id}>
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium truncate">{doc.title}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <Badge variant="secondary" className={`text-[10px] ${CATEGORY_COLORS[doc.category] || ""}`}>
                                {CATEGORY_LABELS[doc.category] || doc.category}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{doc.chunkCount} chunks</span>
                              <span className="text-xs text-muted-foreground">· {doc.hitCount} refs</span>
                              {doc.tags?.slice(0, 3).map((tag: string) => (
                                <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                              ))}
                              {doc.sourceCaseId && (
                                <Link href={`/cases/${doc.sourceCaseId}`} className="text-xs text-blue-600 hover:underline">
                                  Source case
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleReindex(doc.id)}
                            disabled={reindexing === doc.id}
                            title="Re-index"
                          >
                            {reindexing === doc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDelete(doc.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
