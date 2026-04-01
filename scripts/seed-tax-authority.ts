/**
 * Seed script for Tax Authority Conveyor
 * Run with: npx tsx scripts/seed-tax-authority.ts
 */
import { PrismaClient } from '@prisma/client'
import { SOURCE_CONFIGS, PROHIBITED_DOMAINS } from '../src/lib/tax-authority/constants'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding Tax Authority Conveyor...')

  // Seed SourceRegistry
  for (const config of SOURCE_CONFIGS) {
    await prisma.sourceRegistry.upsert({
      where: { sourceId: config.sourceId },
      create: {
        sourceId: config.sourceId,
        name: config.name,
        endpoint: config.endpoint,
        altEndpoint: config.altEndpoint,
        format: config.format,
        cadence: config.cadence,
        rightsProfile: config.rightsProfile,
        defaultTier: config.defaultTier,
        parserKey: config.parserKey,
        rateLimitMs: config.rateLimitMs,
        enabled: true,
      },
      update: {
        name: config.name,
        endpoint: config.endpoint,
        altEndpoint: config.altEndpoint,
        format: config.format,
        cadence: config.cadence,
        rightsProfile: config.rightsProfile,
        defaultTier: config.defaultTier,
        parserKey: config.parserKey,
        rateLimitMs: config.rateLimitMs,
      },
    })
    console.log(`  Source: ${config.name} (${config.sourceId})`)
  }

  // Seed LicensePolicy for prohibited domains
  for (const domain of PROHIBITED_DOMAINS) {
    await prisma.licensePolicy.upsert({
      where: { sourceDomain: domain },
      create: {
        sourceDomain: domain,
        displayName: domain,
        rightsProfile: 'LICENSE_REQUIRED',
        notes: 'Proprietary tax content — automated ingestion prohibited',
      },
      update: {},
    })
    console.log(`  License policy: ${domain} (LICENSE_REQUIRED)`)
  }

  // Seed IssueCluster records
  const issueClusters = [
    { name: 'oic_doubt_collectibility', displayName: 'OIC — Doubt as to Collectibility', issueCategory: 'oic' },
    { name: 'oic_doubt_liability', displayName: 'OIC — Doubt as to Liability', issueCategory: 'oic' },
    { name: 'oic_effective_tax_admin', displayName: 'OIC — Effective Tax Administration', issueCategory: 'oic' },
    { name: 'penalty_abatement_rca', displayName: 'Penalty Abatement — Reasonable Cause', issueCategory: 'penalty_abatement' },
    { name: 'penalty_abatement_fta', displayName: 'Penalty Abatement — First Time Abate', issueCategory: 'penalty_abatement' },
    { name: 'collection_csed', displayName: 'Collection Statute Expiration Date', issueCategory: 'collection' },
    { name: 'collection_cnc', displayName: 'Currently Not Collectible', issueCategory: 'collection' },
    { name: 'cdp_hearing', displayName: 'CDP / CAP Hearing', issueCategory: 'procedure' },
    { name: 'innocent_spouse_6015b', displayName: 'Innocent Spouse — IRC § 6015(b)', issueCategory: 'innocent_spouse' },
    { name: 'innocent_spouse_6015c', displayName: 'Innocent Spouse — IRC § 6015(c)', issueCategory: 'innocent_spouse' },
    { name: 'innocent_spouse_6015f', displayName: 'Innocent Spouse — IRC § 6015(f)', issueCategory: 'innocent_spouse' },
    { name: 'payroll_tfrp', displayName: 'Trust Fund Recovery Penalty', issueCategory: 'payroll' },
    { name: 'installment_streamlined', displayName: 'Installment Agreement — Streamlined', issueCategory: 'installment' },
    { name: 'installment_ppia', displayName: 'Partial Pay Installment Agreement', issueCategory: 'installment' },
  ]

  for (const cluster of issueClusters) {
    await prisma.issueCluster.upsert({
      where: { name: cluster.name },
      create: cluster,
      update: { displayName: cluster.displayName, issueCategory: cluster.issueCategory },
    })
    console.log(`  Issue cluster: ${cluster.displayName}`)
  }

  // Seed BenchmarkQuestion records
  const benchmarks = [
    {
      question: 'What are the legal standards for an OIC based on doubt as to collectibility under IRC § 7122?',
      expectedCitations: ['IRC § 7122', 'Treas. Reg. § 301.7122-1', 'IRM 5.8.4'],
      expectedTier: 'A1' as const,
    },
    {
      question: 'What is the standard for reasonable cause penalty abatement under IRC § 6651?',
      expectedCitations: ['IRC § 6651', 'Treas. Reg. § 301.6651-1', 'IRM 20.1.1'],
      expectedTier: 'A1' as const,
    },
    {
      question: 'How does the CSED work under IRC § 6502 and what events toll the statute?',
      expectedCitations: ['IRC § 6502', 'IRM 5.1.19', 'IRC § 6331(k)'],
      expectedTier: 'A1' as const,
    },
    {
      question: 'What are the requirements for innocent spouse relief under IRC § 6015(b)?',
      expectedCitations: ['IRC § 6015(b)', 'Treas. Reg. § 1.6015-2', 'IRM 25.15'],
      expectedTier: 'A1' as const,
    },
    {
      question: 'What is the CDP hearing process and what issues can be raised?',
      expectedCitations: ['IRC § 6320', 'IRC § 6330', 'Treas. Reg. § 301.6330-1', 'IRM 5.1.9'],
      expectedTier: 'A1' as const,
    },
    {
      question: 'What is the first-time abatement administrative waiver and how does it work?',
      expectedCitations: ['IRM 20.1.1.3.6.1'],
      expectedTier: 'B1' as const,
    },
    {
      question: 'What are the rules for currently-not-collectible status and how does the IRS determine hardship?',
      expectedCitations: ['IRC § 6343', 'IRM 5.16', 'IRM 5.15.1'],
      expectedTier: 'A1' as const,
    },
    {
      question: 'How does the trust fund recovery penalty work under IRC § 6672?',
      expectedCitations: ['IRC § 6672', 'IRM 5.7.3'],
      expectedTier: 'A1' as const,
    },
  ]

  for (const bm of benchmarks) {
    const existing = await prisma.benchmarkQuestion.findFirst({
      where: { question: bm.question },
    })
    if (!existing) {
      await prisma.benchmarkQuestion.create({ data: bm })
      console.log(`  Benchmark: ${bm.question.substring(0, 60)}...`)
    }
  }

  console.log('\nSeed complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
