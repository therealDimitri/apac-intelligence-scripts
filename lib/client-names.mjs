/**
 * Canonical Client Name Mappings
 *
 * Single source of truth for BURC Excel client code → display name resolution.
 * Used during Excel parsing where DB access isn't practical.
 *
 * For runtime resolution from arbitrary strings, use the `resolve_client_name()`
 * RPC or the `client_name_aliases` table (seeded by seed-client-name-aliases.mjs).
 */

/** BURC Maint Pivot client codes → display names */
export const BURC_CLIENT_NAMES = {
  'AWH': 'Albury Wodonga Health',
  'BWH': 'Barwon Health',
  'EPH': 'Epworth Healthcare',
  'GHA': 'Gippsland Health Alliance (GHA)',
  'GHRA': 'Gippsland Health Alliance (GHA)',
  'MAH': 'Mount Alvernia Hospital',
  'NCS': 'NCS/MinDef Singapore',
  'RVEEH': 'Royal Victorian Eye and Ear Hospital',
  'SA Health': 'SA Health',
  'WA Health': 'WA Health',
  'SLMC': "St Luke's Medical Center",
  'Parkway': 'Parkway (Churned)',
  'GRMC': 'Guam Regional Medical City (GRMC)',
  'Western Health': 'Western Health',
  'RBWH': 'Royal Brisbane Hospital',
  'Sing Health': 'SingHealth',
  'SingHealth': 'SingHealth',
  'Waikato': 'Waikato District Health Board',
  'Lost': 'Lost Revenue',
}
