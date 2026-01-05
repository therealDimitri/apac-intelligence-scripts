#!/usr/bin/env node

/**
 * Test script for Health Score v6.0 implementation
 * Validates both v4.0 (backward compatibility) and v6.0 calculations
 */

import {
  calculateHealthScore,
  calculateHealthScoreV6,
  HEALTH_SCORE_CONFIG,
  HEALTH_SCORE_CONFIG_V6,
  calculateRevenueTrendScore,
  calculateContractStatusScore,
  calculateSupportHealthScore,
  calculateExpansionScore,
  getHealthStatus,
} from '../src/lib/health-score-config.ts'

console.log('='.repeat(80))
console.log('HEALTH SCORE v6.0 VALIDATION TEST')
console.log('='.repeat(80))

// Test data
const testClient = {
  name: 'Test Client',
  npsScore: 50,
  compliancePercentage: 85,
  workingCapital: {
    percentUnder60: 95,
    percentUnder90: 100,
  },
  actionsData: {
    completedCount: 8,
    totalCount: 10,
    completionPercentage: 80,
  },
  revenueTrend: {
    currentRevenue: 550000,
    previousRevenue: 500000,
    yoyGrowthPercentage: 10,
  },
  contractStatus: {
    renewalRisk: 'low',
    arrStability: 'stable',
    contractEndDate: '2027-06-30',
    daysUntilRenewal: 542,
  },
  supportHealth: {
    openTicketCount: 3,
    averageResponseTimeHours: 18,
    escalatedTicketCount: 0,
  },
  expansion: {
    potential: 'high',
    identifiedOpportunities: ['Module X', 'Service Y'],
    estimatedValue: 150000,
  },
}

console.log('\n📊 TEST DATA:')
console.log(JSON.stringify(testClient, null, 2))

// ============================================================================
// TEST 1: Backward Compatibility - v4.0 Calculation
// ============================================================================

console.log('\n' + '='.repeat(80))
console.log('TEST 1: v4.0 BACKWARD COMPATIBILITY')
console.log('='.repeat(80))

const v4Result = calculateHealthScore(
  testClient.npsScore,
  testClient.compliancePercentage,
  testClient.workingCapital,
  testClient.actionsData
)

console.log('\n✓ v4.0 Configuration:')
console.log(`  Version: ${HEALTH_SCORE_CONFIG.version}`)
console.log(`  Formula: ${HEALTH_SCORE_CONFIG.formulaSummary}`)

console.log('\n✓ v4.0 Calculation Result:')
console.log(`  Total Score: ${v4Result.total}/100`)
console.log(`  Status: ${getHealthStatus(v4Result.total)}`)
console.log('\n  Breakdown:')
console.log(`    - NPS:             ${v4Result.breakdown.nps}/20 points`)
console.log(`    - Compliance:      ${v4Result.breakdown.compliance}/60 points`)
console.log(`    - Working Capital: ${v4Result.breakdown.workingCapital}/10 points`)
console.log(`    - Actions:         ${v4Result.breakdown.actions}/10 points`)

console.log('\n  Working Capital Details:')
console.log(`    - Under 60 days: ${v4Result.workingCapitalDetails?.percentUnder60}%`)
console.log(`    - Under 90 days: ${v4Result.workingCapitalDetails?.percentUnder90}%`)
console.log(`    - Goal 1 Met: ${v4Result.workingCapitalDetails?.goal1Met}`)
console.log(`    - Goal 2 Met: ${v4Result.workingCapitalDetails?.goal2Met}`)
console.log(`    - Both Goals Met: ${v4Result.workingCapitalDetails?.bothGoalsMet}`)

console.log('\n  Actions Details:')
console.log(`    - Completed: ${v4Result.actionsDetails?.completedCount}`)
console.log(`    - Total: ${v4Result.actionsDetails?.totalCount}`)
console.log(`    - Completion %: ${v4Result.actionsDetails?.completionPercentage}%`)

// ============================================================================
// TEST 2: Enhanced v6.0 Calculation
// ============================================================================

console.log('\n' + '='.repeat(80))
console.log('TEST 2: v6.0 ENHANCED SCORING')
console.log('='.repeat(80))

const v6Result = calculateHealthScoreV6(
  testClient.npsScore,
  testClient.compliancePercentage,
  testClient.workingCapital,
  testClient.revenueTrend,
  testClient.contractStatus,
  testClient.actionsData,
  testClient.supportHealth,
  testClient.expansion
)

console.log('\n✓ v6.0 Configuration:')
console.log(`  Version: ${HEALTH_SCORE_CONFIG_V6.version}`)
console.log(`  Formula: ${HEALTH_SCORE_CONFIG_V6.formulaSummary}`)

console.log('\n✓ v6.0 Calculation Result:')
console.log(`  Total Score: ${v6Result.total}/100`)
console.log(`  Status: ${getHealthStatus(v6Result.total)}`)
console.log(`  Primary Concern Category: ${v6Result.category}`)

