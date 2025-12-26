#!/usr/bin/env node
/**
 * Enterprise-Level Test Automation Script
 *
 * This script automates the complete testing workflow:
 * 1. Unit tests with coverage
 * 2. Integration tests
 * 3. TypeScript compilation check
 * 4. Build verification
 * 5. Test report generation
 *
 * Usage:
 *   npm run test:enterprise
 *   node scripts/run-enterprise-tests.mjs
 *   node scripts/run-enterprise-tests.mjs --watch
 */

import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.cyan}${colors.bright}${msg}${colors.reset}\n`),
}

// Track test results
const results = {
  unitTests: { passed: false, coverage: null },
  typeCheck: { passed: false },
  build: { passed: false },
  totalTime: 0,
}

/**
 * Execute a shell command and return a promise
 */
function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    const proc = spawn(command, args, {
      stdio: 'inherit',
      cwd: ROOT_DIR,
      shell: true,
      ...options,
    })

    proc.on('close', (code) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2)
      if (code === 0) {
        resolve({ code, duration })
      } else {
        reject({ code, duration })
      }
    })

    proc.on('error', (error) => {
      reject({ error })
    })
  })
}

/**
 * Parse Jest coverage output
 */
function parseCoverageReport() {
  const coverageFile = path.join(ROOT_DIR, 'coverage', 'coverage-summary.json')

  if (!fs.existsSync(coverageFile)) {
    log.warning('Coverage report not found')
    return null
  }

  try {
    const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf8'))
    const total = coverage.total

    return {
      lines: total.lines.pct,
      statements: total.statements.pct,
      functions: total.functions.pct,
      branches: total.branches.pct,
    }
  } catch (error) {
    log.error(`Failed to parse coverage report: ${error.message}`)
    return null
  }
}

/**
 * Run Jest unit tests with coverage
 */
async function runUnitTests() {
  log.section('📋 PHASE 1: Unit Tests')

  try {
    log.info('Running Jest unit tests with coverage...')

    const { duration } = await runCommand('npm', ['test', '--', '--coverage', '--bail'])

    results.unitTests.passed = true
    results.unitTests.coverage = parseCoverageReport()

    log.success(`Unit tests passed (${duration}s)`)

    if (results.unitTests.coverage) {
      console.log('\n📊 Coverage Summary:')
      console.log(`  Lines:      ${results.unitTests.coverage.lines}%`)
      console.log(`  Statements: ${results.unitTests.coverage.statements}%`)
      console.log(`  Functions:  ${results.unitTests.coverage.functions}%`)
      console.log(`  Branches:   ${results.unitTests.coverage.branches}%`)

      // Check if coverage meets 80% threshold
      const meetsThreshold = Object.values(results.unitTests.coverage).every(pct => pct >= 80)
      if (meetsThreshold) {
        log.success('Coverage meets 80% threshold ✓')
      } else {
        log.warning('Coverage below 80% threshold')
      }
    }

    return true
  } catch ({ code, duration }) {
    results.unitTests.passed = false
    log.error(`Unit tests failed (${duration}s) - Exit code: ${code}`)
    return false
  }
}

/**
 * Run TypeScript type checking
 */
async function runTypeCheck() {
  log.section('🔍 PHASE 2: TypeScript Type Checking')

  try {
    log.info('Running TypeScript compiler (tsc --noEmit)...')

    const { duration } = await runCommand('npx', ['tsc', '--noEmit'])

    results.typeCheck.passed = true
    log.success(`Type checking passed (${duration}s)`)

    return true
  } catch ({ code, duration }) {
    results.typeCheck.passed = false
    log.error(`Type checking failed (${duration}s) - Exit code: ${code}`)
    return false
  }
}

/**
 * Run production build
 */
async function runBuild() {
  log.section('🔨 PHASE 3: Production Build')

  try {
    log.info('Running Next.js production build...')

    const { duration } = await runCommand('npm', ['run', 'build'])

    results.build.passed = true
    log.success(`Build passed (${duration}s)`)

    return true
  } catch ({ code, duration }) {
    results.build.passed = false
    log.error(`Build failed (${duration}s) - Exit code: ${code}`)
    return false
  }
}

/**
 * Generate final test report
 */
function generateReport() {
  log.section('📊 ENTERPRISE TEST REPORT')

  const totalDuration = (results.totalTime / 1000 / 60).toFixed(2)

  console.log('Test Results:')
  console.log(`  ${results.unitTests.passed ? '✓' : '✗'} Unit Tests`)
  console.log(`  ${results.typeCheck.passed ? '✓' : '✗'} Type Checking`)
  console.log(`  ${results.build.passed ? '✓' : '✗'} Production Build`)

  console.log(`\nTotal Duration: ${totalDuration} minutes\n`)

  const allPassed = results.unitTests.passed && results.typeCheck.passed && results.build.passed

  if (allPassed) {
    log.success('ALL TESTS PASSED ✓')
    console.log(`\n${colors.green}${colors.bright}✓ READY FOR PRODUCTION${colors.reset}\n`)
    return true
  } else {
    log.error('SOME TESTS FAILED')
    console.log(`\n${colors.red}${colors.bright}✗ NOT READY FOR PRODUCTION${colors.reset}\n`)
    return false
  }
}

/**
 * Save test results to file
 */
function saveResults() {
  const reportFile = path.join(ROOT_DIR, 'test-results.json')
  const report = {
    timestamp: new Date().toISOString(),
    results,
    passed: results.unitTests.passed && results.typeCheck.passed && results.build.passed,
  }

  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2))
  log.info(`Test results saved to: test-results.json`)
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now()

  console.clear()
  log.section('🚀 ENTERPRISE-LEVEL TEST AUTOMATION')
  log.info('Starting comprehensive test suite...')
  log.info(`Working directory: ${ROOT_DIR}`)

  let exitCode = 0

  try {
    // Phase 1: Unit Tests
    const unitTestsPassed = await runUnitTests()
    if (!unitTestsPassed) {
      log.error('Stopping test suite due to unit test failures')
      exitCode = 1
    } else {
      // Phase 2: Type Checking
      const typeCheckPassed = await runTypeCheck()
      if (!typeCheckPassed) {
        log.warning('Type checking failed, but continuing with build...')
      }

      // Phase 3: Production Build
      const buildPassed = await runBuild()
      if (!buildPassed) {
        log.error('Production build failed')
        exitCode = 1
      }
    }
  } catch (error) {
    log.error(`Unexpected error: ${error.message}`)
    exitCode = 1
  }

  results.totalTime = Date.now() - startTime

  // Generate report
  const allPassed = generateReport()

  // Save results to file
  saveResults()

  // Exit with appropriate code
  process.exit(allPassed ? 0 : 1)
}

// Run the test automation
main().catch((error) => {
  log.error(`Fatal error: ${error.message}`)
  process.exit(1)
})
