# NextGen Duplicate Migration SQL Comparison — Step 3

Status: read-only SQL comparison; documentation committed to audit branch only  
Branch: audit/migration-reconciliation  
No database changes and no migration files deleted or rewritten.

## Result

All four duplicate-looking pairs were fetched from GitHub and compared after whitespace normalization. Each pair has identical SQL statements; file lengths differ only by a trailing newline / whitespace.

| Pair | SQL comparison | Canonical history reference |
|---|---|---|
| 20261030092920 vs 20261030093128 — approval/scheduling | Identical | Production version 20261030093128; Staging migration name embeds 20261030093128 |
| 20261030093010 vs 20261030093508 — updated_at search_path | Identical | Production version 20261030093508; Staging migration name embeds 20261030093508 |
| 20261030093055 vs 20261030093539 — server-worker publishing guard | Identical | Production version 20261030093539; Staging migration name embeds 20261030093539 |
| 20261030093620 vs 20261030093647 — client-side published guard | Identical | Production version 20261030093647; Staging migration name embeds 20261030093647 |

## Recommendation

- Retain the four migration files whose versions match Production's recorded migration versions:
  - 20261030093128_add_nextgen_audited_approval_and_safe_scheduling.sql
  - 20261030093508_harden_nextgen_updated_at_function_search_path.sql
  - 20261030093539_restrict_publishing_job_execution_to_server_worker.sql
  - 20261030093647_block_client_side_published_content_and_jobs.sql
- Retain the earlier timestamp variants as historical evidence for now. Do not delete them until repository ownership confirms they were never independently deployed or referenced by another environment.
- Do not rename or rewrite applied migration files. Supabase migration history is immutable operational evidence; cleanup should be handled by an explicit documented policy, not by changing history.
- The repository may later designate the four earlier variants as superseded in documentation, but no SQL content should be altered merely to make filenames align.

## Important caveat

Identical SQL text does not prove that two migrations were applied in the same environment or at the same time. Live migration history remains authoritative for each project's applied-version record.

## Safety
This comparison only reads GitHub file contents. No database SQL was executed. No migrations were applied. No UI/design files were touched.
