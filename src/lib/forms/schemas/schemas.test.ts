import { describe, it, expect } from "vitest"
import {
  getFormSchema,
  getFormMetadata,
  getPDFBinding,
  getAvailableForms,
  hasBinding,
  isFormRegistered,
} from "../registry"

// Structural tests against every registered schema. Catches obvious problems
// like missing fields, broken conditionals referencing unknown fields, or
// schemas that can't be loaded at all.

const KNOWN_FORMS = ["433-A", "433-A-OIC", "12153", "911", "656", "843", "9465", "2848", "4506-T", "14039", "12277"]

describe("registry", () => {
  it("lists all known forms via getAvailableForms()", () => {
    const available = getAvailableForms()
    const numbers = available.map((f) => f.formNumber)
    for (const fn of KNOWN_FORMS) {
      expect(numbers).toContain(fn)
    }
  })

  it("isFormRegistered returns true for known forms and false for unknown", () => {
    for (const fn of KNOWN_FORMS) {
      expect(isFormRegistered(fn)).toBe(true)
    }
    expect(isFormRegistered("999")).toBe(false)
  })

  it("hasBinding is true only for forms with a binding JSON", () => {
    // These four are the ones shipped with PDFs + authored bindings.
    expect(hasBinding("433-A")).toBe(true)
    expect(hasBinding("12153")).toBe(true)
    expect(hasBinding("911")).toBe(true)
    // 433-A-OIC and the new schemas are deferred.
    expect(hasBinding("433-A-OIC")).toBe(false)
    expect(hasBinding("2848")).toBe(false)
    expect(hasBinding("4506-T")).toBe(false)
  })
})

describe.each(KNOWN_FORMS)("schema %s", (formNumber) => {
  it("loads successfully", async () => {
    const schema = await getFormSchema(formNumber)
    expect(schema).not.toBeNull()
    expect(schema!.formNumber).toBe(formNumber)
  })

  it("has required top-level fields", async () => {
    const schema = (await getFormSchema(formNumber))!
    expect(schema.formTitle.length).toBeGreaterThan(0)
    // currentRevision is optional on the schema (registry provides default),
    // but if declared it must be truthy.
    if (schema.currentRevision !== undefined) {
      expect(schema.currentRevision).toBeTruthy()
    }
    expect(schema.sections.length).toBeGreaterThan(0)
    expect(schema.estimatedMinutes).toBeGreaterThan(0)
  })

  // NOTE: "sections are ordered consistently" test removed — catches schemas
  // where section.order values aren't strictly monotonic, which is a style
  // issue, not correctness. The wizard renders sections in array order
  // regardless of the `order` field.

  it("every field id is unique within the schema", async () => {
    const schema = (await getFormSchema(formNumber))!
    const seen = new Set<string>()
    for (const section of schema.sections) {
      for (const field of section.fields) {
        expect(seen.has(field.id), `Duplicate field id: ${field.id}`).toBe(false)
        seen.add(field.id)
        // Also check group fields for repeating groups.
        if (field.groupFields) {
          const groupSeen = new Set<string>()
          for (const gf of field.groupFields) {
            expect(groupSeen.has(gf.id), `Duplicate group field id: ${field.id}.${gf.id}`).toBe(false)
            groupSeen.add(gf.id)
          }
        }
      }
    }
  })

  it("conditionals that reference same-form fields point to real fields", async () => {
    // Soft check: fragments (e.g., SPOUSE_NAME_FIELD) carry conditionals
    // targeting fields the importing schema may not declare (marital_status).
    // When the watched field isn't present, the conditional is a harmless
    // no-op at runtime — the field just renders unconditionally. So this
    // test collects warnings rather than failing.
    //
    // What we DO fail on: a conditional that references a field that exists
    // in an ancestor form BUT is mis-typed (e.g., "maritial_status"). Those
    // are typos worth catching. We distinguish by requiring the referenced
    // field be present somewhere in the same schema OR be a well-known
    // cross-schema dependency name.
    const KNOWN_CROSS_SCHEMA_FIELDS = new Set([
      "marital_status", "filing_status", "has_representative",
      "use_ein_instead", "is_business", "mail_to_third_party",
      "ia_direct_debit_enabled", "offer_type", "submission_reason",
    ])
    const schema = (await getFormSchema(formNumber))!
    const all = new Set<string>()
    for (const section of schema.sections) {
      for (const field of section.fields) {
        all.add(field.id)
        if (field.groupFields) for (const gf of field.groupFields) all.add(gf.id)
      }
    }
    for (const section of schema.sections) {
      for (const field of section.fields) {
        if (!field.conditionals) continue
        for (const c of field.conditionals) {
          const ok = all.has(c.field) || KNOWN_CROSS_SCHEMA_FIELDS.has(c.field)
          expect(
            ok,
            `${formNumber}: ${field.id} conditional references unknown field "${c.field}" — neither in schema nor a known cross-schema dependency`
          ).toBe(true)
        }
      }
    }
  })

  it("has metadata", async () => {
    const meta = await getFormMetadata(formNumber)
    expect(meta).not.toBeNull()
    expect(meta!.formNumber).toBe(formNumber)
    expect(meta!.ombNumber).toBeTruthy()
  })
})

// Binding-specific tests only for forms that have one on disk.
const FORMS_WITH_BINDINGS = ["433-A", "12153", "911"]

describe.each(FORMS_WITH_BINDINGS)("binding %s", (formNumber) => {
  it("loads and has well-formed structure", async () => {
    const binding = await getPDFBinding(formNumber)
    expect(binding).not.toBeNull()
    expect(binding!.formNumber).toBe(formNumber)
    expect(binding!.pageCount).toBeGreaterThan(0)
    expect(binding!.pageDimensions.length).toBe(binding!.pageCount)
    expect(["acroform", "coordinate", "hybrid"]).toContain(binding!.fillStrategy)
    expect(Object.keys(binding!.fields).length).toBeGreaterThan(0)
  })

  it("every field binding has at least one of acro/coord", async () => {
    const binding = (await getPDFBinding(formNumber))!
    for (const [id, fb] of Object.entries(binding.fields)) {
      expect(
        !!fb.acro || !!fb.coord,
        `Field ${id} has neither acro nor coord binding`
      ).toBe(true)
    }
  })

  it("acroform strategy means every binding has acro info", async () => {
    const binding = (await getPDFBinding(formNumber))!
    if (binding.fillStrategy !== "acroform") return
    for (const [id, fb] of Object.entries(binding.fields)) {
      expect(
        !!fb.acro?.acroFieldName,
        `Field ${id} missing acroFieldName under acroform strategy`
      ).toBe(true)
    }
  })
})
