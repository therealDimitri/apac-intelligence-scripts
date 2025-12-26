import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function reviewData() {
  console.log('=== Data Connections Review ===\n');

  // 1. ChaSen Knowledge
  console.log('1. CHASEN KNOWLEDGE TABLE:');
  const { data: knowledge, error: knowledgeError } = await supabase
    .from('chasen_knowledge')
    .select('category, knowledge_key, is_active')
    .order('category');

  if (knowledgeError) {
    console.log('   Error:', knowledgeError.message);
  } else {
    console.log('   Total entries:', knowledge?.length);
    const categories = [...new Set(knowledge?.map(k => k.category))];
    console.log('   Categories:', categories.join(', '));
    const active = knowledge?.filter(k => k.is_active).length;
    console.log('   Active:', active, '| Inactive:', knowledge?.length - active);
  }

  // 2. ChaSen Profiles
  console.log('\n2. CHASEN PROFILES TABLE:');
  const { data: profiles, error: profilesError } = await supabase
    .from('chasen_profiles')
    .select('user_id, display_name, is_active');

  if (profilesError) {
    console.log('   Error:', profilesError.message);
  } else {
    console.log('   Total profiles:', profiles?.length);
    profiles?.forEach(p => console.log('   -', p.display_name, '| Active:', p.is_active));
  }

  // 3. ChaSen Learning
  console.log('\n3. CHASEN LEARNING TABLES:');
  const { data: learningTopics, error: topicsError } = await supabase
    .from('chasen_learning_topics')
    .select('*');

  if (topicsError) {
    console.log('   Topics Error:', topicsError.message);
  } else {
    console.log('   Learning Topics:', learningTopics?.length);
    learningTopics?.forEach(t => console.log('   -', t.topic_name, '| Category:', t.category));
  }

  const { data: learningProgress, error: progressError } = await supabase
    .from('chasen_learning_progress')
    .select('*');

  if (progressError) {
    console.log('   Progress Error:', progressError.message);
  } else {
    console.log('   Learning Progress entries:', learningProgress?.length);
  }

  // 4. Client consistency
  console.log('\n4. CLIENT DATA CONSISTENCY:');
  const { data: healthClients } = await supabase
    .from('client_health_summary')
    .select('client_name');

  const { data: npsClients } = await supabase
    .from('nps_clients')
    .select('client_name');

  const healthNames = new Set(healthClients?.map(c => c.client_name));
  const npsNames = new Set(npsClients?.map(c => c.client_name));

  console.log('   Clients in health_summary:', healthNames.size);
  console.log('   Clients in nps_clients:', npsNames.size);

  // Check for mismatches
  const inHealthNotNPS = [...healthNames].filter(n => !npsNames.has(n));
  const inNPSNotHealth = [...npsNames].filter(n => !healthNames.has(n));

  if (inHealthNotNPS.length > 0) {
    console.log('   ⚠️  In health_summary but NOT in nps_clients:');
    inHealthNotNPS.forEach(n => console.log('     -', n));
  }
  if (inNPSNotHealth.length > 0) {
    console.log('   ⚠️  In nps_clients but NOT in health_summary:');
    inNPSNotHealth.forEach(n => console.log('     -', n));
  }

  // 5. NPS Responses
  console.log('\n5. NPS RESPONSES CLIENT NAMES:');
  const { data: npsResponses } = await supabase
    .from('nps_responses')
    .select('client_name');

  const responseNames = [...new Set(npsResponses?.map(r => r.client_name))];
  console.log('   Unique client names in responses:', responseNames.length);

  // Find unmatched
  const unmatchedResponses = responseNames.filter(n => !npsNames.has(n));
  if (unmatchedResponses.length > 0) {
    console.log('   ⚠️  Response names NOT in nps_clients (may need aliases):');
    unmatchedResponses.forEach(n => console.log('     -', n));
  } else {
    console.log('   ✓ All response names have matching nps_clients entries or aliases');
  }

  // 6. Aliases coverage
  console.log('\n6. CLIENT ALIASES:');
  const { data: aliases } = await supabase
    .from('client_name_aliases')
    .select('canonical_name, display_name, is_active')
    .eq('is_active', true);

  console.log('   Active aliases:', aliases?.length);
  const canonicalNames = [...new Set(aliases?.map(a => a.canonical_name))];
  console.log('   Unique canonical names:', canonicalNames.length);

  // Check if all response names are covered by aliases
  const allAliasNames = new Set([
    ...aliases?.map(a => a.canonical_name) || [],
    ...aliases?.map(a => a.display_name) || []
  ]);

  const responsesWithoutAlias = responseNames.filter(n => !allAliasNames.has(n) && !npsNames.has(n));
  if (responsesWithoutAlias.length > 0) {
    console.log('   ⚠️  Response names without alias or nps_client entry:');
    responsesWithoutAlias.forEach(n => console.log('     -', n));
  }

  // 7. Aging Accounts
  console.log('\n7. AGING ACCOUNTS:');
  const { data: agingAccounts } = await supabase
    .from('aging_accounts')
    .select('client_name, client_name_normalized');

  const agingNames = [...new Set(agingAccounts?.map(a => a.client_name))];
  const agingNormalized = [...new Set(agingAccounts?.map(a => a.client_name_normalized).filter(Boolean))];
  console.log('   Unique client names:', agingNames.length);
  console.log('   Unique normalized names:', agingNormalized.length);

  // Check if normalized names match nps_clients
  const agingNotInNPS = agingNormalized.filter(n => !npsNames.has(n));
  if (agingNotInNPS.length > 0) {
    console.log('   ⚠️  Normalized names NOT in nps_clients:');
    agingNotInNPS.forEach(n => console.log('     -', n));
  }

  // 8. Compliance
  console.log('\n8. COMPLIANCE DATA:');
  const { data: complianceData } = await supabase
    .from('event_compliance_summary')
    .select('client_name, year');

  const complianceClients = [...new Set(complianceData?.map(c => c.client_name))];
  console.log('   Unique clients in event_compliance_summary:', complianceClients.length);

  const complianceNotInNPS = complianceClients.filter(n => !npsNames.has(n));
  if (complianceNotInNPS.length > 0) {
    console.log('   ⚠️  Compliance clients NOT in nps_clients:');
    complianceNotInNPS.forEach(n => console.log('     -', n));
  }

  // 9. Meetings
  console.log('\n9. UNIFIED MEETINGS:');
  const { data: meetings } = await supabase
    .from('unified_meetings')
    .select('client_name');

  const meetingClients = [...new Set(meetings?.map(m => m.client_name))];
  console.log('   Unique clients in meetings:', meetingClients.length);

  const meetingsNotInNPS = meetingClients.filter(n => !npsNames.has(n) && !allAliasNames.has(n));
  if (meetingsNotInNPS.length > 0) {
    console.log('   ⚠️  Meeting clients NOT in nps_clients or aliases:');
    meetingsNotInNPS.slice(0, 10).forEach(n => console.log('     -', n));
    if (meetingsNotInNPS.length > 10) {
      console.log('     ... and', meetingsNotInNPS.length - 10, 'more');
    }
  }

  // 10. Actions
  console.log('\n10. ACTIONS:');
  const { data: actions } = await supabase
    .from('actions')
    .select('client');

  const actionClients = [...new Set(actions?.map(a => a.client).filter(Boolean))];
  console.log('   Unique clients in actions:', actionClients.length);

  const actionsNotInNPS = actionClients.filter(n => !npsNames.has(n) && !allAliasNames.has(n));
  if (actionsNotInNPS.length > 0) {
    console.log('   ⚠️  Action clients NOT in nps_clients or aliases:');
    actionsNotInNPS.slice(0, 10).forEach(n => console.log('     -', n));
    if (actionsNotInNPS.length > 10) {
      console.log('     ... and', actionsNotInNPS.length - 10, 'more');
    }
  }

  // 11. Notifications
  console.log('\n11. NOTIFICATIONS:');
  const { data: notifications, error: notifError } = await supabase
    .from('notifications')
    .select('id, type, title, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (notifError) {
    console.log('   Error:', notifError.message);
  } else {
    console.log('   Recent notifications:', notifications?.length);
    notifications?.forEach(n => console.log('   -', n.type, '|', n.title?.substring(0, 50)));
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log('ChaSen Knowledge:', knowledge?.length || 0, 'entries');
  console.log('ChaSen Profiles:', profiles?.length || 0, 'profiles');
  console.log('ChaSen Learning Topics:', learningTopics?.length || 0, 'topics');
  console.log('NPS Clients:', npsNames.size);
  console.log('Aliases:', aliases?.length || 0);
  console.log('NPS Response Names:', responseNames.length);
  console.log('Compliance Clients:', complianceClients.length);
  console.log('Meeting Clients:', meetingClients.length);
  console.log('Action Clients:', actionClients.length);
}

reviewData().catch(console.error);
