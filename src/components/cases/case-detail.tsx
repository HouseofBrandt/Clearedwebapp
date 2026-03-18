"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { DocumentUpload } from "@/components/documents/document-upload"
import { DocumentList } from "@/components/documents/document-list"
import { AIAnalysisPanel } from "@/components/cases/ai-analysis-panel"
import {
  ArrowLeft,
  Save,
  FileText,
  Brain,
  Clock,
} from "lucide-react"
import { CASE_TYPE_LABELS, CASE_STATUS_LABELS } from "@/types"

const statusColors: Record<string, string> = {
  INTAKE: "bg-blue-100 text-blue-800",
  ANALYSIS: "bg-yellow-100 text-yellow-800",
  REVIEW: "bg-purple-100 text-purple-800",
  ACTIVE: "bg-green-100 text-green-800",
  RESOLVED: "bg-gray-100 text-gray-800",
  CLOSED: "bg-gray-200 text-gray-600",
}

interface CaseDetailProps {
  caseData: any
  practitioners: { id: string; name: string }[]
}

export function CaseDetail({ caseData, practitioners }: CaseDetailProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    clientName: caseData.clientName,
    caseType: caseData.caseType,
    status: caseData.status,
    notes: caseData.notes || "",
    assignedPractitionerId: caseData.assignedPractitionerId || "",
  })
  const router = useRouter()
  const { addToast } = useToast()

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/cases/${caseData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })

      if (!res.ok) throw new Error("Failed to update")

      addToast({ title: "Case updated" })
      setEditing(false)
      router.refresh()
    } catch {
      addToast({ title: "Error", description: "Failed to update case", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/cases">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{caseData.caseNumber}</h1>
            <Badge className={statusColors[caseData.status] || ""} variant="secondary">
              {CASE_STATUS_LABELS[caseData.status as keyof typeof CASE_STATUS_LABELS]}
            </Badge>
          </div>
          <p className="text-muted-foreground">{caseData.clientName}</p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setEditing(true)}>Edit Case</Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">
            <FileText className="mr-1 h-4 w-4" />
            Documents ({caseData.documents.length})
          </TabsTrigger>
          <TabsTrigger value="ai">
            <Brain className="mr-1 h-4 w-4" />
            AI Tasks ({caseData.aiTasks.length})
          </TabsTrigger>
          <TabsTrigger value="timeline">
            <Clock className="mr-1 h-4 w-4" />
            Timeline
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Case Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Client Name</Label>
                  {editing ? (
                    <Input
                      value={form.clientName}
                      onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm">{caseData.clientName}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Case Type</Label>
                  {editing ? (
                    <Select value={form.caseType} onValueChange={(v) => setForm({ ...form, caseType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CASE_TYPE_LABELS).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm">{CASE_TYPE_LABELS[caseData.caseType as keyof typeof CASE_TYPE_LABELS]}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  {editing ? (
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CASE_STATUS_LABELS).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge className={statusColors[caseData.status] || ""} variant="secondary">
                      {CASE_STATUS_LABELS[caseData.status as keyof typeof CASE_STATUS_LABELS]}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Assignment & Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Assigned Practitioner</Label>
                  {editing ? (
                    <Select
                      value={form.assignedPractitionerId}
                      onValueChange={(v) => setForm({ ...form, assignedPractitionerId: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select practitioner" /></SelectTrigger>
                      <SelectContent>
                        {practitioners.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm">{caseData.assignedPractitioner?.name || "Unassigned"}</p>
                  )}
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Notes</Label>
                  {editing ? (
                    <Textarea
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      rows={4}
                    />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{caseData.notes || "No notes"}</p>
                  )}
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Created</p>
                    <p>{new Date(caseData.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Last Updated</p>
                    <p>{new Date(caseData.updatedAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <DocumentUpload caseId={caseData.id} />
          <DocumentList documents={caseData.documents} />
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <AIAnalysisPanel
            caseId={caseData.id}
            caseType={caseData.caseType}
            documentCount={caseData.documents.length}
          />
          {caseData.aiTasks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Brain className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-semibold">No AI tasks yet</h3>
                <p className="text-sm text-muted-foreground">
                  Upload documents and run AI analysis to generate working papers and memos.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {caseData.aiTasks.map((task: any) => (
                <Link key={task.id} href={`/review/${task.id}`}>
                  <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-medium">{task.taskType.replace(/_/g, " ")}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(task.createdAt).toLocaleString()} &middot; {task.modelUsed || "pending"}
                        </p>
                      </div>
                      <Badge variant={task.status === "APPROVED" ? "default" : "secondary"}>
                        {task.status.replace(/_/g, " ")}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Case timeline will show all activity including document uploads, AI analyses, and review actions.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
