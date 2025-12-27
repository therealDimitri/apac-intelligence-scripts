/**
 * Client Name Audit Script
 *
 * Analyses all tables with client name columns to identify:
 * 1. Unique client names across all tables
 * 2. Naming inconsistencies (different spellings, cases, formats)
 * 3. Missing references between tables
 * 4. Alias usage and gaps
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function audit() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           CLIENT NAME AUDIT REPORT                             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const clientsByTable = {};
  const allClientNames = new Set();

  // ============================================================
  // 1. COLLECT CLIENT NAMES FROM ALL TABLES
  // ============================================================
  console.log('=== 1. COLLECTING CLIENT NAMES FROM ALL TABLES ===\n');

  // Table: nps_responses (uses client_name)
  const { data: npsResponses } = await supabase
    .from('nps_responses')
    .select('client_name, client_id');
  clientsByTable.nps_responses = {
    column: 'client_name',
    hasClientId: true,
    names: [...new Set(npsResponses?.map(r => r.client_name) || [])],
    clientIds: [...new Set(npsResponses?.filter(r => r.client_id).map(r => r.client_id) || [])]
  };
  clientsByTable.nps_responses.names.forEach(n => allClientNames.add(n));
  console.log(`nps_responses: ${clientsByTable.nps_responses.names.length} unique client names`);

  // Table: nps_clients (uses client_name)
  const { data: npsClients } = await supabase
    .from('nps_clients')
    .select('client_name, segment, parent_client');
  clientsByTable.nps_clients = {
    column: 'client_name',
    hasClientId: false,
    names: [...new Set(npsClients?.map(r => r.client_name) || [])],
    segments: npsClients?.reduce((acc, c) => { acc[c.client_name] = c.segment; return acc; }, {}) || {},
    parents: npsClients?.reduce((acc, c) => { if(c.parent_client) acc[c.client_name] = c.parent_client; return acc; }, {}) || {}
  };
  clientsByTable.nps_clients.names.forEach(n => allClientNames.add(n));
  console.log(`nps_clients: ${clientsByTable.nps_clients.names.length} unique client names`);

  // Table: client_segmentation (uses client_name)
  const { data: segmentation } = await supabase
    .from('client_segmentation')
    .select('client_name, client_id, tier_id, cse_name');
  clientsByTable.client_segmentation = {
    column: 'client_name',
    hasClientId: true,
    names: [...new Set(segmentation?.map(r => r.client_name) || [])],
    clientIds: [...new Set(segmentation?.filter(r => r.client_id).map(r => r.client_id) || [])]
  };
  clientsByTable.client_segmentation.names.forEach(n => allClientNames.add(n));
  console.log(`client_segmentation: ${clientsByTable.client_segmentation.names.length} unique client names`);

  // Table: unified_meetings (uses client_name)
  const { data: meetings } = await supabase
    .from('unified_meetings')
    .select('client_name, client_id');
  clientsByTable.unified_meetings = {
    column: 'client_name',
    hasClientId: true,
    names: [...new Set(meetings?.map(r => r.client_name) || [])],
    clientIds: [...new Set(meetings?.filter(r => r.client_id).map(r => r.client_id) || [])]
  };
  clientsByTable.unified_meetings.names.forEach(n => allClientNames.add(n));
  console.log(`unified_meetings: ${clientsByTable.unified_meetings.names.length} unique client names`);

  // Table: actions (uses client)
  const { data: actions } = await supabase
    .from('actions')
    .select('client, client_id');
  clientsByTable.actions = {
    column: 'client',
    hasClientId: true,
    names: [...new Set(actions?.map(r => r.client).filter(Boolean) || [])],
    clientIds: [...new Set(actions?.filter(r => r.client_id).map(r => r.client_id) || [])]
  };
  clientsByTable.actions.names.forEach(n => allClientNames.add(n));
  console.log(`actions: ${clientsByTable.actions.names.length} unique client names`);

  // Table: aging_accounts (uses client_name AND client_name_normalized)
  const { data: aging } = await supabase
    .from('aging_accounts')
    .select('client_name, client_name_normalized, client_id');
  clientsByTable.aging_accounts = {
    column: 'client_name',
    hasClientId: true,
    hasNormalized: true,
    names: [...new Set(aging?.map(r => r.client_name) || [])],
    normalizedNames: [...new Set(aging?.map(r => r.client_name_normalized).filter(Boolean) || [])],
    clientIds: [...new Set(aging?.filter(r => r.client_id).map(r => r.client_id) || [])]
  };
  clientsByTable.aging_accounts.names.forEach(n => allClientNames.add(n));
  clientsByTable.aging_accounts.normalizedNames.forEach(n => allClientNames.add(n));
  console.log(`aging_accounts: ${clientsByTable.aging_accounts.names.length} unique client names (${clientsByTable.aging_accounts.normalizedNames.length} normalized)`);

  // Table: portfolio_initiatives (uses client_name)
  const { data: initiatives } = await supabase
    .from('portfolio_initiatives')
    .select('client_name');
  clientsByTable.portfolio_initiatives = {
    column: 'client_name',
    hasClientId: false,
    names: [...new Set(initiatives?.map(r => r.client_name) || [])]
  };
  clientsByTable.portfolio_initiatives.names.forEach(n => allClientNames.add(n));
  console.log(`portfolio_initiatives: ${clientsByTable.portfolio_initiatives.names.length} unique client names`);

  // Table: client_health_history (uses client_name)
  const { data: healthHistory } = await supabase
    .from('client_health_history')
    .select('client_name');
  clientsByTable.client_health_history = {
    column: 'client_name',
    hasClientId: false,
    names: [...new Set(healthHistory?.map(r => r.client_name) || [])]
  };
  clientsByTable.client_health_history.names.forEach(n => allClientNames.add(n));
  console.log(`client_health_history: ${clientsByTable.client_health_history.names.length} unique client names`);

  // Table: health_status_alerts (uses client_name)
  const { data: alerts } = await supabase
    .from('health_status_alerts')
    .select('client_name');
  clientsByTable.health_status_alerts = {
    column: 'client_name',
    hasClientId: false,
    names: [...new Set(alerts?.map(r => r.client_name) || [])]
  };
  clientsByTable.health_status_alerts.names.forEach(n => allClientNames.add(n));
  console.log(`health_status_alerts: ${clientsByTable.health_status_alerts.names.length} unique client names`);

  // Table: chasen_folders (uses client_name)
  const { data: folders } = await supabase
    .from('chasen_folders')
    .select('client_name');
  clientsByTable.chasen_folders = {
    column: 'client_name',
    hasClientId: false,
    names: [...new Set(folders?.map(r => r.client_name).filter(Boolean) || [])]
  };
  clientsByTable.chasen_folders.names.forEach(n => allClientNames.add(n));
  console.log(`chasen_folders: ${clientsByTable.chasen_folders.names.length} unique client names`);

  // Table: chasen_conversations (uses client_name - optional)
  const { data: conversations } = await supabase
    .from('chasen_conversations')
    .select('client_name');
  clientsByTable.chasen_conversations = {
    column: 'client_name',
    hasClientId: false,
    names: [...new Set(conversations?.map(r => r.client_name).filter(Boolean) || [])]
  };
  clientsByTable.chasen_conversations.names.forEach(n => allClientNames.add(n));
  console.log(`chasen_conversations: ${clientsByTable.chasen_conversations.names.length} unique client names`);

  // ============================================================
  // 2. ANALYSE ALIAS TABLES
  // ============================================================
  console.log('\n=== 2. ANALYSING ALIAS TABLES ===\n');

  // Table: client_aliases (display_name -> canonical_name)
  const { data: aliases } = await supabase
    .from('client_aliases')
    .select('*');

  console.log(`client_aliases: ${aliases?.length || 0} entries`);
  if (aliases?.length) {
    console.log('\nAlias mappings:');
    aliases.forEach(a => {
      console.log(`   "${a.display_name}" → "${a.canonical_name}"`);
    });
  }

  // Table: client_name_aliases (used for health scores)
  const { data: nameAliases } = await supabase
    .from('client_name_aliases')
    .select('*');

  console.log(`\nclient_name_aliases: ${nameAliases?.length || 0} entries`);
  if (nameAliases?.length) {
    console.log('\nName alias mappings:');
    nameAliases.forEach(a => {
      console.log(`   "${a.display_name}" → "${a.canonical_name}"`);
    });
  }

  // ============================================================
  // 3. IDENTIFY INCONSISTENCIES
  // ============================================================
  console.log('\n=== 3. IDENTIFYING INCONSISTENCIES ===\n');

  const allNamesArray = [...allClientNames].filter(Boolean).sort();
  console.log(`Total unique client names across all tables: ${allNamesArray.length}\n`);

  // Group similar names (case-insensitive, ignoring common suffixes)
  const normalizeForComparison = (name) => {
    return name
      .toLowerCase()
      .replace(/\s*(pty\.?\s*ltd\.?|ltd\.?|inc\.?|corp\.?|limited|pte\.?\s*ltd\.?)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const nameGroups = {};
  allNamesArray.forEach(name => {
    const normalized = normalizeForComparison(name);
    if (!nameGroups[normalized]) {
      nameGroups[normalized] = [];
    }
    nameGroups[normalized].push(name);
  });

  // Find groups with multiple variations
  const inconsistentNames = Object.entries(nameGroups)
    .filter(([, variants]) => variants.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  if (inconsistentNames.length > 0) {
    console.log('🔴 NAMING INCONSISTENCIES DETECTED:\n');
    inconsistentNames.forEach(([normalized, variants]) => {
      console.log(`   "${normalized}" has ${variants.length} variations:`);
      variants.forEach(v => {
        const tables = Object.entries(clientsByTable)
          .filter(([, data]) => data.names.includes(v))
          .map(([table]) => table);
        console.log(`      - "${v}" (used in: ${tables.join(', ')})`);
      });
      console.log('');
    });
  } else {
    console.log('✅ No obvious naming inconsistencies detected');
  }

  // ============================================================
  // 4. CHECK FOR ORPHANED REFERENCES
  // ============================================================
  console.log('\n=== 4. CHECKING FOR ORPHANED REFERENCES ===\n');

  // Check if nps_responses client names exist in nps_clients
  const npsClientSet = new Set(clientsByTable.nps_clients.names);
  const orphanedNpsResponses = clientsByTable.nps_responses.names.filter(n => !npsClientSet.has(n));
  if (orphanedNpsResponses.length > 0) {
    console.log(`🔴 nps_responses with no matching nps_clients entry:`);
    orphanedNpsResponses.forEach(n => console.log(`   - "${n}"`));
  } else {
    console.log('✅ All nps_responses have matching nps_clients entries');
  }

  // Check if client_segmentation names exist in nps_clients
  const orphanedSegmentation = clientsByTable.client_segmentation.names.filter(n => !npsClientSet.has(n));
  if (orphanedSegmentation.length > 0) {
    console.log(`\n🔴 client_segmentation with no matching nps_clients entry:`);
    orphanedSegmentation.forEach(n => console.log(`   - "${n}"`));
  } else {
    console.log('\n✅ All client_segmentation entries have matching nps_clients');
  }

  // ============================================================
  // 5. CHECK client_id USAGE
  // ============================================================
  console.log('\n=== 5. CLIENT_ID USAGE ANALYSIS ===\n');

  for (const [table, data] of Object.entries(clientsByTable)) {
    if (data.hasClientId) {
      const withId = data.clientIds?.length || 0;
      const total = data.names.length;
      const percentage = total > 0 ? Math.round((withId / total) * 100) : 0;
      const status = percentage === 100 ? '✅' : percentage > 0 ? '⚠️' : '🔴';
      console.log(`${status} ${table}: ${withId}/${total} rows have client_id (${percentage}%)`);
    }
  }

  // ============================================================
  // 6. FULL CLIENT NAME INVENTORY
  // ============================================================
  console.log('\n=== 6. FULL CLIENT NAME INVENTORY ===\n');

  console.log('All unique client names and where they appear:\n');
  allNamesArray.forEach(name => {
    const tables = Object.entries(clientsByTable)
      .filter(([, data]) => data.names.includes(name) || data.normalizedNames?.includes(name))
      .map(([table]) => table);
    console.log(`"${name}"`);
    console.log(`   Tables: ${tables.join(', ')}`);

    // Check alias coverage
    const hasAlias = aliases?.some(a => a.display_name === name || a.canonical_name === name);
    const hasNameAlias = nameAliases?.some(a => a.display_name === name || a.canonical_name === name);
    if (hasAlias || hasNameAlias) {
      console.log(`   Aliases: ${hasAlias ? 'client_aliases' : ''} ${hasNameAlias ? 'client_name_aliases' : ''}`);
    }
    console.log('');
  });

  // ============================================================
  // 7. SUMMARY & RECOMMENDATIONS
  // ============================================================
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('📊 Statistics:');
  console.log(`   - Total unique client names: ${allNamesArray.length}`);
  console.log(`   - Tables with client references: ${Object.keys(clientsByTable).length}`);
  console.log(`   - Naming inconsistencies: ${inconsistentNames.length}`);
  console.log(`   - Alias entries (client_aliases): ${aliases?.length || 0}`);
  console.log(`   - Alias entries (client_name_aliases): ${nameAliases?.length || 0}`);

  console.log('\n🔧 Key Issues:');
  console.log('   1. Two separate alias tables with overlapping purposes');
  console.log('   2. Inconsistent column naming (client vs client_name)');
  console.log('   3. Partial client_id adoption across tables');
  console.log('   4. No single source of truth for client master data');
  console.log('   5. Parent/child relationships only in nps_clients');
}

audit().catch(console.error);
