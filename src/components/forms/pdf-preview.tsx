"use client"

import { useState, useEffect } from "react"
import type { FormSchema, SectionDef, FieldDef } from "@/lib/forms/types"
import { evaluateConditions, evaluateFormula } from "@/components/forms/field-renderer"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PDFPreviewProps {
  schema: FormSchema
  values: Record<string, any>
  activeSection: string
  activeSectionIndex: number
  onPageChange?: (page: number) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFieldValue(field: FieldDef, value: any): string {
  if (value === undefined || value === null || value === "") return "\u2014"
  if (field.type === "currency") {
    const num = typeof value === "string" ? parseFloat(value) : value
    if (isNaN(num)) return "\u2014"
    return num.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    })
  }
  if (field.type === "ssn") return "XXX-XX-" + String(value).slice(-4)
  if (field.type === "yes_no")
    return value === true ? "Yes" : value === false ? "No" : "\u2014"
  if (field.type === "date") {
    try {
      return new Date(value).toLocaleDateString("en-US")
    } catch {
      return String(value)
    }
  }
  if (field.type === "percentage") return `${value}%`
  if (field.type === "single_select") {
    const opt = field.options?.find((o) => o.value === value)
    return opt?.label || String(value)
  }
  return String(value)
}

const zoomBtnStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 4,
  border: "1px solid var(--c-gray-100)",
  background: "var(--c-white)",
  cursor: "pointer",
  fontSize: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--c-gray-500)",
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FormHeader({ schema, zoom }: { schema: FormSchema; zoom: number }) {
  return (
    <div
      style={{
        borderBottom: `${2 * zoom}px solid black`,
        paddingBottom: `${8 * zoom}px`,
        marginBottom: `${12 * zoom}px`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div
            style={{
              fontSize: `${8 * zoom}px`,
              color: "var(--c-gray-500)",
            }}
          >
            Department of the Treasury &mdash; Internal Revenue Service
          </div>
          <div
            style={{
              fontSize: `${14 * zoom}px`,
              fontWeight: 500,
              marginTop: `${2 * zoom}px`,
            }}
          >
            Form {schema.formNumber}
          </div>
          <div
            style={{
              fontSize: `${7 * zoom}px`,
              color: "var(--c-gray-500)",
            }}
          >
            (Rev. {schema.revisionDate})
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: `${10 * zoom}px`,
              fontWeight: 500,
              maxWidth: `${200 * zoom}px`,
            }}
          >
            {schema.formTitle}
          </div>
          {schema.ombNumber && (
            <div
              style={{
                fontSize: `${7 * zoom}px`,
                color: "var(--c-gray-500)",
                marginTop: `${2 * zoom}px`,
              }}
            >
              OMB No. {schema.ombNumber}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FormSectionPreview({
  section,
  values,
  zoom,
  isActive,
  allValues,
}: {
  section: SectionDef
  values: Record<string, any>
  zoom: number
  isActive?: boolean
  allValues: Record<string, any>
}) {
  return (
    <div>
      {/* Section header */}
      <div
        style={{
          fontSize: `${11 * zoom}px`,
          fontWeight: 500,
          padding: `${4 * zoom}px ${8 * zoom}px`,
          background: isActive
            ? "rgba(46, 134, 171, 0.08)"
            : "var(--c-gray-50)",
          border: isActive
            ? `${1 * zoom}px solid var(--c-teal)`
            : `${1 * zoom}px solid var(--c-gray-200)`,
          borderRadius: `${2 * zoom}px`,
          marginBottom: `${8 * zoom}px`,
        }}
      >
        Section {section.order}: {section.title}
      </div>

      {/* Fields rendered as form lines */}
      {section.fields
        .filter((f) => {
          // Hide fields whose conditionals say hide
          if (
            f.conditionals &&
            !evaluateConditions(f.conditionals, allValues)
          ) {
            return false
          }
          // Show computed fields only when they have a value
          if (f.type === "computed") {
            if (f.computeFormula) {
              const computed = evaluateFormula(f.computeFormula, allValues)
              return computed !== 0
            }
            return !!values[f.id]
          }
          return true
        })
        .map((field) => {
          // For computed fields, get the computed value
          let value = values[field.id]
          if (field.type === "computed" && field.computeFormula) {
            value = evaluateFormula(field.computeFormula, allValues)
          }

          const displayValue = formatFieldValue(field, value)
          const hasValue = displayValue && displayValue !== "\u2014"

          // Repeating group rendering
          if (field.type === "repeating_group") {
            const groupValues = Array.isArray(value) ? value : []
            return (
              <div key={field.id} style={{ marginBottom: `${6 * zoom}px` }}>
                <div
                  style={{
                    fontSize: `${8 * zoom}px`,
                    color: "var(--c-gray-500)",
                    marginBottom: `${2 * zoom}px`,
                  }}
                >
                  {field.irsReference && `${field.irsReference}: `}
                  {field.label}
                </div>
                {groupValues.length > 0 ? (
                  groupValues.map((entry: any, i: number) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: `${8 * zoom}px`,
                        padding: `${2 * zoom}px 0`,
                        borderBottom: `${0.5 * zoom}px solid var(--c-gray-100)`,
                        fontSize: `${9 * zoom}px`,
                      }}
                    >
                      {field.groupFields?.slice(0, 3).map((gf) => (
                        <span
                          key={gf.id}
                          style={{
                            color: entry[gf.id]
                              ? "var(--c-gray-900)"
                              : "var(--c-gray-300)",
                          }}
                        >
                          {entry[gf.id] || "________"}
                        </span>
                      ))}
                    </div>
                  ))
                ) : (
                  <div
                    style={{
                      fontSize: `${8 * zoom}px`,
                      color: "var(--c-gray-300)",
                      fontStyle: "italic",
                    }}
                  >
                    No entries
                  </div>
                )}
              </div>
            )
          }

          return (
            <div
              key={field.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: `${3 * zoom}px 0`,
                borderBottom: `${0.5 * zoom}px solid var(--c-gray-100)`,
              }}
            >
              <span
                style={{
                  fontSize: `${8 * zoom}px`,
                  color: "var(--c-gray-500)",
                  maxWidth: "60%",
                }}
              >
                {field.irsReference && (
                  <span
                    style={{
                      fontWeight: 500,
                      color: "var(--c-gray-700)",
                      marginRight: `${4 * zoom}px`,
                    }}
                  >
                    {field.irsReference}
                  </span>
                )}
                {field.label}
              </span>
              <span
                style={{
                  fontSize: `${9 * zoom}px`,
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  color: hasValue ? "var(--c-gray-900)" : "var(--c-gray-200)",
                  fontWeight: hasValue ? 500 : 400,
                  textAlign: "right",
                  minWidth: `${80 * zoom}px`,
                  borderBottom: hasValue
                    ? "none"
                    : `${1 * zoom}px solid var(--c-gray-200)`,
                  padding: `${1 * zoom}px ${4 * zoom}px`,
                }}
              >
                {displayValue}
              </span>
            </div>
          )
        })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PDFPreview({
  schema,
  values,
  activeSection,
  activeSectionIndex,
}: PDFPreviewProps) {
  const [currentPage, setCurrentPage] = useState(activeSectionIndex)
  const [zoomLevel, setZoomLevel] = useState(0.65)
  const [isExpanded, setIsExpanded] = useState(false)

  // Sync current page when active section changes
  useEffect(() => {
    setCurrentPage(activeSectionIndex)
  }, [activeSectionIndex])

  // Map sections to pages
  const pages = schema.sections.map((section, idx) => ({
    section,
    pageNumber: idx + 1,
    isActive: section.id === activeSection,
  }))

  const previewContent = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        borderLeft: isExpanded ? "none" : "1px solid var(--c-gray-100)",
        background: "var(--c-snow, #f9fafb)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--c-gray-100)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "var(--c-white, #fff)",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "var(--c-gray-500)",
          }}
        >
          Form {schema.formNumber} Preview
        </span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button
            onClick={() => setZoomLevel(Math.max(0.4, zoomLevel - 0.1))}
            style={zoomBtnStyle}
          >
            &minus;
          </button>
          <span
            style={{
              fontSize: 10,
              color: "var(--c-gray-300)",
              minWidth: 36,
              textAlign: "center",
            }}
          >
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            onClick={() => setZoomLevel(Math.min(1.2, zoomLevel + 0.1))}
            style={zoomBtnStyle}
          >
            +
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{ ...zoomBtnStyle, marginLeft: 8 }}
            title={isExpanded ? "Collapse preview" : "Expand preview"}
          >
            {isExpanded ? "\u2199" : "\u2197"}
          </button>
        </div>
      </div>

      {/* Page indicator */}
      <div
        style={{
          padding: "6px 12px",
          background: "var(--c-gray-50, #f3f4f6)",
          borderBottom: "1px solid var(--c-gray-100)",
          display: "flex",
          justifyContent: "center",
          gap: 4,
          alignItems: "center",
        }}
      >
        {pages.map((p, i) => (
          <button
            key={i}
            onClick={() => setCurrentPage(i)}
            style={{
              width: currentPage === i ? 20 : 8,
              height: 8,
              borderRadius: 4,
              border: "none",
              background: p.isActive
                ? "var(--c-teal)"
                : currentPage === i
                ? "var(--c-gray-500)"
                : "var(--c-gray-200)",
              cursor: "pointer",
              transition: "all 200ms ease",
            }}
            title={`Page ${i + 1}: ${p.section.title}`}
          />
        ))}
      </div>

      {/* PDF-like form rendering */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: 12,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: `${612 * zoomLevel}px`,
            minHeight: `${792 * zoomLevel}px`,
            background: "white",
            border: "1px solid var(--c-gray-200)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            padding: `${24 * zoomLevel}px`,
            fontSize: `${10 * zoomLevel}px`,
            fontFamily: "var(--font-mono)",
            lineHeight: 1.4,
            position: "relative",
          }}
        >
          {/* IRS Form Header */}
          <FormHeader schema={schema} zoom={zoomLevel} />

          {/* Render the current page's section */}
          <FormSectionPreview
            section={
              pages[currentPage]?.section || schema.sections[0]
            }
            values={values}
            zoom={zoomLevel}
            isActive={pages[currentPage]?.isActive}
            allValues={values}
          />
        </div>
      </div>

      {/* View Tax Form link */}
      <div
        style={{
          padding: "8px 12px",
          borderTop: "1px solid var(--c-gray-100)",
          textAlign: "center",
          background: "var(--c-white, #fff)",
        }}
      >
        <button
          onClick={() => setIsExpanded(true)}
          style={{
            fontSize: 11,
            color: "var(--c-teal)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          View Tax Form
        </button>
      </div>
    </div>
  )

  // Full-screen expanded mode
  if (isExpanded) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: "90vw",
            height: "90vh",
            background: "var(--c-snow, #f9fafb)",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }}
        >
          {previewContent}
        </div>
      </div>
    )
  }

  return previewContent
}
