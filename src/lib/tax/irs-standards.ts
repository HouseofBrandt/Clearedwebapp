/**
 * IRS Collection Financial Standards
 *
 * These values are used to determine allowable living expenses
 * when computing an Offer in Compromise (OIC) Reasonable Collection
 * Potential (RCP). Updated per IRS guidelines.
 *
 * Reference: IRM 5.8.5 (Financial Analysis)
 * Source: https://www.irs.gov/businesses/small-businesses-self-employed/collection-financial-standards
 */

// ---------------------------------------------------------------------------
// National Standards — Food, Clothing & Other Items
// ---------------------------------------------------------------------------

/** Monthly allowance for food, clothing, housekeeping, personal care, misc. */
export const NATIONAL_STANDARDS_FOOD_CLOTHING: Record<number, number> = {
  1: 785,
  2: 1437,
  3: 1663,
  4: 1920, // 4+ persons
}

/** Look up the national standard for food/clothing by household size. */
export function getNationalStandardFoodClothing(householdSize: number): number {
  if (householdSize <= 0) return 0
  if (householdSize >= 4) return NATIONAL_STANDARDS_FOOD_CLOTHING[4]
  return NATIONAL_STANDARDS_FOOD_CLOTHING[householdSize] ?? NATIONAL_STANDARDS_FOOD_CLOTHING[4]
}

// ---------------------------------------------------------------------------
// National Standards — Out-of-Pocket Healthcare
// ---------------------------------------------------------------------------

/** Monthly out-of-pocket healthcare allowance per person. */
export const HEALTHCARE_STANDARD = {
  under65: 75,
  over65: 153,
} as const

export function getHealthcareStandard(age65Plus: boolean): number {
  return age65Plus ? HEALTHCARE_STANDARD.over65 : HEALTHCARE_STANDARD.under65
}

/** Total healthcare allowance for a household. */
export function getHouseholdHealthcare(
  householdSize: number,
  membersOver65: number
): number {
  const under = Math.max(0, householdSize - membersOver65)
  return under * HEALTHCARE_STANDARD.under65 + membersOver65 * HEALTHCARE_STANDARD.over65
}

// ---------------------------------------------------------------------------
// Local Standards — Housing & Utilities
// ---------------------------------------------------------------------------

export type HousingTier = "low" | "medium" | "high"

/**
 * Simplified housing/utilities standard by cost-of-living tier.
 * Real IRS standards vary by county; these are representative tiers.
 *
 * Base amount is for 1 person; each additional person adds a percentage.
 */
const HOUSING_BASE: Record<HousingTier, number> = {
  low: 1767,
  medium: 2258,
  high: 3217,
}

/** Additional per-person factor (roughly 10% of base for each additional person). */
const HOUSING_PER_PERSON_FACTOR = 0.10

export function getHousingStandard(tier: HousingTier, householdSize: number): number {
  const base = HOUSING_BASE[tier]
  const additional = Math.max(0, householdSize - 1) * base * HOUSING_PER_PERSON_FACTOR
  return Math.round(base + additional)
}

export const HOUSING_TIERS: { value: HousingTier; label: string; description: string }[] = [
  { value: "low", label: "Low Cost", description: "Rural / low cost-of-living areas" },
  { value: "medium", label: "Medium Cost", description: "Average cost-of-living areas" },
  { value: "high", label: "High Cost", description: "Metro / high cost-of-living areas" },
]

// ---------------------------------------------------------------------------
// Local Standards — Transportation
// ---------------------------------------------------------------------------

export const TRANSPORTATION_STANDARD = {
  ownership1Car: 588,
  ownership2Cars: 1176,
  operatingPerCar: 231,
} as const

export function getTransportationStandard(numberOfCars: number): {
  ownership: number
  operating: number
  total: number
} {
  const cars = Math.min(numberOfCars, 2)
  const ownership = cars === 0 ? 0 : cars === 1
    ? TRANSPORTATION_STANDARD.ownership1Car
    : TRANSPORTATION_STANDARD.ownership2Cars
  const operating = cars * TRANSPORTATION_STANDARD.operatingPerCar
  return { ownership, operating, total: ownership + operating }
}

// ---------------------------------------------------------------------------
// Asset Valuation
// ---------------------------------------------------------------------------

/** IRS quick-sale value = FMV * 0.80 per IRM 5.8.5.4 */
export const QUICK_SALE_MULTIPLIER = 0.80

/** Alternative multiplier when challenging vehicle equity. */
export const CHALLENGED_VEHICLE_MULTIPLIER = 0.60

// ---------------------------------------------------------------------------
// Future Income Multipliers
// ---------------------------------------------------------------------------

/** Lump-sum offer: disposable income * 5 months (paid in 5 or fewer months). */
export const FUTURE_INCOME_LUMP_SUM_MONTHS = 12

/** Periodic payment offer: disposable income * 24 months. */
export const FUTURE_INCOME_PERIODIC_MONTHS = 24

// ---------------------------------------------------------------------------
// Summary helper — all standards for a given household
// ---------------------------------------------------------------------------

export interface HouseholdStandards {
  foodClothing: number
  healthcare: number
  housing: number
  transportationOwnership: number
  transportationOperating: number
  totalAllowable: number
}

export function getHouseholdStandards(params: {
  householdSize: number
  membersOver65: number
  housingTier: HousingTier
  numberOfCars: number
}): HouseholdStandards {
  const foodClothing = getNationalStandardFoodClothing(params.householdSize)
  const healthcare = getHouseholdHealthcare(params.householdSize, params.membersOver65)
  const housing = getHousingStandard(params.housingTier, params.householdSize)
  const transport = getTransportationStandard(params.numberOfCars)

  return {
    foodClothing,
    healthcare,
    housing,
    transportationOwnership: transport.ownership,
    transportationOperating: transport.operating,
    totalAllowable:
      foodClothing + healthcare + housing + transport.total,
  }
}
