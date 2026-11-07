# NextGen Migration Inventory — Step 2

Status: read-only inventory, branch-only documentation  
Branch: audit/migration-reconciliation  
No database writes or schema changes were performed.

## Live migration history comparison

| Logical migration | Production | Staging | GitHub migration file |
|---|---|---|---|
| Core workspace schema | 20261027094432 | 20261031085518 (name embeds original version) | Present |
| Content/channel owner match | 20261027095520 | 20261031085524 | Present |
| Secure platform connections | 20261027223652 | 20261031085529 | Present |
| Content/publishing/analytics schema | 20261030092814 | 20261031085533 | Present |
| Owner policies and FK indexes | 20261030092835 | 20261031085537 | Present |
| Audited approval/scheduling | 20261030093128 | 20261031085542 | Present, but repo also contains an earlier duplicate-looking 20261030092920 file |
| Updated-at search_path hardening | 20261030093508 | 20261031085548 | Present, plus earlier 20261030093010 duplicate-looking file |
| Server-worker-only publishing execution | 20261030093539 | 20261031085554 | Present, plus earlier 20261030093055 duplicate-looking file |
| Block client-side published content/jobs | 20261030093647 | 20261031085558 | Present, plus earlier 20261030093620 duplicate-looking file |
| Approval queue / connection hardening | 20261031064935 | 20261031085602 | Present |
| Browser table privileges | 20261031065025 | 20261031085615 | Present |
| Audited queue cancellation | 20261103024428 | 20261031085620 (name embeds 20261031130000) | Present as 20261031130000 file; SQL/function signature differs from Production live function |
| Move privileged RPCs to private schema | Not recorded | 20261031085624 (name embeds 20261031140000) | Missing |
| Safe scheduled-content cancellation (Production version) | 20261103024428 | Not recorded under same version/name | No exact matching file established |
| Safe channel removal | 20261103024715 | Not recorded | Missing |
| Private platform OAuth token vault | 20261107051157 | Not recorded | Missing |
| Three channel groups and others | Not recorded | 20261106023029 | Missing |

## Repository inventory findings

The GitHub migration directory currently contains 16 SQL files. Four pairs are duplicate-looking historical variants that require SQL-body comparison before any file is removed or treated as superseded:
- 20261030092920 vs 20261030093128 (approval/scheduling)
- 20261030093010 vs 20261030093508 (updated_at search_path)
- 20261030093055 vs 20261030093539 (server-worker publishing execution)
- 20261030093620 vs 20261030093647 (client-side publishing guard)

Do not delete these files during reconciliation. Their timestamp differences and contents must be checked against live schema state and migration history.

## Main drift items

1. Staging uses rebased/renumbered migration-history versions for the first 12 logical migrations; its migration names preserve the original migration filenames.
2. Staging has the private-RPC move migration, which Production does not record.
3. Production has three migrations not represented in Staging history: safe scheduled-content cancellation, safe channel removal, and private OAuth token vault.
4. Staging has a three-channel-groups migration not represented in Production history.
5. The audited cancellation SQL file in GitHub does not match Production's live cancellation function signature/implementation exactly.
6. GitHub's migration directory is not a reliable single source of truth yet. It contains historical duplicates and lacks several live migration files.

## Recommended handling

- Preserve all existing migration files until their SQL bodies are compared.
- Do not replay migrations whose effects already exist in a target database.
- Do not mark migrations as applied merely to make version lists look alike.
- Reconcile by schema/function state and verified SQL content, not by filename or timestamp alone.
- Review Staging's exposed-schema configuration and private-schema grants before adopting its RPC pattern.
- Treat the three-channel-groups migration as a separate feature decision, not automatic schema drift to fix.
- Production backup/PITR verification remains a prerequisite before any Production DDL.

## Safety
This inventory is documentation only. No SQL was executed against either database. No migration was applied. No frontend or design files were changed.
