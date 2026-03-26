"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Download, Plus, Trash2, AlertTriangle, FileText } from "lucide-react"
import { useToast } from "@/components/ui/toast"

interface SpreadsheetTab {
  name: string
  columns: string[]
  rows: string[][]
}

interface SpreadsheetEditorProps {
  taskId: string
  editable: boolean
  onDataChange?: (tabs: SpreadsheetTab[]) => void
}

interface ValidationIssue {
  key: string
  label: string
  issue: string
  severity: "error" | "warning" | "info"
}

export function SpreadsheetEditor({ taskId, editable, onDataChange }: SpreadsheetEditorProps) {
  const [tabs, setTabs] = useState<SpreadsheetTab[]>([])
  const [activeTab, setActiveTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([])
  const [summary, setSummary] = useState<Record<string, number>>({})
  const { addToast } = useToast()

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/ai/tasks/${taskId}/spreadsheet`)
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: "Failed to load" }))
          throw new Error(errData.error || "Failed to load spreadsheet data")
        }
        const data = await res.json()
        setTabs(data.tabs)
        if (data.validationIssues) setValidationIssues(data.validationIssues)
        if (data.summary) setSummary(data.summary)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [taskId])

  function updateCell(tabIndex: number, rowIndex: number, colIndex: number, value: string) {
    const newTabs = [...tabs]
    newTabs[tabIndex] = {
      ...newTabs[tabIndex],
      rows: newTabs[tabIndex].rows.map((row, ri) =>
        ri === rowIndex
          ? row.map((cell, ci) => (ci === colIndex ? value : cell))
          : row
      ),
    }
    setTabs(newTabs)
    onDataChange?.(newTabs)
  }

  function addRow(tabIndex: number) {
    const newTabs = [...tabs]
    const emptyRow = new Array(newTabs[tabIndex].columns.length).fill("")
    newTabs[tabIndex] = {
      ...newTabs[tabIndex],
      rows: [...newTabs[tabIndex].rows, emptyRow],
    }
    setTabs(newTabs)
    onDataChange?.(newTabs)
  }

  function removeRow(tabIndex: number, rowIndex: number) {
    const newTabs = [...tabs]
    newTabs[tabIndex] = {
      ...newTabs[tabIndex],
      rows: newTabs[tabIndex].rows.filter((_, i) => i !== rowIndex),
    }
    setTabs(newTabs)
    onDataChange?.(newTabs)
  }

  async function handleExport() {
    const url = `/api/ai/tasks/${taskId}/export?format=xlsx`
    try {
      const res = await fetch(url)
      if (res.status === 422) {
        const data = await res.json()
        const details = (data.details as string[])?.join("\n• ") || "Unknown validation error"
        addToast({
          title: "Export validation failed",
          description: `• ${details}`,
          variant: "destructive",
          action: "Try re-generating the deliverable.",
        })
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Export failed" }))
        addToast({ title: "Export failed", description: data.error, variant: "destructive" })
        return
      }
      const blob = await res.blob()
      const disposition = res.headers.get("Content-Disposition") || ""
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename = match?.[1] || "export.xlsx"
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      addToast({ title: "Export failed", description: "Network error", variant: "destructive" })
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Loading working papers...
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-c-danger">
          {error}
        </CardContent>
      </Card>
    )
  }

  const currentTab = tabs[activeTab]
  if (!currentTab) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">OIC Working Papers</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export .xlsx
          </Button>
        </div>

        {/* Validation issues */}
        {validationIssues.length > 0 && (
          <div className="space-y-1 rounded-lg border p-3 bg-muted/30">
            <p className="text-sm font-medium">
              {validationIssues.filter(i => i.severity === "error").length > 0
                ? "Issues found in extracted data:"
                : "Notes on extracted data:"}
            </p>
            {validationIssues.map((issue, i) => (
              <div key={i} className={`flex items-start gap-2 text-xs ${
                issue.severity === "error" ? "text-c-danger" :
                issue.severity === "warning" ? "text-yellow-700" :
                "text-muted-foreground"
              }`}>
                {issue.severity === "error" ? (
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                ) : issue.severity === "warning" ? (
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                ) : (
                  <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                )}
                <span><strong>{issue.label}:</strong> {issue.issue}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tab navigation */}
        <div className="flex flex-wrap gap-1 border-b pt-2">
          {tabs.map((tab, i) => (
            <button
              key={tab.name}
              onClick={() => setActiveTab(i)}
              className={`px-3 py-1.5 text-sm rounded-t-md border border-b-0 transition-colors ${
                i === activeTab
                  ? "bg-background font-medium -mb-px border-b-background"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {tab.name}
              {tab.rows.length > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">({tab.rows.length})</span>
              )}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {currentTab.columns.map((col) => (
                  <TableHead key={col} className="font-medium bg-c-snow whitespace-nowrap">
                    {col}
                  </TableHead>
                ))}
                {editable && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentTab.rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={currentTab.columns.length + (editable ? 1 : 0)}
                    className="text-center text-muted-foreground py-8"
                  >
                    No data in this section
                  </TableCell>
                </TableRow>
              ) : (
                currentTab.rows.map((row, rowIndex) => {
                  const rowText = row.join(" ")
                  const hasVerify = rowText.includes("[VERIFY]")
                  const hasJudgment = rowText.includes("[PRACTITIONER JUDGMENT]")

                  return (
                    <TableRow
                      key={rowIndex}
                      className={
                        hasVerify
                          ? "bg-yellow-50"
                          : hasJudgment
                          ? "bg-c-info-soft"
                          : ""
                      }
                    >
                      {row.map((cell, colIndex) => (
                        <TableCell key={colIndex} className="p-1">
                          {editable ? (
                            <Input
                              value={cell}
                              onChange={(e) =>
                                updateCell(activeTab, rowIndex, colIndex, e.target.value)
                              }
                              className="h-8 text-sm border-transparent hover:border-input focus:border-input"
                            />
                          ) : (
                            <div className="px-2 py-1 text-sm">
                              {hasVerify && cell.includes("[VERIFY]") ? (
                                <span className="inline-flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3 text-yellow-600" />
                                  {cell}
                                </span>
                              ) : hasJudgment && cell.includes("[PRACTITIONER JUDGMENT]") ? (
                                <span className="inline-flex items-center gap-1">
                                  <FileText className="h-3 w-3 text-c-teal" />
                                  {cell}
                                </span>
                              ) : (
                                cell
                              )}
                            </div>
                          )}
                        </TableCell>
                      ))}
                      {editable && (
                        <TableCell className="p-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-c-danger"
                            onClick={() => removeRow(activeTab, rowIndex)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {editable && (
          <div className="p-3 border-t">
            <Button variant="outline" size="sm" onClick={() => addRow(activeTab)}>
              <Plus className="mr-2 h-3 w-3" />
              Add Row
            </Button>
          </div>
        )}

        {/* Legend */}
        <div className="flex gap-4 p-3 border-t text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 bg-yellow-100 border rounded" />
            [VERIFY] — Needs verification
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 bg-c-info-soft border rounded" />
            [PRACTITIONER JUDGMENT] — Professional judgment required
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