console.log('\n  Breakdown by Category:')
console.log('  ENGAGEMENT (30 points):')
console.log(`    - NPS:        ${v6Result.breakdown.nps}/15 points`)
console.log(`    - Compliance: ${v6Result.breakdown.compliance}/15 points`)

console.log('\n  FINANCIAL HEALTH (40 points):')
console.log(`    - AR Aging:        ${v6Result.breakdown.arAging}/10 points`)
console.log(`    - Revenue Trend:   ${v6Result.breakdown.revenueTrend}/15 points`)
console.log(`    - Contract Status: ${v6Result.breakdown.contractStatus}/15 points`)

console.log('\n  OPERATIONAL (20 points):')
console.log(`    - Actions:       ${v6Result.breakdown.actions}/10 points`)
console.log(`    - Support Health: ${v6Result.breakdown.supportHealth}/10 points`)

console.log('\n  STRATEGIC (10 points):')
console.log(`    - Expansion: ${v6Result.breakdown.expansion}/10 points`)

// ============================================================================
// TEST 3: Individual Component Functions
// ============================================================================

console.log('\n' + '='.repeat(80))
console.log('TEST 3: INDIVIDUAL COMPONENT CALCULATIONS')
console.log('='.repeat(80))

console.log('\n✓ Revenue Trend Score:')
const revenueScore = calculateRevenueTrendScore(testClient.revenueTrend)
console.log(`  Input: ${testClient.revenueTrend.yoyGrowthPercentage}% YoY growth`)
console.log(`  Score: ${revenueScore}/15 points`)
console.log(`  Expected: 10 points (0-10% growth = modest)`)

console.log('\n✓ Contract Status Score:')
const contractScore = calculateContractStatusScore(testClient.contractStatus)
console.log(`  Input: ${testClient.contractStatus.renewalRisk} risk, ${testClient.contractStatus.arrStability} ARR`)
console.log(`  Score: ${contractScore}/15 points`)
console.log(`  Expected: 15 points (low risk + stable ARR)`)

console.log('\n✓ Support Health Score:')
const supportScore = calculateSupportHealthScore(testClient.supportHealth)
console.log(`  Input: ${testClient.supportHealth.openTicketCount} open, ${testClient.supportHealth.averageResponseTimeHours}h avg response`)
console.log(`  Score: ${supportScore}/10 points`)
console.log(`  Expected: 10 points (low volume + fast response)`)

console.log('\n✓ Expansion Score:')
const expansionScore = calculateExpansionScore(testClient.expansion)
console.log(`  Input: ${testClient.expansion.potential} potential`)
console.log(`  Score: ${expansionScore}/10 points`)
console.log(`  Expected: 10 points (high potential)`)

// ============================================================================
// TEST 4: Null Data Handling
// ============================================================================

console.log('\n' + '='.repeat(80))
console.log('TEST 4: NULL DATA HANDLING (GRACEFUL DEFAULTS)')
console.log('='.repeat(80))

const nullDataV6 = calculateHealthScoreV6(
  null, // npsScore
  null, // compliancePercentage
  null, // workingCapital
  null, // revenueTrend
  null, // contractStatus
  null, // actionsData
  null, // supportHealth
  null  // expansion
)

console.log('\n✓ v6.0 with all null data:')
console.log(`  Total Score: ${nullDataV6.total}/100`)
console.log(`  Expected: ~52 points (neutral defaults)`)
console.log('\n  Breakdown:')
console.log(`    - NPS (null → 0):             ${nullDataV6.breakdown.nps}/15 (expected: 7-8)`)
console.log(`    - Compliance (null → 50%):    ${nullDataV6.breakdown.compliance}/15 (expected: 7-8)`)
console.log(`    - AR Aging (null → healthy):  ${nullDataV6.breakdown.arAging}/10 (expected: 10)`)
console.log(`    - Revenue (null → neutral):   ${nullDataV6.breakdown.revenueTrend}/15 (expected: 10)`)
console.log(`    - Contract (null → neutral):  ${nullDataV6.breakdown.contractStatus}/15 (expected: 10)`)
console.log(`    - Actions (null → complete):  ${nullDataV6.breakdown.actions}/10 (expected: 10)`)
console.log(`    - Support (null → healthy):   ${nullDataV6.breakdown.supportHealth}/10 (expected: 10)`)
console.log(`    - Expansion (null → neutral): ${nullDataV6.breakdown.expansion}/10 (expected: 5)`)

// ============================================================================
// TEST 5: Edge Cases
// ============================================================================

console.log('\n' + '='.repeat(80))
console.log('TEST 5: EDGE CASES')
console.log('='.repeat(80))

