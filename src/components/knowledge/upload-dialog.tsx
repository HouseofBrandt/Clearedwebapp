"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { Plus, Loader2, Upload } from "lucide-react"

const CATEGORIES = [
  { value: "IRC_STATUTE", label: "IRC Statute" },
  { value: "TREASURY_REGULATION", label: "Treasury Regulation" },
  { value: "IRM_SECTION", label: "IRM Section" },
  { value: "REVENUE_PROCEDURE", label: "Revenue Procedure" },
  { value: "REVENUE_RULING", label: "Revenue Ruling" },
  { value: "CASE_LAW", label: "Case Law" },
  { value: "TREATISE", label: "Treatise / Reference Book" },
  { value: "FIRM_TEMPLATE", label: "Firm Template" },
  { value: "WORK_PRODUCT", label: "Work Product" },
  { value: "FIRM_PROCEDURE", label: "Firm Procedure" },
  { value: "TRAINING_MATERIAL", label: "Training / CLE Material" },
  { value: "CLIENT_GUIDE", label: "Client Guide" },
  { value: "CUSTOM", label: "Custom" },
]

export function UploadDialog() {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("")
  const [description, setDescription] = useState("")
  const [sourceText, setSourceText] = useState("")
  const [tags, setTags] = useState("")
  const [fileName, setFileName] = useState("")
  const router = useRouter()
  const { addToast } = useToast()

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""))

    // Auto-detect category from filename
    const name = file.name.toLowerCase()
    if (name.includes("irm")) setCategory("IRM_SECTION")
    else if (name.includes("irc") || name.includes("section")) setCategory("IRC_STATUTE")
    else if (name.includes("reg")) setCategory("TREASURY_REGULATION")
    else if (name.includes("rev proc")) setCategory("REVENUE_PROCEDURE")
    else if (name.includes("template")) setCategory("FIRM_TEMPLATE")

    const text = await file.text()
    setSourceText(text)
  }

  function resetForm() {
    setTitle("")
    setCategory("")
    setDescription("")
    setSourceText("")
    setTags("")
    setFileName("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title || !category || !sourceText) return

    setSubmitting(true)
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          description: description || undefined,
          sourceText,
          tags: tags ? tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) : [],
          fileName: fileName || undefined,
          fileSize: sourceText.length,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to upload")
      }

      const data = await res.json()
      addToast({
        title: "Knowledge added",
        description: `${data.chunksCreated} chunks created${data.warning ? `. Note: ${data.warning}` : ""}`,
      })
      resetForm()
      setOpen(false)
      router.refresh()
    } catch (error: any) {
      addToast({ title: "Error", description: error.message, variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" />
          Add Knowledge
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add to Knowledge Base</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Upload File (text/txt)</Label>
            <div className="flex items-center gap-2">
              <Input type="file" accept=".txt,.md,.text" onChange={handleFileUpload} className="text-sm" />
            </div>
            {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
          </div>

          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., IRM 5.8.5 — RCP Calculation" />
          </div>

          <div className="space-y-2">
            <Label>Category *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of this content" />
          </div>

          <div className="space-y-2">
            <Label>Tags (comma-separated)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="oic, rcp, irm-5.8" />
          </div>

          <div className="space-y-2">
            <Label>Content {sourceText ? `(${(sourceText.length / 1000).toFixed(1)}K chars)` : "*"}</Label>
            <Textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Paste content here, or upload a file above..."
              rows={8}
              className="text-sm font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting || !title || !category || !sourceText}>
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
              Upload & Process
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
