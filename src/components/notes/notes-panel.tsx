"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { NoteCard } from "@/components/notes/note-card"
import {
  Search,
  Pin,
  ArrowUpDown,
  Plus,
  Loader2,
  StickyNote,
} from "lucide-react"

const NOTE_TYPES = [
  { value: "ALL", label: "All types" },
  { value: "JOURNAL_ENTRY", label: "Journal" },
  { value: "CALL_LOG", label: "Call Log" },
  { value: "IRS_CONTACT", label: "IRS Contact" },
  { value: "STRATEGY_NOTE", label: "Strategy" },
  { value: "CLIENT_INTERACTION", label: "Client" },
  { value: "RESEARCH", label: "Research" },
  { value: "GENERAL", label: "General" },
]

const NOTE_TYPE_CHIP_STYLES: Record<string, string> = {
  ALL: "bg-slate-100 text-slate-600",
  JOURNAL_ENTRY: "bg-slate-100 text-slate-600",
  CALL_LOG: "bg-blue-100 text-blue-700",
  IRS_CONTACT: "bg-red-100 text-red-700",
  STRATEGY_NOTE: "bg-slate-800 text-white",
  CLIENT_INTERACTION: "bg-purple-100 text-purple-700",
  RESEARCH: "bg-amber-100 text-amber-700",
  GENERAL: "bg-slate-100 text-slate-500",
}

const FEATURE_AREAS = [
  { value: "", label: "None" },
  { value: "TRANSCRIPT_DECODER", label: "Transcript Decoder" },
  { value: "CASE_INTELLIGENCE", label: "Case Intelligence" },
  { value: "PENALTY_ABATEMENT", label: "Penalty Abatement" },
  { value: "OIC", label: "OIC" },
  { value: "COMPLIANCE", label: "Compliance" },
  { value: "DEADLINE_TRACKER", label: "Deadlines" },
  { value: "GENERAL", label: "General" },
]

const TAX_YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025]

interface NotesPanelProps {
  caseId: string
  currentUserId: string
  currentUserRole: string
}

