"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Loader2,
  FileCheck,
  Plus,
  Calendar,
  Upload,
} from "lucide-react"

interface EvidenceItem {
  id: string
  controlId: string
  evidenceType: string
  collectedAt: string
  contentOrPath: string
  collector: string
  validUntil: string | null
}

interface ControlOption {
  controlId: string
  description: string
  tsc: string
}

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  AUTOMATED_LOG: "Automated Log",
  CONFIG_SNAPSHOT: "Config Snapshot",
  POLICY_DOCUMENT: "Policy Document",
  MANUAL_UPLOAD: "Manual Upload",
  TEST_RESULT: "Test Result",
}

export function EvidenceBrowser() {
  const [controls, setControls] = useState<ControlOption[]>([])
  const [selectedControl, setSelectedControl] = useState<string>("")
  const [evidence, setEvidence] = useState<EvidenceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [uploadType, setUploadType] = useState("MANUAL_UPLOAD")
  const [uploadContent, setUploadContent] = useState("")
  const [uploadValidUntil, setUploadValidUntil] = useState("")

  const fetchControls = useCallback(async () => {
    try {
      const res = await fetch("/api/compliance/controls")
      if (res.ok) {
        const data = await res.json()
        setControls(
          data.map((c: any) => ({
            controlId: c.controlId,
            description: c.description,
            tsc: c.tsc,
          }))
        )
      }
    } catch (err) {
      console.error("Failed to fetch controls:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchControls()
  }, [fetchControls])

  const fetchEvidence = useCallback(async (controlId: string) => {
    setEvidenceLoading(true)
    try {
      const res = await fetch(`/api/compliance/evidence?controlId=${controlId}`)
      if (res.ok) {
        const data = await res.json()
        setEvidence(data)
      }
    } catch (err) {
      console.error("Failed to fetch evidence:", err)
    } finally {
      setEvidenceLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedControl) {
      fetchEvidence(selectedControl)
    } else {
      setEvidence([])
    }
  }, [selectedControl, fetchEvidence])

  const handleUpload = async () => {
    if (!selectedControl || !uploadContent) return
    setUploading(true)
    try {
      const res = await fetch("/api/compliance/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          controlId: selectedControl,
          evidenceType: uploadType,
          contentOrPath: uploadContent,
          validUntil: uploadValidUntil || undefined,
        }),
      })
      if (res.ok) {
        setUploadContent("")
        setUploadValidUntil("")
        setShowUploadForm(false)
        fetchEvidence(selectedControl)
      }
    } catch (err) {
      console.error("Failed to upload evidence:", err)
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">Select Control:</span>
            <Select value={selectedControl} onValueChange={setSelectedControl}>
              <SelectTrigger className="w-[400px]">
                <SelectValue placeholder="Choose a control to view evidence" />
              </SelectTrigger>
              <SelectContent>
                {controls.map((c) => (
                  <SelectItem key={c.controlId} value={c.controlId}>
                    {c.controlId} — {c.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedControl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUploadForm(!showUploadForm)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Upload Evidence
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {showUploadForm && selectedControl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upload Evidence for {selectedControl}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Evidence Type</label>
                <Select value={uploadType} onValueChange={setUploadType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EVIDENCE_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Valid Until (optional)</label>
                <Input type="date" value={uploadValidUntil} onChange={(e) => setUploadValidUntil(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Content or File Path</label>
              <Textarea
                value={uploadContent}
                onChange={(e) => setUploadContent(e.target.value)}
                placeholder="Paste evidence content, a file path, or a description of the evidence..."
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowUploadForm(false)}>Cancel</Button>
              <Button onClick={handleUpload} disabled={uploading || !uploadContent}>
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Upload
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!selectedControl ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileCheck className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">Select a control above to view its evidence items</p>
          </CardContent>
        </Card>
      ) : evidenceLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : evidence.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileCheck className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">No evidence collected for {selectedControl} yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {evidence.map((item) => (
            <Card key={item.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {EVIDENCE_TYPE_LABELS[item.evidenceType] || item.evidenceType}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(item.collectedAt).toLocaleDateString()}
                      </span>
                      {item.validUntil && (
                        <span className="text-xs text-muted-foreground">
                          Valid until: {new Date(item.validUntil).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words">{item.contentOrPath}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
