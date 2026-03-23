/**
 * Converts prior deliverable output into a human-readable format for context forwarding.
 * JSON outputs (working papers) are converted to plaintext tables so the model
 * can reference exact numbers without being confused by nested JSON.
 */

export function formatPriorOutput(output: string, format: string): string {
  if (format === "xlsx" || isJsonOutput(output)) {
    return convertJsonToReadableTables(output)
  }
  return output
}

function isJsonOutput(output: string): boolean {
  try {
    const parsed = JSON.parse(output)
    return parsed._type === "oic_working_papers_v1"
  } catch {
    return false
  }
}

function convertJsonToReadableTables(jsonOutput: string): string {
  try {
    const parsed = JSON.parse(jsonOutput)
    if (parsed._type === "oic_working_papers_v1" && parsed.merged) {
      return formatOicWorkingPapersAsText(parsed.merged, parsed.extracted)
    }
    return formatGenericJsonAsText(parsed)
  } catch {
    return jsonOutput
  }
}

function formatOicWorkingPapersAsText(merged: any, extracted: any): string {
  let text = "=== OIC WORKING PAPERS \u2014 FULL DATA ===\n\n"

  if (merged.tabs && Array.isArray(merged.tabs)) {
    for (const tab of merged.tabs) {
      text += `--- ${(tab.name || tab.label || "Tab").toUpperCase()} ---\n`
      if (tab.rows && Array.isArray(tab.rows)) {
        for (const row of tab.rows) {
          if (typeof row === "object" && row !== null) {
            for (const [key, val] of Object.entries(row)) {
              text += `  ${key}: ${val}\n`
            }
          } else {
            text += `  ${row}\n`
          }
        }
      } else if (typeof tab === "object" && tab !== null) {
        for (const [key, val] of Object.entries(tab)) {
          if (key === "name" || key === "label") continue
          text += `  ${key}: ${JSON.stringify(val)}\n`
        }
      }
      text += "\n"
    }
  } else if (typeof merged === "object" && merged !== null) {
    for (const [tabName, tabData] of Object.entries(merged)) {
      if (tabName === "validationIssues") continue
      text += `${tabName.toUpperCase()}:\n`
      if (Array.isArray(tabData)) {
        for (const row of tabData as any[]) {
          if (typeof row === "object" && row !== null) {
            for (const [key, val] of Object.entries(row)) {
              text += `  ${key}: ${val}\n`
            }
          } else {
            text += `  ${row}\n`
          }
        }
      } else if (typeof tabData === "object" && tabData !== null) {
        for (const [key, val] of Object.entries(tabData as Record<string, any>)) {
          text += `  ${key}: ${JSON.stringify(val)}\n`
        }
      }
      text += "\n"
    }
  }

  if (extracted) {
    text += "RAW EXTRACTED VALUES:\n"
    for (const [key, val] of Object.entries(extracted)) {
      text += `  ${key}: ${JSON.stringify(val)}\n`
    }
  }

  text += "=== END WORKING PAPERS DATA ===\n"
  return text
}

function formatGenericJsonAsText(data: any): string {
  return JSON.stringify(data, null, 2)
}
