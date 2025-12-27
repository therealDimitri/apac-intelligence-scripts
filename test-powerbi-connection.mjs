/**
 * Power BI Connection Test Script
 *
 * Tests the Power BI REST API connection using service principal authentication.
 * Run with: node scripts/test-powerbi-connection.mjs
 *
 * Prerequisites:
 * 1. Azure AD app registered with Power BI Service permissions
 * 2. Admin consent granted for Power BI permissions
 * 3. Service principal added to Power BI workspace as Member or Admin
 * 4. "Allow service principals to use Power BI APIs" enabled in Power BI Admin Portal
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const POWER_BI_API_BASE = 'https://api.powerbi.com/v1.0/myorg'
const POWER_BI_RESOURCE = 'https://analysis.windows.net/powerbi/api'

// The report URL you provided
const REPORT_URL =
  'https://app.powerbi.com/groups/me/reports/bc5d6fec-3b73-4288-993b-4b460a172b0e/8529fce93569e1f6ec83?experience=power-bi'

/**
 * Parse the Power BI report URL
 */
function parseReportUrl(url) {
  const result = {}

  const appMatch = url.match(/\/apps\/([a-f0-9-]+)/)
  if (appMatch) result.appId = appMatch[1]

  const groupMatch = url.match(/\/groups\/([a-f0-9-]+)/)
  if (groupMatch && groupMatch[1] !== 'me') result.workspaceId = groupMatch[1]
  if (groupMatch && groupMatch[1] === 'me') result.isMyWorkspace = true

  const reportMatch = url.match(/\/reports\/([a-f0-9-]+)/)
  if (reportMatch) result.reportId = reportMatch[1]

  // Handle both formats: ReportSection... and direct page ID
  const sectionMatch = url.match(/ReportSection([a-f0-9]+)/)
  if (sectionMatch) {
    result.sectionId = sectionMatch[1]
  } else {
    // Check for direct page ID after report ID (e.g., /reports/{id}/{pageId})
    const pageMatch = url.match(/\/reports\/[a-f0-9-]+\/([a-f0-9]+)/)
    if (pageMatch) result.pageId = pageMatch[1]
  }

  return result
}

/**
 * Get Power BI access token using client credentials
 */
async function getPowerBIToken() {
  const tenantId = process.env.AZURE_AD_TENANT_ID
  const clientId = process.env.AZURE_AD_CLIENT_ID
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET

  console.log('\n=== Azure AD Configuration ===')
  console.log(`Tenant ID: ${tenantId ? tenantId.substring(0, 8) + '...' : 'MISSING'}`)
  console.log(`Client ID: ${clientId ? clientId.substring(0, 8) + '...' : 'MISSING'}`)
  console.log(`Client Secret: ${clientSecret ? '***configured***' : 'MISSING'}`)

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing Azure AD credentials. Check .env.local file.')
  }

  const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: `${POWER_BI_RESOURCE}/.default`,
  })

  console.log('\n=== Requesting Token ===')
  console.log(`Token endpoint: ${tokenEndpoint}`)
  console.log(`Scope: ${POWER_BI_RESOURCE}/.default`)

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  const data = await response.json()

  if (!response.ok) {
    console.error('\n❌ Token request failed!')
    console.error('Error:', data.error)
    console.error('Description:', data.error_description)

    // Provide guidance
    if (data.error === 'invalid_client') {
      console.error('\n💡 Guidance: Check that AZURE_AD_CLIENT_SECRET is correct and not expired.')
    } else if (data.error_description?.includes('AADSTS700016')) {
      console.error('\n💡 Guidance: The app is not configured for Power BI.')
      console.error('   Go to Azure Portal > App registrations > API permissions')
      console.error('   Add "Power BI Service" > Delegated or Application permissions')
      console.error('   Grant admin consent')
    } else if (data.error_description?.includes('AADSTS7000215')) {
      console.error('\n💡 Guidance: Client secret is invalid or expired.')
      console.error('   Go to Azure Portal > App registrations > Certificates & secrets')
      console.error('   Create a new client secret and update .env.local')
    }

    throw new Error(`Token error: ${data.error_description || data.error}`)
  }

  console.log('✅ Token acquired successfully!')
  console.log(`Token type: ${data.token_type}`)
  console.log(`Expires in: ${data.expires_in} seconds`)

  return data.access_token
}

/**
 * List workspaces
 */
