/**
 * Batch Job: Generate Predictive Health Scores
 *
 * This script calculates and stores predictive scores for all clients
 * in the `predictive_health_scores` table.
 *
 * Usage:
 *   node scripts/generate-predictive-scores.mjs
 *
 * Options:
 *   --client <name>   Generate scores for a specific client only
 *   --dry-run         Calculate but don't save to database
 *   --verbose         Show detailed progress
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load from .env.local
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Parse command line arguments
const args = process.argv.slice(2)
const clientFilter = args.includes('--client') ? args[args.indexOf('--client') + 1] : null
const dryRun = args.includes('--dry-run')
const verbose = args.includes('--verbose')

// =============================================
// Configuration
// =============================================

const MODEL_VERSION = 'v1.0.0'

// Weight configurations for risk calculations
const CHURN_WEIGHTS = {
  healthTrajectory: 0.25,
  npsTrend: 0.20,
  meetingFrequency: 0.15,
  actionCompletion: 0.15,
  agingBalance: 0.15,
  sentimentTrend: 0.10,
}

const EXPANSION_WEIGHTS = {
  healthImprovement: 0.25,
  promoterNps: 0.25,
  positiveSentiment: 0.20,
  engagementIncrease: 0.15,
  complianceRate: 0.15,
}

// =============================================
// Statistical Helper Functions
// =============================================

function linearRegression(points) {
  if (points.length < 2) {
    return { slope: 0, intercept: points[0]?.y ?? 0, r2: 0 }
  }

  const n = points.length
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0

  for (const point of points) {
    sumX += point.x
    sumY += point.y
    sumXY += point.x * point.y
    sumX2 += point.x * point.x
  }

  const denominator = n * sumX2 - sumX * sumX
  if (denominator === 0) {
    return { slope: 0, intercept: sumY / n, r2: 0 }
  }

  const slope = (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n

  // Calculate R-squared
  const yMean = sumY / n
  let ssTotal = 0, ssResidual = 0
  for (const point of points) {
    const predicted = slope * point.x + intercept
    ssTotal += (point.y - yMean) ** 2
    ssResidual += (point.y - predicted) ** 2
  }
  const r2 = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0

  return { slope, intercept, r2: Math.max(0, r2) }
}

function calculateTrend(values) {
  if (values.length < 2) return 'stable'

  const points = values.map((y, x) => ({ x, y }))
  const { slope } = linearRegression(points)

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const threshold = Math.max(0.5, mean * 0.05)

  if (slope > threshold) return 'increasing'
  if (slope < -threshold) return 'decreasing'
  return 'stable'
}

function percentageChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / Math.abs(previous)) * 100
}

// =============================================
// Data Fetching
// =============================================

async function fetchClientData(clientName) {
  // Get client basic info
  const { data: clientInfo } = await supabase
    .from('client_segmentation')
    .select('id, client_name, client_uuid, tier_id')
    .eq('client_name', clientName)
    .is('effective_to', null)
    .single()

  if (!clientInfo) return null

  // Fetch health history (last 6 months)
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const { data: healthHistory } = await supabase
    .from('client_health_history')
    .select('snapshot_date, health_score, nps_points, compliance_points, working_capital_points, actions_points')
    .eq('client_name', clientName)
    .gte('snapshot_date', sixMonthsAgo.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: true })

  // Fetch NPS scores
  const { data: npsData } = await supabase
    .from('nps_responses')
    .select('score, period')
    .eq('client_name', clientName)
    .order('period', { ascending: true })
    .limit(12)

  // Fetch meeting history (last 12 months)
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

  const { data: meetingData } = await supabase
    .from('unified_meetings')
    .select('meeting_date, meeting_type')
    .eq('client_name', clientName)
    .gte('meeting_date', twelveMonthsAgo.toISOString().split('T')[0])
    .order('meeting_date', { ascending: true })

  // Fetch aging data
  const { data: agingData } = await supabase
    .from('aging_accounts')
    .select('current_amount, days_1_to_30, days_31_to_60, days_61_to_90, total_outstanding, total_overdue')
    .eq('client_name', clientName)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Calculate aging percentages
  let agingInfo = null
  if (agingData && agingData.total_outstanding > 0) {
    const under60 = (agingData.current_amount || 0) + (agingData.days_1_to_30 || 0) + (agingData.days_31_to_60 || 0)
    const under90 = under60 + (agingData.days_61_to_90 || 0)

    agingInfo = {
      percentUnder60: Math.min(100, (under60 / agingData.total_outstanding) * 100),
      percentUnder90: Math.min(100, (under90 / agingData.total_outstanding) * 100),
      totalOverdue: agingData.total_overdue || 0,
    }
  }

  // Fetch action completion rate
  const { data: allActions } = await supabase
    .from('actions')
    .select('Status')
    .eq('client', clientName)

  const totalActions = allActions?.length ?? 0
  const completedActions = allActions?.filter(a =>
    a.Status?.toLowerCase() === 'completed' || a.Status?.toLowerCase() === 'done'
  ).length ?? 0
  const actionCompletionRate = totalActions > 0 ? (completedActions / totalActions) * 100 : 100

  // Fetch compliance
  const { data: complianceData } = await supabase
    .from('event_compliance_by_client')
    .select('compliance_percentage')
    .eq('client_name', clientName)
    .single()

  // Fetch sentiment from meetings
  const { data: sentimentData } = await supabase
    .from('unified_meetings')
    .select('sentiment_score')
    .eq('client_name', clientName)
    .not('sentiment_score', 'is', null)
    .order('meeting_date', { ascending: false })
    .limit(10)

  return {
    clientId: clientInfo.id,
    clientName,
    clientUuid: clientInfo.client_uuid,
    tier: clientInfo.tier_id,
    healthHistory: (healthHistory || []).map(h => ({
      snapshotDate: h.snapshot_date,
      healthScore: h.health_score,
      npsPoints: h.nps_points,
      compliancePoints: h.compliance_points,
      workingCapitalPoints: h.working_capital_points,
      actionsPoints: h.actions_points,
    })),
    npsScores: (npsData || []).map(n => ({ score: n.score, period: n.period })),
    meetingHistory: (meetingData || []).map(m => ({ date: m.meeting_date, type: m.meeting_type })),
    agingData: agingInfo,
    actionCompletionRate,
    compliancePercentage: complianceData?.compliance_percentage ?? 50,
    sentimentScores: (sentimentData || []).map(s => s.sentiment_score).filter(s => s !== null),
  }
}

// =============================================
// Calculation Functions
// =============================================

function calculateChurnRisk(data) {
  const factors = []
  let weightedScore = 0

  // 1. Health Trajectory Component (25%)
  const healthScores = data.healthHistory.map(h => h.healthScore)
  let healthTrajectoryRisk = 50

  if (healthScores.length >= 2) {
    const trend = calculateTrend(healthScores)
    const recentChange = percentageChange(
      healthScores[healthScores.length - 1],
      healthScores[Math.max(0, healthScores.length - 3)]
    )

    if (trend === 'decreasing') {
      healthTrajectoryRisk = Math.min(100, 60 + Math.abs(recentChange))
      factors.push({
        factor: 'Health Score Trajectory',
        severity: recentChange < -15 ? 'critical' : recentChange < -5 ? 'high' : 'medium',
        description: `Health score declining ${Math.abs(recentChange).toFixed(1)}% over recent periods`,
        score: healthTrajectoryRisk,
        trend: 'worsening',
      })
    } else if (trend === 'increasing') {
      healthTrajectoryRisk = Math.max(0, 30 - Math.abs(recentChange) / 2)
    }
  }
  weightedScore += healthTrajectoryRisk * CHURN_WEIGHTS.healthTrajectory

  // 2. NPS Trend Component (20%)
  let npsTrendRisk = 50

  if (data.npsScores.length >= 2) {
    const npsValues = data.npsScores.map(n => n.score)
    const latestNps = npsValues[npsValues.length - 1]
    const trend = calculateTrend(npsValues)

    if (latestNps < 0) npsTrendRisk = 80
    else if (latestNps < 30) npsTrendRisk = 60
    else if (latestNps < 50) npsTrendRisk = 40
    else npsTrendRisk = 20

    if (trend === 'decreasing') {
      npsTrendRisk = Math.min(100, npsTrendRisk + 20)
      factors.push({
        factor: 'NPS Trend',
        severity: latestNps < 0 ? 'critical' : latestNps < 30 ? 'high' : 'medium',
        description: `NPS score is ${latestNps} and declining`,
        score: npsTrendRisk,
        trend: 'worsening',
      })
    }
  }
  weightedScore += npsTrendRisk * CHURN_WEIGHTS.npsTrend

  // 3. Meeting Frequency Component (15%)
  let meetingRisk = 50

  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const recentMeetings = data.meetingHistory.filter(
    m => new Date(m.date) >= threeMonthsAgo
  ).length

  if (recentMeetings === 0) {
    meetingRisk = 90
    factors.push({
      factor: 'Low Engagement',
      severity: 'high',
      description: 'No meetings in the last 3 months',
      score: meetingRisk,
      trend: 'worsening',
    })
  } else if (recentMeetings === 1) {
    meetingRisk = 60
  } else if (recentMeetings <= 3) {
    meetingRisk = 30
  } else {
    meetingRisk = 10
  }
  weightedScore += meetingRisk * CHURN_WEIGHTS.meetingFrequency

  // 4. Action Completion Component (15%)
  let actionRisk = 50

  if (data.actionCompletionRate < 50) {
    actionRisk = 80
    factors.push({
      factor: 'Action Completion',
      severity: 'high',
      description: `Only ${data.actionCompletionRate.toFixed(0)}% of actions completed`,
      score: actionRisk,
    })
  } else if (data.actionCompletionRate < 70) {
    actionRisk = 50
  } else if (data.actionCompletionRate < 90) {
    actionRisk = 25
  } else {
    actionRisk = 10
  }
  weightedScore += actionRisk * CHURN_WEIGHTS.actionCompletion

  // 5. Aging Balance Component (15%)
  let agingRisk = 30

  if (data.agingData) {
    if (data.agingData.percentUnder60 < 70) {
      agingRisk = 85
      factors.push({
        factor: 'Payment Issues',
        severity: 'critical',
        description: `Only ${data.agingData.percentUnder60.toFixed(0)}% of receivables under 60 days`,
        score: agingRisk,
      })
    } else if (data.agingData.percentUnder60 < 80) {
      agingRisk = 60
    } else if (data.agingData.percentUnder60 < 90) {
      agingRisk = 40
    } else {
      agingRisk = 15
    }
  }
  weightedScore += agingRisk * CHURN_WEIGHTS.agingBalance

  // 6. Sentiment Trend Component (10%)
  let sentimentRisk = 50

  if (data.sentimentScores.length >= 2) {
    const avgSentiment = data.sentimentScores.reduce((a, b) => a + b, 0) / data.sentimentScores.length
    const trend = calculateTrend(data.sentimentScores)

    if (avgSentiment < 0.3) {
      sentimentRisk = 80
      factors.push({
        factor: 'Negative Sentiment',
        severity: 'high',
        description: 'Recent communications show concerning sentiment patterns',
        score: sentimentRisk,
        trend: trend === 'decreasing' ? 'worsening' : 'stable',
      })
    } else if (avgSentiment < 0.5) {
      sentimentRisk = 50
    } else {
      sentimentRisk = 20
    }

    if (trend === 'decreasing') sentimentRisk = Math.min(100, sentimentRisk + 15)
  }
  weightedScore += sentimentRisk * CHURN_WEIGHTS.sentimentTrend

  const riskScore = Math.round(Math.max(0, Math.min(100, weightedScore)))
  const riskLevel = riskScore >= 65 ? 'high' : riskScore >= 40 ? 'medium' : 'low'

  return { riskScore, riskLevel, factors }
}

function calculateExpansionProbability(data) {
  const factors = []
  let weightedScore = 0

  // 1. Health Improvement Component (25%)
  let healthImprovementScore = 50

  if (data.healthHistory.length >= 2) {
    const healthScores = data.healthHistory.map(h => h.healthScore)
    const trend = calculateTrend(healthScores)
    const latestHealth = healthScores[healthScores.length - 1]

    if (trend === 'increasing' && latestHealth >= 70) {
      healthImprovementScore = 90
      factors.push({
        factor: 'Health Improvement',
        strength: 'strong',
        description: `Health score improving and currently at ${latestHealth}`,
        score: healthImprovementScore,
      })
    } else if (trend === 'increasing') {
      healthImprovementScore = 70
    } else if (latestHealth >= 80) {
      healthImprovementScore = 65
    }
  }
  weightedScore += healthImprovementScore * EXPANSION_WEIGHTS.healthImprovement

  // 2. Promoter NPS Component (25%)
  let promoterScore = 50

  if (data.npsScores.length > 0) {
    const latestNps = data.npsScores[data.npsScores.length - 1].score

    if (latestNps >= 70) {
      promoterScore = 95
      factors.push({
        factor: 'Strong Promoter',
        strength: 'strong',
        description: `NPS score of ${latestNps} indicates strong advocacy`,
        score: promoterScore,
      })
    } else if (latestNps >= 50) {
      promoterScore = 75
    } else if (latestNps >= 0) {
      promoterScore = 40
    } else {
      promoterScore = 15
    }
  }
  weightedScore += promoterScore * EXPANSION_WEIGHTS.promoterNps

  // 3. Positive Sentiment Component (20%)
  let sentimentScore = 50

  if (data.sentimentScores.length >= 2) {
    const avgSentiment = data.sentimentScores.reduce((a, b) => a + b, 0) / data.sentimentScores.length
    const trend = calculateTrend(data.sentimentScores)

    if (avgSentiment >= 0.7 && trend === 'increasing') {
      sentimentScore = 90
      factors.push({
        factor: 'Positive Sentiment Trend',
        strength: 'strong',
        description: 'Consistently positive and improving sentiment in communications',
        score: sentimentScore,
      })
    } else if (avgSentiment >= 0.6) {
      sentimentScore = 70
    } else if (avgSentiment >= 0.5) {
      sentimentScore = 50
    } else {
      sentimentScore = 25
    }
  }
  weightedScore += sentimentScore * EXPANSION_WEIGHTS.positiveSentiment

  // 4. Engagement Increase Component (15%)
  let engagementScore = 50

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

  const olderMeetings = data.meetingHistory.filter(
    m => new Date(m.date) >= sixMonthsAgo && new Date(m.date) < threeMonthsAgo
  ).length
  const recentMeetings = data.meetingHistory.filter(
    m => new Date(m.date) >= threeMonthsAgo
  ).length

  if (olderMeetings > 0) {
    const change = ((recentMeetings - olderMeetings) / olderMeetings) * 100

    if (change > 50 && recentMeetings >= 4) {
      engagementScore = 85
      factors.push({
        factor: 'Engagement Growth',
        strength: 'strong',
        description: `Meeting frequency increased ${change.toFixed(0)}%`,
        score: engagementScore,
      })
    } else if (change > 20) {
      engagementScore = 65
    }
  } else if (recentMeetings >= 4) {
    engagementScore = 70
  }
  weightedScore += engagementScore * EXPANSION_WEIGHTS.engagementIncrease

  // 5. Compliance Rate Component (15%)
  let complianceScore = 50

  if (data.compliancePercentage >= 90) {
    complianceScore = 80
    factors.push({
      factor: 'High Compliance',
      strength: 'moderate',
      description: `Compliance at ${data.compliancePercentage.toFixed(0)}% shows strong engagement`,
      score: complianceScore,
    })
  } else if (data.compliancePercentage >= 75) {
    complianceScore = 60
  } else if (data.compliancePercentage >= 50) {
    complianceScore = 40
  } else {
    complianceScore = 20
  }
  weightedScore += complianceScore * EXPANSION_WEIGHTS.complianceRate

  const probability = Math.round(Math.max(0, Math.min(100, weightedScore)))
  const level = probability >= 70 ? 'high' : probability >= 45 ? 'medium' : 'low'

  return { probability, level, factors }
}

function calculateEngagementVelocity(data) {
  if (!data.meetingHistory || data.meetingHistory.length === 0) {
    return {
      meetingsPerQuarter: 0,
      quarterlyTrend: 'stable',
      velocityScore: 30,
      percentageChange: 0,
    }
  }

  // Group meetings by quarter
  const meetingsByQuarter = new Map()

  for (const meeting of data.meetingHistory) {
    const date = new Date(meeting.date)
    const quarter = `${date.getFullYear()}-Q${Math.ceil((date.getMonth() + 1) / 3)}`
    meetingsByQuarter.set(quarter, (meetingsByQuarter.get(quarter) || 0) + 1)
  }

  const quarters = Array.from(meetingsByQuarter.keys()).sort()
  const quarterValues = quarters.map(q => meetingsByQuarter.get(q) || 0)

  const recentQuarters = quarterValues.slice(-2)
  const meetingsPerQuarter = recentQuarters.length > 0
    ? recentQuarters.reduce((a, b) => a + b, 0) / recentQuarters.length
    : 0

  const quarterlyTrend = calculateTrend(quarterValues)

  let pctChange = 0
  if (quarterValues.length >= 2) {
    const previous = quarterValues[quarterValues.length - 2]
    const current = quarterValues[quarterValues.length - 1]
    pctChange = percentageChange(current, previous)
  }

  let velocityScore = 50
  if (meetingsPerQuarter >= 6) velocityScore = 90
  else if (meetingsPerQuarter >= 4) velocityScore = 75
  else if (meetingsPerQuarter >= 2) velocityScore = 55
  else if (meetingsPerQuarter >= 1) velocityScore = 35
  else velocityScore = 15

  if (quarterlyTrend === 'increasing') velocityScore = Math.min(100, velocityScore + 10)
  else if (quarterlyTrend === 'decreasing') velocityScore = Math.max(0, velocityScore - 15)

  return {
    meetingsPerQuarter: Math.round(meetingsPerQuarter * 10) / 10,
    quarterlyTrend,
    velocityScore: Math.round(velocityScore),
    percentageChange: Math.round(pctChange * 10) / 10,
  }
}

function predictHealthTrajectory(data) {
  if (!data.healthHistory || data.healthHistory.length < 3) {
    const currentScore = data.healthHistory?.[data.healthHistory?.length - 1]?.healthScore ?? 50
    return {
      currentScore,
      predicted30Days: currentScore,
      predicted90Days: currentScore,
      trend: 'stable',
      confidence: 'low',
      trendSlope: 0,
    }
  }

  const healthScores = data.healthHistory.map(h => h.healthScore)
  const currentScore = healthScores[healthScores.length - 1]

  const points = healthScores.map((score, index) => ({ x: index, y: score }))
  const regression = linearRegression(points)

  const currentIndex = healthScores.length - 1
  const predicted30Days = Math.max(0, Math.min(100, Math.round(
    regression.slope * (currentIndex + 1) + regression.intercept
  )))
  const predicted90Days = Math.max(0, Math.min(100, Math.round(
    regression.slope * (currentIndex + 3) + regression.intercept
  )))

  let trend = 'stable'
  const monthlyChange = regression.slope
  if (monthlyChange > 2) trend = 'improving'
  else if (monthlyChange < -2) trend = 'declining'

  let confidence = 'medium'
  if (regression.r2 >= 0.6 && healthScores.length >= 6) confidence = 'high'
  else if (regression.r2 < 0.3 || healthScores.length < 4) confidence = 'low'

  return {
    currentScore,
    predicted30Days,
    predicted90Days,
    trend,
    confidence,
    trendSlope: Math.round(monthlyChange * 10) / 10,
  }
}

async function calculatePeerBenchmark(data) {
  if (!data.tier) return null

  // Get all clients in same tier
  const { data: tierClients } = await supabase
    .from('client_segmentation')
    .select('id, client_name')
    .eq('tier_id', data.tier)
    .is('effective_to', null)

  if (!tierClients || tierClients.length < 2) return null

  const clientNames = tierClients.map(c => c.client_name)

  // Get latest health scores
  const { data: healthData } = await supabase
    .from('client_health_history')
    .select('client_name, health_score')
    .in('client_name', clientNames)
    .order('snapshot_date', { ascending: false })

  const latestScores = new Map()
  for (const h of healthData || []) {
    if (!latestScores.has(h.client_name)) {
      latestScores.set(h.client_name, h.health_score)
    }
  }

  const peerMetrics = tierClients.map(client => ({
    clientName: client.client_name,
    healthScore: latestScores.get(client.client_name) ?? 50,
  }))

  peerMetrics.sort((a, b) => b.healthScore - a.healthScore)

  const clientIndex = peerMetrics.findIndex(p => p.clientName === data.clientName)
  const avgHealth = peerMetrics.reduce((a, b) => a + b.healthScore, 0) / peerMetrics.length
  const percentile = Math.round(((peerMetrics.length - clientIndex - 1) / (peerMetrics.length - 1)) * 100)

  let comparison = 'average'
  const clientScore = peerMetrics[clientIndex]?.healthScore ?? 50
  if (clientScore > avgHealth * 1.1) comparison = 'above-average'
  else if (clientScore < avgHealth * 0.9) comparison = 'below-average'

  // Get tier name
  const { data: tierData } = await supabase
    .from('segment_tiers')
    .select('name')
    .eq('id', data.tier)
    .single()

  return {
    tierName: tierData?.name || data.tier,
    peerCount: peerMetrics.length,
    averageHealthScore: Math.round(avgHealth),
    averageChurnRisk: Math.round(100 - avgHealth), // Simplified
    clientRank: clientIndex + 1,
    percentile,
    comparison,
  }
}

// =============================================
// Main Execution
// =============================================

async function ensureTableExists() {
  // Check if table exists and create if needed
  const { data, error } = await supabase
    .from('predictive_health_scores')
    .select('id')
    .limit(1)

  if (error && error.code === '42P01') {
    // Table doesn't exist - create it
    console.log('Creating predictive_health_scores table...')

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS predictive_health_scores (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        client_id TEXT NOT NULL,
        client_name TEXT NOT NULL,
        client_uuid TEXT,
        tier TEXT,

        -- Core predictive metrics
        churn_risk INTEGER NOT NULL,
        churn_risk_level TEXT NOT NULL,
        expansion_probability INTEGER NOT NULL,
        expansion_level TEXT NOT NULL,
        engagement_velocity INTEGER NOT NULL,

        -- Health trajectory
        current_health_score INTEGER NOT NULL,
        predicted_health_30_days INTEGER NOT NULL,
        predicted_health_90_days INTEGER NOT NULL,
        health_trend TEXT NOT NULL,
        health_confidence TEXT NOT NULL,

        -- Peer benchmarking
        peer_benchmark JSONB,

        -- Risk and expansion factors
        churn_risk_factors JSONB NOT NULL DEFAULT '[]',
        expansion_factors JSONB NOT NULL DEFAULT '[]',

        -- Metadata
        model_version TEXT NOT NULL,
        calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        UNIQUE(client_id)
      );

      CREATE INDEX IF NOT EXISTS idx_predictive_health_client_name ON predictive_health_scores(client_name);
      CREATE INDEX IF NOT EXISTS idx_predictive_health_churn_risk ON predictive_health_scores(churn_risk DESC);
      CREATE INDEX IF NOT EXISTS idx_predictive_health_calculated_at ON predictive_health_scores(calculated_at);
    `

    // Note: This requires executing raw SQL which may need a Supabase function
    console.log('Note: Table creation requires admin access. Please run the migration manually if needed.')
    return false
  }

  return true
}

async function generateScoreForClient(clientName) {
  const data = await fetchClientData(clientName)

  if (!data) {
    if (verbose) console.log(`  Skipping ${clientName} - no data found`)
    return null
  }

  const churnResult = calculateChurnRisk(data)
  const expansionResult = calculateExpansionProbability(data)
  const velocityResult = calculateEngagementVelocity(data)
  const trajectoryResult = predictHealthTrajectory(data)
  const peerBenchmark = await calculatePeerBenchmark(data)

  return {
    client_id: data.clientId,
    client_name: data.clientName,
    client_uuid: data.clientUuid,
    tier: data.tier,

    churn_risk: churnResult.riskScore,
    churn_risk_level: churnResult.riskLevel,
    expansion_probability: expansionResult.probability,
    expansion_level: expansionResult.level,
    engagement_velocity: velocityResult.velocityScore,

    current_health_score: trajectoryResult.currentScore,
    predicted_health_30_days: trajectoryResult.predicted30Days,
    predicted_health_90_days: trajectoryResult.predicted90Days,
    health_trend: trajectoryResult.trend,
    health_confidence: trajectoryResult.confidence,

    peer_benchmark: peerBenchmark,

    churn_risk_factors: churnResult.factors,
    expansion_factors: expansionResult.factors,

    model_version: MODEL_VERSION,
    calculated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

async function main() {
  console.log('=== Predictive Health Scores Generator ===\n')

  if (dryRun) {
    console.log('DRY RUN MODE - No data will be saved\n')
  }

  // Ensure table exists
  const tableExists = await ensureTableExists()
  if (!tableExists && !dryRun) {
    console.log('\nPlease create the predictive_health_scores table first.')
    console.log('See migration SQL in the script source or docs.')
    process.exit(1)
  }

  // Get clients to process
  let clients
  if (clientFilter) {
    console.log(`Processing single client: ${clientFilter}\n`)
    clients = [{ client_name: clientFilter }]
  } else {
    const { data, error } = await supabase
      .from('client_segmentation')
      .select('client_name')
      .is('effective_to', null)
      .order('client_name')

    if (error) {
      console.error('Error fetching clients:', error.message)
      process.exit(1)
    }

    clients = data || []
    console.log(`Processing ${clients.length} clients...\n`)
  }

  const results = {
    processed: 0,
    success: 0,
    failed: 0,
    highChurnRisk: 0,
    highExpansion: 0,
  }

  const scores = []

  for (const client of clients) {
    results.processed++

    try {
      const score = await generateScoreForClient(client.client_name)

      if (score) {
        scores.push(score)
        results.success++

        if (score.churn_risk >= 65) results.highChurnRisk++
        if (score.expansion_probability >= 70) results.highExpansion++

        if (verbose) {
          console.log(`  ✓ ${client.client_name}`)
          console.log(`    Churn Risk: ${score.churn_risk}% (${score.churn_risk_level})`)
          console.log(`    Expansion: ${score.expansion_probability}% (${score.expansion_level})`)
          console.log(`    Health: ${score.current_health_score} → ${score.predicted_health_30_days} (30d)`)
        } else {
          process.stdout.write(`\r  Processing: ${results.processed}/${clients.length}`)
        }
      } else {
        results.failed++
        if (verbose) console.log(`  ✗ ${client.client_name} - no data`)
      }
    } catch (err) {
      results.failed++
      console.error(`\n  ✗ Error processing ${client.client_name}:`, err.message)
    }
  }

  if (!verbose) console.log('\n')

  // Save to database
  if (!dryRun && scores.length > 0) {
    console.log(`\nSaving ${scores.length} scores to database...`)

    const { error } = await supabase
      .from('predictive_health_scores')
      .upsert(scores, { onConflict: 'client_id' })

    if (error) {
      console.error('Error saving scores:', error.message)
    } else {
      console.log('✓ Scores saved successfully')
    }
  }

  // Summary
  console.log('\n=== Summary ===')
  console.log(`Total clients processed: ${results.processed}`)
  console.log(`Successful: ${results.success}`)
  console.log(`Failed/Skipped: ${results.failed}`)
  console.log(`High churn risk (>=65%): ${results.highChurnRisk}`)
  console.log(`High expansion probability (>=70%): ${results.highExpansion}`)

  if (dryRun) {
    console.log('\n[DRY RUN] No data was saved to the database.')
    if (scores.length > 0) {
      console.log('\nSample output (first client):')
      console.log(JSON.stringify(scores[0], null, 2))
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
