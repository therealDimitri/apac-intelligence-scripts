/**
 * Excel Cell Utilities
 *
 * Validation and lookup helpers for XLSX cell access. Prevents silent
 * failures when Excel sheet structure changes and cell references break.
 *
 * KEY PATTERN: Use findRow() for label-based lookup instead of hardcoded
 * cell references. When rows are inserted/deleted, labels stay correct
 * while absolute cell refs (U36, U60) silently break.
 *
 * Usage:
 *   import { findRow, getCellValue } from './lib/excel-utils.mjs'
 *
 *   // Label-based lookup (preferred — survives row insertions)
 *   const row = findRow(sheet, 'A', /Total Gross Revenue/i, 'APAC BURC')
 *   const forecast = getCellValue(sheet, `U${row}`)
 *   const target = getCellValue(sheet, `W${row}`)
 *
 *   // Direct cell access (for known-stable cells)
 *   const val = requireCell(sheet, 'P14', 'FY2025 Total')
 */

import XLSX from 'xlsx'

/**
 * Find a row number by searching a column for a label matching a pattern.
 * Survives row insertions/deletions — labels are more stable than row numbers.
 *
 * @param {object} sheet - XLSX worksheet object
 * @param {string} column - Column letter to search (e.g. 'A')
 * @param {RegExp|string} pattern - Regex or string to match against cell values
 * @param {string} [sheetName] - Sheet name for error messages
 * @returns {number} The row number (1-indexed)
 * @throws {Error} If no matching row is found
 */
export function findRow(sheet, column, pattern, sheetName) {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1')
  const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i')

  for (let r = range.s.r; r <= range.e.r; r++) {
    const cell = sheet[`${column}${r + 1}`]
    if (cell && regex.test(String(cell.v))) {
      return r + 1
    }
  }

  throw new Error(
    `Row label not found: ${pattern}` +
      (sheetName ? ` in "${sheetName}" sheet` : '') +
      `. Sheet structure may have changed.`
  )
}

/**
 * Find multiple rows by label in a single pass. More efficient than
 * calling findRow() repeatedly for the same sheet.
 *
 * @param {object} sheet - XLSX worksheet object
 * @param {string} column - Column letter to search (e.g. 'A')
 * @param {Array<{key: string, pattern: RegExp|string}>} labels - Labels to find
 * @param {string} [sheetName] - Sheet name for error messages
 * @returns {Object} Map of key → row number
 * @throws {Error} Lists all unfound labels
 */
export function findRows(sheet, column, labels, sheetName) {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1')
  const result = {}
  const remaining = labels.map((l) => ({
    ...l,
    regex: l.pattern instanceof RegExp ? l.pattern : new RegExp(l.pattern, 'i'),
  }))

  for (let r = range.s.r; r <= range.e.r; r++) {
    const cell = sheet[`${column}${r + 1}`]
    if (!cell) continue
    const val = String(cell.v)

    for (let i = remaining.length - 1; i >= 0; i--) {
      if (remaining[i].regex.test(val)) {
        result[remaining[i].key] = r + 1
        remaining.splice(i, 1)
      }
    }
    if (remaining.length === 0) break
  }

  if (remaining.length > 0) {
    const missing = remaining.map((l) => `  - ${l.key}: ${l.pattern}`).join('\n')
    throw new Error(
      `\n❌ ${remaining.length} row label(s) not found` +
        (sheetName ? ` in "${sheetName}" sheet` : '') +
        `:\n${missing}\n\nSheet structure may have changed.\n`
    )
  }

  return result
}

/**
 * Read a cell value, throwing if the cell is missing or empty.
 * @param {object} sheet - XLSX worksheet object
 * @param {string} ref - Cell reference (e.g. 'U36')
 * @param {string} context - Human-readable description for error messages
 * @returns {*} The cell value (.v property)
 */
export function requireCell(sheet, ref, context) {
  const cell = sheet[ref]
  if (!cell || cell.v === undefined || cell.v === null) {
    throw new Error(
      `Cell ${ref} is missing or empty` +
        (context ? ` (${context})` : '') +
        `. Sheet structure may have changed — verify cell references.`
    )
  }
  return cell.v
}

/**
 * Read a cell value, returning a fallback if the cell is missing.
 * Use for optional cells where absence is acceptable.
 * @param {object} sheet - XLSX worksheet object
 * @param {string} ref - Cell reference (e.g. 'W36')
 * @param {*} [fallback=null] - Value to return if cell is missing
 * @returns {*} The cell value or fallback
 */
export function getCellValue(sheet, ref, fallback = null) {
  const cell = sheet[ref]
  if (!cell || cell.v === undefined || cell.v === null) return fallback
  return cell.v
}

/**
 * Validate that all critical cells exist in a sheet before processing.
 * Throws a single error listing ALL missing cells (not just the first).
 *
 * @param {object} sheet - XLSX worksheet object
 * @param {string} sheetName - Sheet name for error messages
 * @param {Array<{ref: string, label: string}>} refs - Cells to validate
 * @throws {Error} Lists all missing cells if any are absent
 */
export function validateCellRefs(sheet, sheetName, refs) {
  const missing = refs.filter(({ ref }) => {
    const cell = sheet[ref]
    return !cell || cell.v === undefined || cell.v === null
  })

  if (missing.length > 0) {
    const details = missing
      .map(({ ref, label }) => `  - ${ref}: ${label}`)
      .join('\n')
    throw new Error(
      `\n❌ ${missing.length} missing cell(s) in "${sheetName}" sheet:\n${details}\n\n` +
        `The Excel sheet structure may have changed.\n` +
        `Check docs/burc-cell-mapping.md for expected layout.\n`
    )
  }
}
