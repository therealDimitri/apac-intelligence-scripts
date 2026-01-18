#!/usr/bin/env node
/**
 * Sync ChaSen Knowledge Graph
 * Run: node scripts/sync-graph.mjs
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function upsertGraphNode(node) {
  const { data, error } = await supabase
    .from('chasen_graph_nodes')
    .upsert({
      entity_type: node.entity_type,
      entity_id: node.entity_id,
      label: node.label,
      properties: node.properties || {},
      embedding: node.embedding,
      last_synced: new Date().toISOString(),
    }, { onConflict: 'entity_type,entity_id' })
    .select()
    .single()

  if (error) {
    // Ignore duplicate errors
    if (!error.message.includes('duplicate')) {
      console.error(`  Error upserting node ${node.label}:`, error.message)
    }
    return null
  }
  return data
}

async function createGraphEdge(edge) {
  const { data, error } = await supabase
    .from('chasen_graph_edges')
    .insert({
      source_node_id: edge.source_node_id,
      target_node_id: edge.target_node_id,
      edge_type: edge.edge_type,
      properties: edge.properties || {},
      weight: edge.weight || 1.0,
    })
    .select()
    .single()

  if (error) {
    // Ignore duplicate key errors
    if (!error.message.includes('duplicate')) {
      console.error(`  Error creating edge:`, error.message)
    }
    return null
  }
  return data
}

async function syncClientsToGraph() {
  console.log('Syncing clients...')
  const { data: clients, error } = await supabase
    .from('client_segmentation')
    .select('id, client_name, tier_id, cse_name')

  if (error || !clients) {
    console.error('Error fetching clients:', error)
    return 0
  }

  let synced = 0
  for (const client of clients) {
    const node = await upsertGraphNode({
      entity_type: 'client',
      entity_id: client.id,
      label: client.client_name,
      properties: {
        tier_id: client.tier_id,
        cse_name: client.cse_name,
      },
    })
    if (node) synced++
  }
  return synced
}

async function syncCSEToGraph() {
  console.log('Syncing CSEs...')
  const { data: cses, error } = await supabase
    .from('cse_profiles')
    .select('id, full_name, email, role, reports_to, active')
    .eq('active', true)

  if (error || !cses) {
    console.error('Error fetching CSEs:', error)
    return 0
  }

  let synced = 0
  const cseNodeMap = new Map()

  // First pass: create all CSE nodes
  for (const cse of cses) {
    const cseNode = await upsertGraphNode({
      entity_type: 'cse',
      entity_id: cse.id,
      label: cse.full_name || cse.email,
      properties: {
        email: cse.email,
        role: cse.role,
        reports_to: cse.reports_to,
      },
    })

    if (cseNode) {
      cseNodeMap.set(cse.id, cseNode.id)
      synced++
    }
  }

  // Second pass: create manager relationships
  for (const cse of cses) {
    if (cse.reports_to && cseNodeMap.has(cse.id) && cseNodeMap.has(cse.reports_to)) {
      await createGraphEdge({
        source_node_id: cseNodeMap.get(cse.id),
        target_node_id: cseNodeMap.get(cse.reports_to),
        edge_type: 'REPORTS_TO',
      })
    }
  }

  // Create CSE-client assignment edges
  const { data: assignments } = await supabase
    .from('cse_client_assignments')
    .select('cse_id, client_name, assignment_type')
    .eq('is_active', true)

  if (assignments) {
    for (const assignment of assignments) {
      if (!cseNodeMap.has(assignment.cse_id)) continue

      const { data: clientNode } = await supabase
        .from('chasen_graph_nodes')
        .select('id')
        .eq('entity_type', 'client')
        .ilike('label', assignment.client_name)
        .limit(1)
        .single()

      if (clientNode) {
        await createGraphEdge({
          source_node_id: cseNodeMap.get(assignment.cse_id),
          target_node_id: clientNode.id,
          edge_type: 'MANAGES',
          properties: { assignment_type: assignment.assignment_type },
        })
      }
    }
  }

  return synced
}

async function syncStakeholdersToGraph() {
  console.log('Syncing stakeholders...')
  // Skip if table is empty or doesn't have the expected columns
  const { data: stakeholders, error } = await supabase
    .from('stakeholder_relationships')
    .select('*')
    .limit(100)

  if (error) {
    console.error('Error fetching stakeholders:', error)
    return 0
  }

  if (!stakeholders || stakeholders.length === 0) {
    console.log('  No stakeholder data found')
    return 0
  }

  let synced = 0
  for (const stakeholder of stakeholders) {
    const stakeholderNode = await upsertGraphNode({
      entity_type: 'stakeholder',
      entity_id: stakeholder.id,
      label: stakeholder.contact_name || stakeholder.name || 'Unknown Stakeholder',
      properties: stakeholder,
    })

    if (!stakeholderNode) continue

    const clientName = stakeholder.client_name || stakeholder.client
    if (clientName) {
      const { data: clientNode } = await supabase
        .from('chasen_graph_nodes')
        .select('id')
        .eq('entity_type', 'client')
        .ilike('label', clientName)
        .limit(1)
        .single()

      if (clientNode) {
        await createGraphEdge({
          source_node_id: stakeholderNode.id,
          target_node_id: clientNode.id,
          edge_type: 'WORKS_AT',
        })
      }
    }

    synced++
  }

  return synced
}

async function syncMeetingsToGraph() {
  console.log('Syncing meetings...')
  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - 90)

  const { data: meetings, error } = await supabase
    .from('unified_meetings')
    .select('id, title, client_name, organizer, meeting_date, meeting_type')
    .gte('meeting_date', sinceDate.toISOString().split('T')[0])

  if (error || !meetings) {
    console.error('Error fetching meetings:', error)
    return 0
  }

  let synced = 0
  for (const meeting of meetings) {
    const meetingNode = await upsertGraphNode({
      entity_type: 'meeting',
      entity_id: meeting.id,
      label: meeting.title || 'Untitled Meeting',
      properties: {
        client_name: meeting.client_name,
        organizer: meeting.organizer,
        meeting_date: meeting.meeting_date,
        meeting_type: meeting.meeting_type,
      },
    })

    if (!meetingNode) continue

    if (meeting.client_name) {
      const { data: clientNode } = await supabase
        .from('chasen_graph_nodes')
        .select('id')
        .eq('entity_type', 'client')
        .ilike('label', meeting.client_name)
        .limit(1)
        .single()

      if (clientNode) {
        await createGraphEdge({
          source_node_id: clientNode.id,
          target_node_id: meetingNode.id,
          edge_type: 'ATTENDED',
          properties: { date: meeting.meeting_date },
        })
      }
    }
    synced++
  }
  return synced
}

async function syncActionsToGraph() {
  console.log('Syncing actions...')
  const { data: actions, error } = await supabase
    .from('actions')
    .select('id, Action_Description, client, Owners, Status, Priority, Due_Date')
    .neq('Status', 'Cancelled')

  if (error || !actions) {
    console.error('Error fetching actions:', error)
    return 0
  }

  let synced = 0
  for (const action of actions) {
    const actionNode = await upsertGraphNode({
      entity_type: 'action',
      entity_id: action.id,
      label: action.Action_Description || 'Untitled Action',
      properties: {
        client: action.client,
        owners: action.Owners,
        status: action.Status,
        priority: action.Priority,
        due_date: action.Due_Date,
      },
    })

    if (!actionNode) continue

    if (action.client) {
      const { data: clientNode } = await supabase
        .from('chasen_graph_nodes')
        .select('id')
        .eq('entity_type', 'client')
        .ilike('label', '%' + action.client + '%')
        .limit(1)
        .single()

      if (clientNode) {
        await createGraphEdge({
          source_node_id: actionNode.id,
          target_node_id: clientNode.id,
          edge_type: 'RELATES_TO',
        })
      }
    }
    synced++
  }
  return synced
}

async function syncNPSToGraph() {
  console.log('Syncing NPS responses...')
  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - 365)

  const { data: npsResponses, error } = await supabase
    .from('nps_responses')
    .select('id, client_name, score, category, feedback, response_date')
    .gte('response_date', sinceDate.toISOString().split('T')[0])

  if (error || !npsResponses) {
    console.error('Error fetching NPS responses:', error)
    return 0
  }

  let synced = 0
  for (const nps of npsResponses) {
    const npsNode = await upsertGraphNode({
      entity_type: 'nps',
      entity_id: nps.id,
      label: `NPS ${nps.score} - ${nps.client_name}`,
      properties: {
        client_name: nps.client_name,
        score: nps.score,
        category: nps.category,
        feedback: nps.feedback?.substring(0, 500),
        response_date: nps.response_date,
      },
    })

    if (!npsNode) continue

    if (nps.client_name) {
      const { data: clientNode } = await supabase
        .from('chasen_graph_nodes')
        .select('id')
        .eq('entity_type', 'client')
        .ilike('label', '%' + nps.client_name + '%')
        .limit(1)
        .single()

      if (clientNode) {
        await createGraphEdge({
          source_node_id: npsNode.id,
          target_node_id: clientNode.id,
          edge_type: 'FEEDBACK_FOR',
          properties: { score: nps.score, category: nps.category },
        })
      }
    }

    synced++
  }

  return synced
}

async function syncSupportCasesToGraph() {
  console.log('Syncing support cases...')
  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - 180)

  const { data: cases, error } = await supabase
    .from('support_case_details')
    .select('id, client_name, case_number, short_description, priority, state, opened_at')
    .gte('opened_at', sinceDate.toISOString())

  if (error || !cases) {
    console.error('Error fetching support cases:', error)
    return 0
  }

  let synced = 0
  for (const supportCase of cases) {
    const caseNode = await upsertGraphNode({
      entity_type: 'support_case',
      entity_id: supportCase.id,
      label: `Case ${supportCase.case_number}: ${supportCase.short_description?.substring(0, 50) || 'No description'}`,
      properties: {
        client_name: supportCase.client_name,
        case_number: supportCase.case_number,
        short_description: supportCase.short_description,
        priority: supportCase.priority,
        state: supportCase.state,
        opened_at: supportCase.opened_at,
      },
    })

    if (!caseNode) continue

    if (supportCase.client_name) {
      const { data: clientNode } = await supabase
        .from('chasen_graph_nodes')
        .select('id')
        .eq('entity_type', 'client')
        .ilike('label', '%' + supportCase.client_name + '%')
        .limit(1)
        .single()

      if (clientNode) {
        await createGraphEdge({
          source_node_id: caseNode.id,
          target_node_id: clientNode.id,
          edge_type: 'CASE_FOR',
          properties: { priority: supportCase.priority, state: supportCase.state },
        })
      }
    }

    synced++
  }

  return synced
}

async function main() {
  console.log('=== ChaSen Knowledge Graph Sync ===\n')

  // Clear existing data
  console.log('Clearing existing graph data...')
  await supabase.from('chasen_graph_edges').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('chasen_graph_nodes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('Cleared.\n')

  const results = {}

  results.clients = await syncClientsToGraph()
  console.log(`✅ Synced ${results.clients} clients\n`)

  results.cses = await syncCSEToGraph()
  console.log(`✅ Synced ${results.cses} CSEs\n`)

  results.stakeholders = await syncStakeholdersToGraph()
  console.log(`✅ Synced ${results.stakeholders} stakeholders\n`)

  results.meetings = await syncMeetingsToGraph()
  console.log(`✅ Synced ${results.meetings} meetings\n`)

  results.actions = await syncActionsToGraph()
  console.log(`✅ Synced ${results.actions} actions\n`)

  results.nps = await syncNPSToGraph()
  console.log(`✅ Synced ${results.nps} NPS responses\n`)

  results.supportCases = await syncSupportCasesToGraph()
  console.log(`✅ Synced ${results.supportCases} support cases\n`)

  // Get final counts
  const { count: nodeCount } = await supabase
    .from('chasen_graph_nodes')
    .select('*', { count: 'exact', head: true })
  const { count: edgeCount } = await supabase
    .from('chasen_graph_edges')
    .select('*', { count: 'exact', head: true })

  // Get node type breakdown
  const { data: nodes } = await supabase
    .from('chasen_graph_nodes')
    .select('entity_type')

  const typeCounts = {}
  nodes?.forEach(n => {
    typeCounts[n.entity_type] = (typeCounts[n.entity_type] || 0) + 1
  })

  console.log('=== Sync Complete ===')
  console.log(`Total nodes: ${nodeCount}`)
  console.log(`Total edges: ${edgeCount}`)
  console.log('\nNodes by type:')
  Object.entries(typeCounts).forEach(([type, count]) => {
    console.log(`  - ${type}: ${count}`)
  })
}

main().catch(console.error)
