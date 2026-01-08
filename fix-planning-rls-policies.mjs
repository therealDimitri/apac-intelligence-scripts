import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://usoyxsunetvxdjdglkmn.supabase.co',
  'sb_secret_tg9qhHtwhKS0rPe_FUgzKA_nOyqLAas'
);

async function fixRLSPolicies() {
  console.log('Fixing RLS policies for planning tables...\n');

  // Drop and recreate policies with proper permissions
  const sql = `
    -- Territory Strategies - Enable full access
    ALTER TABLE territory_strategies ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Allow all for territory_strategies" ON territory_strategies;
    DROP POLICY IF EXISTS "Allow select for territory_strategies" ON territory_strategies;
    DROP POLICY IF EXISTS "Allow insert for territory_strategies" ON territory_strategies;
    DROP POLICY IF EXISTS "Allow update for territory_strategies" ON territory_strategies;
    DROP POLICY IF EXISTS "Allow delete for territory_strategies" ON territory_strategies;

    CREATE POLICY "Allow all for territory_strategies" ON territory_strategies
      FOR ALL
      USING (true)
      WITH CHECK (true);

    -- Account Plans - Enable full access
    ALTER TABLE account_plans ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Allow all for account_plans" ON account_plans;
    DROP POLICY IF EXISTS "Allow select for account_plans" ON account_plans;
    DROP POLICY IF EXISTS "Allow insert for account_plans" ON account_plans;
    DROP POLICY IF EXISTS "Allow update for account_plans" ON account_plans;
    DROP POLICY IF EXISTS "Allow delete for account_plans" ON account_plans;

    CREATE POLICY "Allow all for account_plans" ON account_plans
      FOR ALL
      USING (true)
      WITH CHECK (true);
  `;

  try {
    // Execute via direct PostgreSQL connection
    const { data, error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
      console.log('RPC method not available, trying alternative approach...');

      // Try each statement separately via REST
      const statements = [
        // Territory strategies
        `ALTER TABLE territory_strategies ENABLE ROW LEVEL SECURITY`,
        `DROP POLICY IF EXISTS "Allow all for territory_strategies" ON territory_strategies`,
        `CREATE POLICY "Allow all for territory_strategies" ON territory_strategies FOR ALL USING (true) WITH CHECK (true)`,
        // Account plans
        `ALTER TABLE account_plans ENABLE ROW LEVEL SECURITY`,
        `DROP POLICY IF EXISTS "Allow all for account_plans" ON account_plans`,
        `CREATE POLICY "Allow all for account_plans" ON account_plans FOR ALL USING (true) WITH CHECK (true)`,
      ];

      console.log('\nPlease run the following SQL in Supabase SQL Editor:\n');
      console.log('---');
      console.log(sql);
      console.log('---');

      console.log('\n⚠️ Cannot execute SQL directly. Please run the above in Supabase Dashboard.');
      console.log('Go to: https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql/new');
    } else {
      console.log('✅ RLS policies updated successfully');
    }
  } catch (err) {
    console.error('Error:', err.message);

    console.log('\n📋 Manual SQL to run in Supabase Dashboard:\n');
    console.log(sql);
  }
}

fixRLSPolicies();
