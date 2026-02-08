/**
 * Centralised client name resolver for sync scripts.
 *
 * Queries `client_name_aliases` at startup to build a display_name → canonical_name map.
 * Scripts call `resolveClientName(sheetName)` instead of maintaining hardcoded maps.
 *
 * Usage:
 *   import { createClientNameResolver } from './lib/resolve-client-names.mjs'
 *   const resolve = await createClientNameResolver(supabase)
 *   const dbName = resolve('GHA') // → 'Gippsland Health Alliance (GHA)'
 */

/**
 * Fetch all active aliases from the database and return a resolver function.
 * Falls back to the raw input name when no alias exists.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Record<string, string>} [hardcodedFallback] — legacy map used when DB fetch fails
 * @returns {Promise<(sheetName: string) => string>}
 */
export async function createClientNameResolver(supabase, hardcodedFallback = {}) {
  const aliasMap = new Map()

  try {
    const { data, error } = await supabase
      .from('client_name_aliases')
      .select('display_name, canonical_name')
      .eq('is_active', true)

    if (error) throw error

    for (const row of data || []) {
      aliasMap.set(row.display_name, row.canonical_name)
    }

    console.log(`  ✅ Loaded ${aliasMap.size} client name aliases from database`)
  } catch (err) {
    console.warn(`  ⚠️  Failed to load aliases from DB: ${err.message}`)
    console.warn(`  ⚠️  Falling back to hardcoded map (${Object.keys(hardcodedFallback).length} entries)`)

    for (const [key, value] of Object.entries(hardcodedFallback)) {
      aliasMap.set(key, value)
    }
  }

  return function resolveClientName(sheetName) {
    return aliasMap.get(sheetName) || sheetName
  }
}
