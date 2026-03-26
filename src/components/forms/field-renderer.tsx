"use client"

import { useState, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Trash2, Upload, FileText, HelpCircle } from "lucide-react"
import type { FieldDef, ConditionalRule } from "@/lib/forms/types"

// ---------------------------------------------------------------------------
// Condition evaluator — supports the existing ConditionalRule shape
// ---------------------------------------------------------------------------

export function evaluateConditions(
  conditionals: ConditionalRule[] | undefined,
  allValues: Record<string, any>
): boolean {
  if (!conditionals || conditionals.length === 0) return true
  return conditionals.every((cond) => {
    // Only handle "show" conditions for visibility; "hide" inverts
    const fieldVal = allValues[cond.field]
    let matches = false
    switch (cond.operator) {
      case "equals":
        matches = String(fieldVal) === String(cond.value)
        break
      case "not_equals":
        matches = String(fieldVal) !== String(cond.value)
        break
      case "contains":
        matches = String(fieldVal || "").includes(String(cond.value))
        break
      case "greater_than":
        matches = Number(fieldVal) > Number(cond.value)
        break
      case "less_than":
        matches = Number(fieldVal) < Number(cond.value)
        break
      case "is_empty":
        matches = !fieldVal || fieldVal === "" || (Array.isArray(fieldVal) && fieldVal.length === 0)
        break
      case "is_not_empty":
        matches = !!fieldVal && fieldVal !== "" && !(Array.isArray(fieldVal) && fieldVal.length === 0)
        break
      default:
        matches = true
    }
    // If action is "hide", invert visibility
    if (cond.action === "hide") return !matches
    // For "show", "require", "disable" — show if matches
    return matches
  })
}

// ---------------------------------------------------------------------------
// Simple formula evaluator for computed fields
// ---------------------------------------------------------------------------

export function evaluateFormula(formula: string, allValues: Record<string, any>): number {
  // Handle SUM(repeatingGroup.field) expressions
  const sumMatch = formula.match(/^SUM\((\w+)\.(\w+)\)$/)
  if (sumMatch) {
    const [, groupName, fieldName] = sumMatch
    const group = allValues[groupName]
    if (Array.isArray(group)) {
      return group.reduce((sum: number, item: any) => sum + (Number(item?.[fieldName]) || 0), 0)
    }
    return 0
  }

  // Handle simple field references and arithmetic
  let expr = formula

  // Replace dot-path references first (e.g., business_net_monthly)
  // Sort by length descending to avoid partial matches
  const fieldNames = Object.keys(allValues).sort((a, b) => b.length - a.length)
  for (const name of fieldNames) {
    const val = Number(allValues[name]) || 0
    // Use word boundary to avoid partial replacements
    expr = expr.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), String(val))
  }

  // Validate the expression only contains safe characters
  const sanitized = expr.replace(/\s/g, '')
  if (!/^[\d+\-*/().]+$/.test(sanitized)) return 0

  try {
    const result = new Function(`return (${expr})`)()
    return typeof result === 'number' && isFinite(result) ? Math.round(result * 100) / 100 : 0
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatSSN(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9)
  if (digits.length <= 3) return digits
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
}

