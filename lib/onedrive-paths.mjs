/**
 * Central OneDrive Path Resolver
 *
 * Auto-detects the OneDrive base path by scanning ~/Library/CloudStorage/
 * for any folder matching "OneDrive-Altera*". All SharePoint library paths
 * are defined here — scripts import from this single module.
 *
 * Safe to import during Netlify builds (returns null when OneDrive is absent).
 */

import { existsSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

function detectOneDriveBase() {
  const cloudStorage = join(homedir(), 'Library', 'CloudStorage')
  if (!existsSync(cloudStorage)) return null

  const match = readdirSync(cloudStorage).find((d) =>
    d.startsWith('OneDrive-Altera')
  )
  return match ? join(cloudStorage, match) : null
}

/** Detected OneDrive root — null when unavailable (e.g. CI) */
export const ONEDRIVE_BASE = detectOneDriveBase()

// ---------------------------------------------------------------------------
// SharePoint library bases
// ---------------------------------------------------------------------------

export const BURC_BASE = ONEDRIVE_BASE
  ? `${ONEDRIVE_BASE}/APAC Leadership Team - General/Performance/Financials/BURC`
  : null

export const CLIENT_SUCCESS = ONEDRIVE_BASE
  ? `${ONEDRIVE_BASE}/APAC Clients - Client Success`
  : null

export const DOCUMENTS = ONEDRIVE_BASE
  ? `${ONEDRIVE_BASE}/Documents`
  : null

export const MARKETING = ONEDRIVE_BASE
  ? `${ONEDRIVE_BASE}/Marketing - Marketing Collateral`
  : null

export const BRAND_TEMPLATES = ONEDRIVE_BASE
  ? `${ONEDRIVE_BASE}/Marketing - Altera Templates & Tools`
  : null

// ---------------------------------------------------------------------------
// Fiscal year config — override with --year CLI arg or FISCAL_YEAR env var
// ---------------------------------------------------------------------------

function detectFiscalYear() {
  const yearArg = process.argv.find((a) => a.startsWith('--year='))
  if (yearArg) return parseInt(yearArg.split('=')[1], 10)

  const yearIdx = process.argv.indexOf('--year')
  if (yearIdx !== -1 && process.argv[yearIdx + 1])
    return parseInt(process.argv[yearIdx + 1], 10)

  if (process.env.FISCAL_YEAR) return parseInt(process.env.FISCAL_YEAR, 10)

  return new Date().getFullYear()
}

/** Current fiscal year — defaults to calendar year, override with --year or FISCAL_YEAR env */
export const FISCAL_YEAR = detectFiscalYear()

/** Previous fiscal year (for comparison sheets) */
export const PREV_FISCAL_YEAR = FISCAL_YEAR - 1

// ---------------------------------------------------------------------------
// Commonly-used file paths
// ---------------------------------------------------------------------------

export const BURC_MASTER_FILE = BURC_BASE
  ? `${BURC_BASE}/${FISCAL_YEAR}/${FISCAL_YEAR} APAC Performance.xlsx`
  : null

/** Dynamic activity register path for current fiscal year */
export const ACTIVITY_REGISTER_CURRENT = CLIENT_SUCCESS
  ? `${CLIENT_SUCCESS}/Client Segmentation/${FISCAL_YEAR}/APAC Client Segmentation Activity Register ${FISCAL_YEAR}.xlsx`
  : null

/** Dynamic activity register path for previous fiscal year */
export const ACTIVITY_REGISTER_PREVIOUS = CLIENT_SUCCESS
  ? `${CLIENT_SUCCESS}/Client Segmentation/APAC Client Segmentation Activity Register ${PREV_FISCAL_YEAR}.xlsx`
  : null

/** @deprecated Use ACTIVITY_REGISTER_CURRENT instead */
export const ACTIVITY_REGISTER_2026 = ACTIVITY_REGISTER_CURRENT

/** @deprecated Use ACTIVITY_REGISTER_PREVIOUS instead */
export const ACTIVITY_REGISTER_2025 = ACTIVITY_REGISTER_PREVIOUS

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a path to a year-specific BURC file.
 *   burcFile(2026, '2026 APAC Performance.xlsx')
 *   burcFile(2025, '2025 APAC Performance.xlsx')
 *   burcFile(2026, 'Budget Planning/2026 APAC Performance.xlsx')
 */
export function burcFile(year, filename) {
  if (!BURC_BASE) throw new Error('OneDrive not available — cannot resolve BURC path')
  return `${BURC_BASE}/${year}/${filename}`
}

/**
 * Fail-fast guard — call at the top of any script that needs OneDrive.
 * Exits with a clear message instead of a cryptic ENOENT later.
 */
export function requireOneDrive() {
  if (!ONEDRIVE_BASE) {
    console.error(
      '\n✗ OneDrive folder not found.\n' +
        '  Expected ~/Library/CloudStorage/OneDrive-Altera* to exist.\n' +
        '  Is OneDrive signed in and syncing?\n'
    )
    process.exit(1)
  }
}

/**
 * Assert a file exists before processing. Provides a contextual error message.
 *   assertFileExists(BURC_MASTER_FILE, 'BURC master file')
 */
export function assertFileExists(filePath, context) {
  if (!existsSync(filePath)) {
    console.error(
      `\n✗ File not found: ${context || 'required file'}\n  Path: ${filePath}\n`
    )
    process.exit(1)
  }
}