async function listWorkspaces(token) {
  console.log('\n=== Listing Workspaces ===')

  const response = await fetch(`${POWER_BI_API_BASE}/groups`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    console.error(`❌ Failed to list workspaces: ${response.status}`)
    console.error('Error:', error)

    if (response.status === 401) {
      console.error('\n💡 Guidance: Token is valid but not authorised for Power BI API.')
      console.error('   1. Go to Power BI Admin Portal > Tenant settings > Developer settings')
      console.error('   2. Enable "Allow service principals to use Power BI APIs"')
      console.error('   3. Add the service principal to the allowed security group (or allow all)')
    }

    return []
  }

  const data = await response.json()
  const workspaces = data.value || []

  console.log(`✅ Found ${workspaces.length} workspaces:`)
  workspaces.forEach((ws, i) => {
    console.log(`   ${i + 1}. ${ws.name} (${ws.id})`)
    console.log(`      Type: ${ws.type || 'Workspace'}`)
    console.log(`      Premium: ${ws.isOnDedicatedCapacity ? 'Yes' : 'No'}`)
  })

  return workspaces
}

/**
 * List datasets in My Workspace
 */
async function listMyDatasets(token) {
  console.log('\n=== Listing Datasets (My Workspace) ===')

  const response = await fetch(`${POWER_BI_API_BASE}/datasets`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    console.error(`❌ Failed to list datasets: ${response.status}`)
    console.error('Error:', error)
    return []
  }

  const data = await response.json()
  const datasets = data.value || []

  console.log(`✅ Found ${datasets.length} datasets:`)
  datasets.forEach((ds, i) => {
    console.log(`   ${i + 1}. ${ds.name} (${ds.id})`)
    console.log(`      Configured by: ${ds.configuredBy || 'Unknown'}`)
    console.log(`      Refreshable: ${ds.isRefreshable ? 'Yes' : 'No'}`)
    console.log(`      RLS Required: ${ds.isEffectiveIdentityRequired ? 'Yes' : 'No'}`)
  })

  return datasets
}

/**
 * List reports in My Workspace
 */
async function listMyReports(token) {
  console.log('\n=== Listing Reports (My Workspace) ===')

  const response = await fetch(`${POWER_BI_API_BASE}/reports`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    console.error(`❌ Failed to list reports: ${response.status}`)
    console.error('Error:', error)
    return []
  }

  const data = await response.json()
  const reports = data.value || []

  console.log(`✅ Found ${reports.length} reports:`)
  reports.forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.name} (${r.id})`)
    console.log(`      Dataset ID: ${r.datasetId || 'Unknown'}`)
    console.log(`      URL: ${r.webUrl || 'N/A'}`)
  })

  return reports
}

/**
 * Get a specific report by ID
 */
async function getReport(token, reportId) {
  console.log(`\n=== Getting Report ${reportId} ===`)

  const response = await fetch(`${POWER_BI_API_BASE}/reports/${reportId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    console.error(`❌ Failed to get report: ${response.status}`)
    console.error('Error:', error)

    if (response.status === 404) {
      console.error('\n💡 The report might be in an App workspace, not your personal workspace.')
      console.error('   Try listing workspaces to find the correct workspace ID.')
    }

    return null
  }

  const report = await response.json()
  console.log('✅ Report found:')
  console.log(`   Name: ${report.name}`)
  console.log(`   ID: ${report.id}`)
  console.log(`   Dataset ID: ${report.datasetId}`)
  console.log(`   Web URL: ${report.webUrl}`)

  return report
}

/**
 * Try to get available apps
 */
async function listApps(token) {
  console.log('\n=== Listing Apps ===')

  const response = await fetch(`${POWER_BI_API_BASE}/apps`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    console.error(`❌ Failed to list apps: ${response.status}`)
    console.error('Error:', error)
    return []
  }

  const data = await response.json()
  const apps = data.value || []

  console.log(`✅ Found ${apps.length} apps:`)
  apps.forEach((app, i) => {
    console.log(`   ${i + 1}. ${app.name} (${app.id})`)
    console.log(`      Description: ${app.description || 'None'}`)
    console.log(`      Published by: ${app.publishedBy || 'Unknown'}`)
  })

  return apps
}

/**
 * Test DAX query on a dataset
 */