export function NotesPanel({ caseId, currentUserId, currentUserRole }: NotesPanelProps) {
  const [notes, setNotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState("ALL")
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest")

  // Quick-add form state
  const [formType, setFormType] = useState("GENERAL")
  const [formTitle, setFormTitle] = useState("")
  const [formContent, setFormContent] = useState("")
  const [formTaxYears, setFormTaxYears] = useState<number[]>([])
  const [formFeatureArea, setFormFeatureArea] = useState("")
  const [formVisibility, setFormVisibility] = useState("ALL_PRACTITIONERS")
  const [formPinned, setFormPinned] = useState(false)
  const [formPrivileged, setFormPrivileged] = useState(false)
  // Call log fields
  const [formCallDate, setFormCallDate] = useState("")
  const [formCallDuration, setFormCallDuration] = useState("")
  const [formCallParticipants, setFormCallParticipants] = useState("")
  const [formCallType, setFormCallType] = useState("")
  // IRS contact fields
  const [formIrsName, setFormIrsName] = useState("")
  const [formIrsId, setFormIrsId] = useState("")
  const [formIrsDept, setFormIrsDept] = useState("")
  const [formIrsMethod, setFormIrsMethod] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const { addToast } = useToast()

  const fetchNotes = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set("search", searchQuery)
      if (filterType !== "ALL") params.set("noteType", filterType)
      params.set("sort", sortOrder)
      const res = await fetch(`/api/cases/${caseId}/notes?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setNotes(data.notes || data)
    } catch {
      addToast({ title: "Error loading notes", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [caseId, searchQuery, filterType, sortOrder, addToast])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  function resetForm() {
    setFormType("GENERAL")
    setFormTitle("")
    setFormContent("")
    setFormTaxYears([])
    setFormFeatureArea("")
    setFormVisibility("ALL_PRACTITIONERS")
    setFormPinned(false)
    setFormPrivileged(false)
    setFormCallDate("")
    setFormCallDuration("")
    setFormCallParticipants("")
    setFormCallType("")
    setFormIrsName("")
    setFormIrsId("")
    setFormIrsDept("")
    setFormIrsMethod("")
  }

  async function handleSubmit() {
    if (formContent.trim().length < 10) {
      addToast({ title: "Content must be at least 10 characters", variant: "destructive" })
      return
    }
    setSubmitting(true)
    try {
      const body: any = {
        noteType: formType,
        content: formContent.trim(),
        title: formTitle.trim() || null,
        taxYears: formTaxYears,
        relatedFeature: formFeatureArea && formFeatureArea !== "__none" ? formFeatureArea : null,
        visibility: formVisibility,
        pinned: formPinned,
        isPrivileged: formPrivileged,
      }
      if (formType === "CALL_LOG") {
        if (formCallDate) body.callDate = new Date(formCallDate).toISOString()
        if (formCallDuration) body.callDuration = parseInt(formCallDuration)
        if (formCallParticipants) body.callParticipants = formCallParticipants
        if (formCallType) body.callType = formCallType
      }
      if (formType === "IRS_CONTACT") {
        if (formIrsName) body.irsEmployeeName = formIrsName
        if (formIrsId) body.irsEmployeeId = formIrsId
        if (formIrsDept) body.irsDepartment = formIrsDept
        if (formIrsMethod) body.irsContactMethod = formIrsMethod
      }
      const res = await fetch(`/api/cases/${caseId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      resetForm()
      fetchNotes()
      addToast({ title: "Note saved" })
    } catch {
      addToast({ title: "Error saving note", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  function toggleTaxYear(year: number) {
    setFormTaxYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]
    )
  }

  const pinnedNotes = notes.filter((n) => n.pinned)
  const filteredNotes = notes

  return (
    <div className="flex gap-4 h-full">
      {/* Left panel — Note feed (70%) */}
      <div className="flex-[7] min-w-0 space-y-3">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        {/* Filter chips + sort */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {NOTE_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setFilterType(t.value)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors ${
                filterType === t.value
                  ? NOTE_TYPE_CHIP_STYLES[t.value] || "bg-slate-200 text-slate-700"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {t.label}
            </button>
          ))}
          <div className="ml-auto">
            <button
              onClick={() => setSortOrder(sortOrder === "newest" ? "oldest" : "newest")}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground rounded transition-colors"
            >
              <ArrowUpDown className="h-3 w-3" />
              {sortOrder === "newest" ? "Newest" : "Oldest"}
            </button>
          </div>
        </div>

        {/* Notes list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredNotes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <StickyNote className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">No notes yet</h3>
              <p className="text-sm text-muted-foreground">Add a note using the form on the right.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                caseId={caseId}
                currentUserId={currentUserId}
                onUpdated={fetchNotes}
              />
            ))}
          </div>
        )}
      </div>

      {/* Right sidebar (30%) */}
      <div className="flex-[3] min-w-[260px] space-y-4">
        {/* Pinned Notes */}
        {pinnedNotes.length > 0 && (
          <Card>
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                <Pin className="h-3 w-3 text-amber-500" fill="currentColor" />
                Pinned Notes ({pinnedNotes.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-1.5">
              {pinnedNotes.map((note) => (
                <div key={note.id} className="text-xs p-1.5 rounded bg-amber-50/50 border border-amber-200/50">
                  <div className="flex items-center gap-1.5">
                    <Badge className={`${(NOTE_TYPE_CHIP_STYLES[note.noteType] || "bg-slate-100 text-slate-500")} text-[9px] py-0`} variant="secondary">
                      {NOTE_TYPES.find((t) => t.value === note.noteType)?.label || note.noteType}
                    </Badge>
                    {note.title && <span className="font-medium truncate">{note.title}</span>}
                  </div>
                  <p className="text-muted-foreground mt-0.5 line-clamp-2">{note.content}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Quick-add form */}
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
              <Plus className="h-3 w-3" />
              Add Note
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-3">
            {/* Note type */}
            <div className="space-y-1">
              <Label className="text-[11px]">Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTE_TYPES.filter((t) => t.value !== "ALL").map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Title */}
            <div className="space-y-1">
              <Label className="text-[11px]">Title (optional)</Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="h-7 text-xs"
                placeholder="Brief title"
              />
            </div>

            {/* Content */}
            <div className="space-y-1">
              <Label className="text-[11px]">Content *</Label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={4}
                className="text-xs"
                placeholder="Note content (min 10 characters)"
              />
            </div>

            {/* Call log fields */}
            {formType === "CALL_LOG" && (
              <div className="space-y-2 border rounded p-2 bg-blue-50/30">
                <p className="text-[10px] font-semibold text-blue-700">Call Details</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">Date</Label>
                    <Input type="date" value={formCallDate} onChange={(e) => setFormCallDate(e.target.value)} className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Duration (min)</Label>
                    <Input type="number" value={formCallDuration} onChange={(e) => setFormCallDuration(e.target.value)} className="h-7 text-xs" />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px]">Type</Label>
                  <Select value={formCallType} onValueChange={setFormCallType}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inbound">Inbound</SelectItem>
                      <SelectItem value="outbound">Outbound</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px]">Participants</Label>
                  <Input value={formCallParticipants} onChange={(e) => setFormCallParticipants(e.target.value)} className="h-7 text-xs" placeholder="Names" />
                </div>
              </div>
            )}

            {/* IRS contact fields */}
            {formType === "IRS_CONTACT" && (
              <div className="space-y-2 border rounded p-2 bg-red-50/30">
                <p className="text-[10px] font-semibold text-red-700">IRS Contact Details</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">Employee Name</Label>
                    <Input value={formIrsName} onChange={(e) => setFormIrsName(e.target.value)} className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Badge/ID</Label>
                    <Input value={formIrsId} onChange={(e) => setFormIrsId(e.target.value)} className="h-7 text-xs" />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px]">Department</Label>
                  <Input value={formIrsDept} onChange={(e) => setFormIrsDept(e.target.value)} className="h-7 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px]">Contact Method</Label>
                  <Select value={formIrsMethod} onValueChange={setFormIrsMethod}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="phone">Phone</SelectItem>
                      <SelectItem value="fax">Fax</SelectItem>
                      <SelectItem value="mail">Mail</SelectItem>
                      <SelectItem value="in-person">In-Person</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Tax years */}
            <div className="space-y-1">
              <Label className="text-[11px]">Tax Years</Label>
              <div className="flex flex-wrap gap-1">
                {TAX_YEARS.map((y) => (
                  <button
                    key={y}
                    onClick={() => toggleTaxYear(y)}
                    className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                      formTaxYears.includes(y)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>

            {/* Feature area */}
            <div className="space-y-1">
              <Label className="text-[11px]">Feature Area</Label>
              <Select value={formFeatureArea} onValueChange={setFormFeatureArea}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {FEATURE_AREAS.map((f) => (
                    <SelectItem key={f.value || "__none"} value={f.value || "__none"}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Visibility */}
            <div className="space-y-1">
              <Label className="text-[11px]">Visibility</Label>
              <div className="space-y-1">
                {[
                  { value: "ALL_PRACTITIONERS", label: "All Practitioners" },
                  { value: "CASE_TEAM_ONLY", label: "Case Team Only" },
                  { value: "PRIVATE", label: "Private" },
                ].map((v) => (
                  <label key={v.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      checked={formVisibility === v.value}
                      onChange={() => setFormVisibility(v.value)}
                      className="h-3 w-3"
                    />
                    {v.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Pin toggle */}
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={formPinned}
                onChange={(e) => setFormPinned(e.target.checked)}
                className="h-3 w-3"
              />
              Pin this note
            </label>

            {/* Privileged toggle (attorneys only) */}
            {currentUserRole === "ATTORNEY" && (
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={formPrivileged}
                  onChange={(e) => setFormPrivileged(e.target.checked)}
                  className="h-3 w-3"
                />
                Mark as privileged (attorney work product)
              </label>
            )}

            <Button
              onClick={handleSubmit}
              disabled={submitting || formContent.trim().length < 10}
              className="w-full h-8 text-xs"
            >
              {submitting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
              Save Note
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
