# APAC Intelligence Scripts

Migration, data synchronisation, and utility scripts for the APAC Client Success Intelligence Hub.

## Overview

This repository is a **git submodule** of [apac-intelligence-v2](https://github.com/therealDimitri/apac-intelligence-v2), mounted at `scripts/`. It contains one-off migration scripts, data import tools, and database utilities.

| Metric | Count |
|--------|-------|
| Total scripts | 388+ |
| Migration scripts (`apply-*`) | 56 |
| Sync scripts (`sync-*`) | 23 |
| Fix scripts (`fix-*`) | 19 |
| Add scripts (`add-*`) | 14 |
| Analysis scripts (`analyse-*`/`analyze-*`) | 10 |

## Prerequisites

- Node.js 20+
- Access to the parent `apac-intelligence-v2` repository
- `.env.local` file in the parent directory with Supabase credentials

## Usage

Scripts are designed to be run from the **parent repository root**:

```bash
# From apac-intelligence-v2/
node scripts/introspect-database-schema.mjs
node scripts/validate-database-columns.mjs
```

Or using npm commands defined in the parent `package.json`:

```bash
npm run introspect-schema
npm run validate-schema
```

## Script Categories

### Core Utilities

| Script | Purpose |
|--------|---------|
| `introspect-database-schema.mjs` | Generate schema docs from live database |
| `validate-database-columns.mjs` | Validate all queries match schema |

### Migration Scripts (`apply-*`)

Database schema migrations. Run once to apply changes:

```bash
node scripts/apply-planning-hub-migration.mjs
node scripts/apply-burc-comprehensive-migration.mjs
```

### Sync Scripts (`sync-*`)

Data synchronisation between sources:

```bash
node scripts/sync-burc-monthly.mjs
node scripts/sync-nps-data.mjs
```

### Fix Scripts (`fix-*`)

One-off data corrections:

```bash
node scripts/fix-client-names.mjs
node scripts/fix-duplicate-meetings.mjs
```

### Analysis Scripts (`analyse-*` / `analyze-*`)

Data analysis and reporting:

```bash
node scripts/analyse-burc-detailed.mjs
node scripts/analyze-retention-base.mjs
```

### Import Scripts (`import-*`)

Bulk data imports from external sources:

```bash
node scripts/import-nps-responses.mjs
node scripts/import-aging-accounts.mjs
```

## Environment Variables

Scripts load environment variables from the parent directory's `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Output Locations

Scripts write output to the parent repository:

| Output Type | Location |
|-------------|----------|
| Schema docs (Markdown) | `docs/database-schema.md` |
| Schema docs (JSON) | `docs/database-schema.json` |
| TypeScript types | `src/types/database.generated.ts` |

## Naming Conventions

| Prefix | Purpose | Example |
|--------|---------|---------|
| `apply-` | Database migration | `apply-health-history-migration.mjs` |
| `sync-` | Data synchronisation | `sync-burc-monthly.mjs` |
| `fix-` | Data correction | `fix-client-names.mjs` |
| `add-` | Add new data/columns | `add-new-team-members.mjs` |
| `import-` | Bulk data import | `import-nps-responses.mjs` |
| `analyse-`/`analyze-` | Data analysis | `analyse-burc-detailed.mjs` |
| `introspect-` | Schema introspection | `introspect-database-schema.mjs` |
| `validate-` | Validation checks | `validate-database-columns.mjs` |

## Related Repositories

| Repository | Purpose |
|------------|---------|
| [apac-intelligence-v2](https://github.com/therealDimitri/apac-intelligence-v2) | Main application (parent) |
| [apac-intelligence-docs](https://github.com/therealDimitri/apac-intelligence-docs) | Documentation |

## Contributing

1. Use the naming conventions above
2. Include a header comment explaining the script's purpose
3. Load environment from parent: `dotenv.config({ path: path.join(__dirname, '..', '.env.local') })`
4. Test with dry-run mode where applicable before running destructive operations