async function testDAXQuery(token, datasetId, workspaceId = null) {
  console.log(`\n=== Testing DAX Query on Dataset ${datasetId} ===`)

  const url = workspaceId
    ? `${POWER_BI_API_BASE}/groups/${workspaceId}/datasets/${datasetId}/executeQueries`
    : `${POWER_BI_API_BASE}/datasets/${datasetId}/executeQueries`

  // Simple query to get table names
  const query = 'EVALUATE ROW("Test", 1)'

  console.log(`Endpoint: ${url}`)
  console.log(`Query: ${query}`)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      queries: [{ query }],
      serializerSettings: { includeNulls: true },
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    console.error(`❌ DAX query failed: ${response.status}`)
    console.error('Error:', JSON.stringify(error, null, 2))

    if (response.status === 400) {
      console.error('\n💡 The DAX query syntax may be invalid.')
    } else if (response.status === 403) {
      console.error('\n💡 Access denied. Possible reasons:')
      console.error('   - The dataset has Row-Level Security (RLS) enabled')
      console.error('   - The service principal does not have access to this dataset')
      console.error('   - "Dataset Execute Queries REST API" tenant setting is disabled')
    }

    return null
  }

  const result = await response.json()
  console.log('✅ DAX query successful!')
  console.log('Result:', JSON.stringify(result, null, 2))

  return result
}

/**
 * Main test function
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗')
  console.log('║           Power BI Connection Test                             ║')
  console.log('╚════════════════════════════════════════════════════════════════╝')

  // Parse the provided URL
  console.log('\n=== Parsing Report URL ===')
  console.log(`URL: ${REPORT_URL}`)
  const parsed = parseReportUrl(REPORT_URL)
  console.log('Parsed components:')
  console.log(`   App ID: ${parsed.appId || 'N/A'}`)
  console.log(`   Workspace: ${parsed.isMyWorkspace ? 'My Workspace' : parsed.workspaceId || 'N/A'}`)
  console.log(`   Report ID: ${parsed.reportId || 'N/A'}`)
  console.log(`   Section/Page ID: ${parsed.sectionId || parsed.pageId || 'N/A'}`)

  try {
    // Step 1: Get token
    const token = await getPowerBIToken()

    // Step 2: List workspaces
    const workspaces = await listWorkspaces(token)

    // Step 3: List apps (the report is in an app)
    const apps = await listApps(token)

    // Step 4: List datasets in My Workspace
    const datasets = await listMyDatasets(token)

    // Step 5: List reports in My Workspace
    const reports = await listMyReports(token)

    // Step 6: Try to get the specific report
    if (parsed.reportId) {
      await getReport(token, parsed.reportId)
    }

    // Step 7: If we found datasets, try a DAX query
    if (datasets.length > 0) {
      console.log('\n=== Testing DAX Query ===')
      console.log('Attempting query on first available dataset...')
      await testDAXQuery(token, datasets[0].id)
    }

    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗')
    console.log('║                        Summary                                 ║')
    console.log('╚════════════════════════════════════════════════════════════════╝')
    console.log(`\n✅ Power BI API connection: SUCCESS`)
    console.log(`   Workspaces accessible: ${workspaces.length}`)
    console.log(`   Apps accessible: ${apps.length}`)
    console.log(`   Datasets in My Workspace: ${datasets.length}`)
    console.log(`   Reports in My Workspace: ${reports.length}`)

    if (parsed.appId) {
      console.log('\n⚠️  Note: The report URL points to a Power BI App.')
      console.log('   Apps are published from workspaces. To access the underlying data:')
      console.log('   1. Find the source workspace that published this app')
      console.log('   2. Add the service principal to that workspace')
      console.log('   3. Use the workspace ID and dataset ID to run DAX queries')
    } else if (parsed.isMyWorkspace) {
      console.log('\n📍 Note: This report is in "My Workspace" (personal workspace).')
      console.log('   Personal workspaces cannot have service principals added directly.')
      console.log('   Options:')
      console.log('   1. Move the report/dataset to a shared workspace')
      console.log('   2. Use delegated user authentication instead of service principal')
      console.log('   3. Share the dataset to a workspace where the service principal has access')
    }

    console.log('\n📋 Next Steps:')
    console.log('   1. Identify which workspace contains the dataset you need')
    console.log('   2. Add the service principal to that workspace (Admin Portal)')
    console.log('   3. Find the dataset ID from that workspace')
    console.log('   4. Use the /api/powerbi/query endpoint with DAX queries')
  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    process.exit(1)
  }
}

main()