function formatEIN(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}-${digits.slice(2)}`
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function formatCurrency(value: string | number): string {
  const num = typeof value === "number" ? value : parseFloat(String(value).replace(/[,$\s]/g, ""))
  if (isNaN(num)) return ""
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseCurrencyInput(value: string): string {
  return value.replace(/[^0-9.\-]/g, "")
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FieldRendererProps {
  field: FieldDef
  value: any
  onChange: (value: any) => void
  error?: string
  allValues: Record<string, any>
  /** Called when the user clicks the help icon on a field that has helpText or irsReference */
  onFieldHelp?: (fieldId: string) => void
  /** Auto-population metadata for this field (if auto-populated) */
  autoPopulated?: {
    confidence: "high" | "medium" | "low"
    sourceName: string
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FieldRenderer({ field, value, onChange, error, allValues, onFieldHelp, autoPopulated }: FieldRendererProps) {
  // Check conditional visibility
  if (!evaluateConditions(field.conditionals, allValues)) return null

  const isRequired = field.required
  const irsRef = field.irsReference
  const hasHelpContent = !!(field.helpText || field.irsReference)

  // Auto-population border color
  const autoBorderClass = autoPopulated
    ? autoPopulated.confidence === "high"
      ? "border-l-4 border-l-c-teal pl-3"
      : "border-l-4 border-l-c-warning pl-3"
    : ""

  return (
    <div className={`space-y-1.5 ${autoBorderClass}`} title={autoPopulated ? `From ${autoPopulated.sourceName}` : undefined}>
      {/* Label row */}
      <div className="flex items-center gap-2">
        <Label htmlFor={field.id} className="text-sm font-medium text-c-gray-700">
          {field.label}
          {isRequired && <span className="text-c-danger ml-0.5">*</span>}
        </Label>
        {irsRef && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal text-c-gray-300 border-c-gray-100">
            {irsRef}
          </Badge>
        )}
        {hasHelpContent && onFieldHelp && (
          <button
            type="button"
            onClick={() => onFieldHelp(field.id)}
            className="text-c-gray-300 hover:text-[var(--c-teal)] transition-colors"
            title={`Get help with ${field.label}`}
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        )}
        {autoPopulated && (
          <span className="inline-flex items-center" title={`Auto-populated from ${autoPopulated.sourceName}`}>
            <FileText className="h-3 w-3 text-c-gray-300" />
          </span>
        )}
      </div>

      {/* Field input */}
      <FieldInput field={field} value={value} onChange={onChange} allValues={allValues} />

      {/* Help text */}
      {field.helpText && (
        <p className="text-xs text-c-gray-300">{field.helpText}</p>
      )}

      {/* Error message */}
      {error && (
        <p className="text-xs text-c-danger">{error}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FieldInput — renders the appropriate control per type
// ---------------------------------------------------------------------------

function FieldInput({
  field,
  value,
  onChange,
  allValues,
}: {
  field: FieldDef
  value: any
  onChange: (value: any) => void
  allValues: Record<string, any>
}) {
  const [isFocused, setIsFocused] = useState(false)

  switch (field.type) {
    case "text":
      return (
        <Input
          id={field.id}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="h-10"
        />
      )

    case "textarea":
      return (
        <Textarea
          id={field.id}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className="resize-y"
        />
      )

    case "ssn":
      return (
        <Input
          id={field.id}
          value={formatSSN(value || "")}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 9))}
          placeholder="XXX-XX-XXXX"
          maxLength={11}
          className="h-10 font-mono"
        />
      )

    case "ein":
      return (
        <Input
          id={field.id}
          value={formatEIN(value || "")}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 9))}
          placeholder="XX-XXXXXXX"
          maxLength={10}
          className="h-10 font-mono"
        />
      )

    case "phone":
      return (
        <Input
          id={field.id}
          value={formatPhone(value || "")}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
          placeholder="(XXX) XXX-XXXX"
          maxLength={14}
          className="h-10"
        />
      )

    case "date":
      return (
        <Input
          id={field.id}
          type="date"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-10"
        />
      )

    case "currency":
      return (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-c-gray-300 font-mono">$</span>
          <Input
            id={field.id}
            value={isFocused ? (value || "") : (value ? formatCurrency(value) : "")}
            onChange={(e) => onChange(parseCurrencyInput(e.target.value))}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="0.00"
            className="h-10 pl-7 font-mono tabular-nums text-right"
          />
        </div>
      )

    case "percentage":
      return (
        <div className="relative">
          <Input
            id={field.id}
            value={value || ""}
            onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0"
            className="h-10 pr-7 font-mono tabular-nums text-right"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-c-gray-300 font-mono">%</span>
        </div>
      )

    case "yes_no":
      return (
        <div className="flex gap-4 pt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={field.id}
              value="yes"
              checked={value === true || value === "yes"}
              onChange={() => onChange(true)}
              className="h-4 w-4 accent-[var(--c-teal)]"
            />
            <span className="text-sm">Yes</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={field.id}
              value="no"
              checked={value === false || value === "no"}
              onChange={() => onChange(false)}
              className="h-4 w-4 accent-[var(--c-teal)]"
            />
            <span className="text-sm">No</span>
          </label>
        </div>
      )

    case "single_select":
      return (
        <Select value={value || ""} onValueChange={onChange}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder={field.placeholder || "Select..."} />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )

    case "multi_select":
      return (
        <div className="space-y-2 pt-1">
          {(field.options || []).map((opt) => {
            const selected = Array.isArray(value) ? value : []
            const isChecked = selected.includes(opt.value)
            return (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onChange([...selected, opt.value])
                    } else {
                      onChange(selected.filter((v: string) => v !== opt.value))
                    }
                  }}
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            )
          })}
        </div>
      )

    case "repeating_group":
      return <RepeatingGroup field={field} value={value} onChange={onChange} allValues={allValues} />

    case "computed":
      const computedValue = field.computeFormula ? evaluateFormula(field.computeFormula, allValues) : 0
      const isBoolean = typeof computedValue === 'boolean'
      const isCurrency = !isBoolean && !field.label?.toLowerCase().includes('timely')
      return (
        <div className="relative">
          {isCurrency && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-c-gray-300 font-mono">$</span>
          )}
          <Input
            id={field.id}
            value={isCurrency ? formatCurrency(computedValue) : String(computedValue)}
            readOnly
            className={`h-10 font-mono tabular-nums bg-c-gray-50 border-dashed cursor-default ${isCurrency ? 'pl-7 text-right' : 'text-left'}`}
          />
        </div>
      )

    case "file_upload":
      return <FileUploadField field={field} value={value} onChange={onChange} />

    default:
      return (
        <Input
          id={field.id}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="h-10"
        />
      )
  }
}

// ---------------------------------------------------------------------------
// RepeatingGroup
// ---------------------------------------------------------------------------

function RepeatingGroup({
  field,
  value,
  onChange,
  allValues,
}: {
  field: FieldDef
  value: any
  onChange: (value: any) => void
  allValues: Record<string, any>
}) {
  const rows: Record<string, any>[] = Array.isArray(value) ? value : []

  const addRow = () => {
    const newRow: Record<string, any> = {}
    ;(field.groupFields || []).forEach((gf) => {
      newRow[gf.id] = gf.defaultValue ?? ""
    })
    onChange([...rows, newRow])
  }

  const removeRow = (index: number) => {
    if (field.minGroups && rows.length <= field.minGroups) return
    onChange(rows.filter((_, i) => i !== index))
  }

  const canAdd = !field.maxGroups || rows.length < field.maxGroups

  const updateRow = (index: number, fieldId: string, val: any) => {
    const updated = rows.map((row, i) =>
      i === index ? { ...row, [fieldId]: val } : row
    )
    onChange(updated)
  }

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={index} className="rounded-lg border border-[var(--c-gray-100)] p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-c-gray-300">Item {index + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeRow(index)}
              className="h-6 w-6 p-0 text-c-gray-300 hover:text-c-danger"
              disabled={!!field.minGroups && rows.length <= field.minGroups}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(field.groupFields || []).map((gf) => (
              <FieldRenderer
                key={gf.id}
                field={gf}
                value={row[gf.id]}
                onChange={(val) => updateRow(index, gf.id, val)}
                allValues={{ ...allValues, ...row }}
              />
            ))}
          </div>
        </div>
      ))}
      {canAdd && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          className="text-xs"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add {field.label}
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FileUploadField
// ---------------------------------------------------------------------------

function FileUploadField({
  field,
  value,
  onChange,
}: {
  field: FieldDef
  value: any
  onChange: (value: any) => void
}) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const files: string[] = Array.isArray(value) ? value : value ? [value] : []

  const handleFiles = (fileList: FileList) => {
    const names = Array.from(fileList).map((f) => f.name)
    onChange([...files, ...names])
  }

  return (
    <div>
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-[var(--c-teal)] bg-c-info-soft"
            : "border-[var(--c-gray-100)] hover:border-[var(--c-gray-200)]"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
        }}
      >
        <Upload className="h-6 w-6 mx-auto mb-2 text-c-gray-300" />
        <p className="text-sm text-c-gray-300">
          Drop files here or <span className="text-[var(--c-teal)] font-medium">browse</span>
        </p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files)
          }}
        />
      </div>

      {files.length > 0 && (
        <div className="mt-2 space-y-1">
          {files.map((name, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-c-gray-700">
              <FileText className="h-3.5 w-3.5 text-c-gray-300" />
              <span className="truncate flex-1">{name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 text-c-gray-300 hover:text-c-danger"
                onClick={() => onChange(files.filter((_, fi) => fi !== i))}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