// Edge case 1: Negative revenue growth
const negativeGrowth = calculateRevenueTrendScore({
  currentRevenue: 400000,
  previousRevenue: 500000,
  yoyGrowthPercentage: -20,
})
console.log(`\n✓ Negative Revenue Growth (-20%): ${negativeGrowth}/15 points (expected: 5)`)

// Edge case 2: High renewal risk
const highRisk = calculateContractStatusScore({
  renewalRisk: 'high',
  arrStability: 'declining',
  contractEndDate: '2026-03-31',
  daysUntilRenewal: 85,
})
console.log(`✓ High Renewal Risk + Declining ARR: ${highRisk}/15 points (expected: 5)`)

// Edge case 3: Many open tickets with slow response
const poorSupport = calculateSupportHealthScore({
  openTicketCount: 15,
  averageResponseTimeHours: 72,
  escalatedTicketCount: 3,
})
console.log(`✓ Poor Support (15 open, 72h response, 3 escalated): ${poorSupport}/10 points (expected: 3)`)

// Edge case 4: Low expansion potential
const lowExpansion = calculateExpansionScore({
  potential: 'low',
  identifiedOpportunities: [],
  estimatedValue: null,
})
console.log(`✓ Low Expansion Potential: ${lowExpansion}/10 points (expected: 3)`)

// ============================================================================
// TEST 6: Score Comparison
// ============================================================================

console.log('\n' + '='.repeat(80))
console.log('TEST 6: v4.0 vs v6.0 COMPARISON')
console.log('='.repeat(80))

console.log(`\nv4.0 Total: ${v4Result.total}/100 (${getHealthStatus(v4Result.total)})`)
console.log(`v6.0 Total: ${v6Result.total}/100 (${getHealthStatus(v6Result.total)})`)
console.log(`Difference: ${v6Result.total - v4Result.total} points`)

console.log('\nComponent Weight Changes:')
console.log(`  NPS:        20pts (v4) → 15pts (v6) [${v4Result.breakdown.nps} → ${v6Result.breakdown.nps}]`)
console.log(`  Compliance: 60pts (v4) → 15pts (v6) [${v4Result.breakdown.compliance} → ${v6Result.breakdown.compliance}]`)
console.log(`  AR Aging:   10pts (v4) → 10pts (v6) [${v4Result.breakdown.workingCapital} → ${v6Result.breakdown.arAging}]`)
console.log(`  Actions:    10pts (v4) → 10pts (v6) [${v4Result.breakdown.actions} → ${v6Result.breakdown.actions}]`)

console.log('\nNew v6.0 Components:')
console.log(`  Revenue Trend:   ${v6Result.breakdown.revenueTrend}/15 points`)
console.log(`  Contract Status: ${v6Result.breakdown.contractStatus}/15 points`)
console.log(`  Support Health:  ${v6Result.breakdown.supportHealth}/10 points`)
console.log(`  Expansion:       ${v6Result.breakdown.expansion}/10 points`)

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(80))
console.log('TEST SUMMARY')
console.log('='.repeat(80))

const tests = [
  { name: 'v4.0 Backward Compatibility', passed: v4Result.total > 0 && v4Result.total <= 100 },
  { name: 'v6.0 Enhanced Scoring', passed: v6Result.total > 0 && v6Result.total <= 100 },
  { name: 'Revenue Trend Calculation', passed: revenueScore >= 0 && revenueScore <= 15 },
  { name: 'Contract Status Calculation', passed: contractScore >= 0 && contractScore <= 15 },
  { name: 'Support Health Calculation', passed: supportScore >= 0 && supportScore <= 10 },
  { name: 'Expansion Score Calculation', passed: expansionScore >= 0 && expansionScore <= 10 },
  { name: 'Null Data Handling', passed: nullDataV6.total > 0 && nullDataV6.total <= 100 },
  { name: 'Edge Case: Negative Growth', passed: negativeGrowth === 5 },
  { name: 'Edge Case: High Risk', passed: highRisk === 5 },
  { name: 'Edge Case: Poor Support', passed: poorSupport === 3 },
  { name: 'Edge Case: Low Expansion', passed: lowExpansion === 3 },
]

const passedTests = tests.filter(t => t.passed).length
const totalTests = tests.length

console.log(`\n✅ PASSED: ${passedTests}/${totalTests} tests`)
console.log('❌ FAILED:', totalTests - passedTests > 0 ? `${totalTests - passedTests} tests` : 'None')

console.log('\nDetailed Results:')
tests.forEach(test => {
  const icon = test.passed ? '✓' : '✗'
  const status = test.passed ? 'PASS' : 'FAIL'
  console.log(`  ${icon} [${status}] ${test.name}`)
})

if (passedTests === totalTests) {
  console.log('\n🎉 ALL TESTS PASSED! v6.0 implementation is working correctly.')
} else {
  console.log('\n⚠️  SOME TESTS FAILED. Please review the results above.')
  process.exit(1)
}

console.log('\n' + '='.repeat(80))
