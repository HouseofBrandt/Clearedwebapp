import { runExtractor } from "./_shared"

export async function extractW2(text: string) {
  return runExtractor({
    documentText: text,
    documentLabel: "Form W-2 (Wage and Tax Statement)",
    schemaDescription: `{
  tax_year: number,
  employer_name: string | null,
  employer_ein: string | null,                 // formatted NN-NNNNNNN
  employer_address: string | null,
  employee_name: string | null,
  employee_ssn: string | null,
  wages_tips_compensation: number | null,      // Box 1
  federal_withholding: number | null,          // Box 2
  social_security_wages: number | null,        // Box 3
  social_security_withheld: number | null,     // Box 4
  medicare_wages: number | null,               // Box 5
  medicare_withheld: number | null,            // Box 6
  state_wages: number | null,                  // Box 16
  state_withholding: number | null,            // Box 17
  state: string | null,                        // Box 15
  _confidence: number
}`,
    exampleJson: {
      tax_year: 2023,
      employer_name: "Acme Corp",
      employer_ein: "12-3456789",
      employer_address: "500 Industry Way, Portland, OR 97201",
      employee_name: "Jane Doe",
      employee_ssn: "123-45-6789",
      wages_tips_compensation: 75000,
      federal_withholding: 9000,
      social_security_wages: 75000,
      social_security_withheld: 4650,
      medicare_wages: 75000,
      medicare_withheld: 1087.5,
      state_wages: 75000,
      state_withholding: 5625,
      state: "OR",
      _confidence: 0.95,
    },
  })
}
