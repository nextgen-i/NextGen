# NextGen Exact OAuth Vault Schema and Access Audit — Step 19

Date: 2026-11-08
Branch: `audit/migration-reconciliation`
Status: read-only metadata audit; no database changes

## 1. Scope and method

Inspected Production (`vexntvbufnawtxszslsz`) and Staging (`wrwumlpobgcoxlngkvds`) using metadata-only SQL and Supabase table metadata. Queries inspected column definitions, constraints, indexes, triggers, RLS flags/policies, schema/table access checks, channel relationships and public table structures.

**No token rows, encrypted token values, OAuth credentials, API keys, or user secrets were selected.** No DDL/DML, grants, revokes, migration, function deployment, or configuration changes were performed.

## 2. Production: exact token vault table

Table: `private.platform_oauth_tokens`
Owner: `postgres`
RLS: enabled
FORCE RLS: disabled
RLS policies: none
User triggers: none

### Columns observed

| Position | Column | Type | Nullable | Default |
|---:|---|---|---|---|
| 1 | id | uuid | no | gen_random_uuid() |
| 2 | owner_id | uuid | no | — |
| 3 | platform | text | no | — |
| 4 | platform_user_id | text | no | — |
| 5 | display_name | text | yes | — |
| 6 | handle | text | yes | — |
| 7 | encrypted_access_token | text | no | — |
| 8 | encrypted_refresh_token | text | yes | — |
| 9 | token_expires_at | timestamptz | yes | — |
| 10 | scopes | text[] | no | '{}' |
| 11 | token_metadata | jsonb | no | '{}' |
| 12 | created_at | timestamptz | no | now() |
| 13 | updated_at | timestamptz | no | now() |

### Constraints

- Primary key: `id`.
- Owner FK: `owner_id REFERENCES auth.users(id) ON DELETE CASCADE`.
- Unique: `(owner_id, platform, platform_user_id)`.
- Platform CHECK allows exactly: instagram, facebook, threads, youtube.
- No channel_id column or FK exists in this vault table.
- No FK to `public.channels` exists.

### Indexes

- Unique btree index on `(owner_id, platform, platform_user_id)`.
- Primary-key btree index on `id`.
- No other indexes were observed.

### Access

- `anon`: no schema USAGE and no table SELECT/INSERT/UPDATE/DELETE.
- `authenticated`: no schema USAGE and no table SELECT/INSERT/UPDATE/DELETE.
- `service_role`: schema USAGE; table SELECT/INSERT/UPDATE/DELETE.
- `postgres`: owner-level access.
- PUBLIC: no schema USAGE and no table access.
- RLS is enabled with no policies, consistent with service-side-only access for ordinary application roles. The table is not FORCE RLS; privileged service_role access bypasses RLS by design.

Operational note: PostgreSQL administrative roles such as `pg_read_all_data` / Supabase internal admin roles may have elevated access. This is a privileged operator boundary, not an application-user grant; ensure operational access and audit logs are restricted.

## 3. Encryption metadata gap

The current vault has two encrypted token text columns, but no explicit fields for:
- AES-GCM nonce/IV or authenticated-ciphertext format,
- wrapped DEK,
- algorithm identifier,
- envelope format version,
- KMS key resource/version,
- AAD version,
- refresh generation / refresh lease coordination,
- explicit refresh-token expiry,
- revocation timestamp / lifecycle state.

The existing `token_metadata` JSONB column is not proof that these fields are present or consistently populated. Its contents were not read. Do not assume it can safely substitute for typed, validated envelope metadata without inspecting application code and a separately approved format.

**Important:** Existing encrypted token strings cannot be assumed to be compatible with the Step 16 AES-256-GCM envelope design. Do not rewrite, reinterpret, or delete them. First identify the current encryption implementation and whether any live records exist using safe aggregate metadata only.

## 4. Production channel relationship

Production `public.channels` uses:
- `id uuid` primary key,
- `owner_id uuid`,
- `platform text`,
- `external_channel_id text` nullable,
- `display_name`, `handle`, `profile_url`,
- `connection_status` and other UI metadata.

Its owner FK references `auth.users(id)`. A composite key `(id, owner_id)` is referenced by content and publishing tables to enforce owner/channel matching.

The OAuth vault does **not** currently reference `channels`. It instead identifies the provider account with `platform` and `platform_user_id`. Step 17's suggested channel_id addition is therefore not a simple extension of an existing FK; it requires a deliberate relationship decision.

Recommended design direction for review (not applied): keep the provider credential identity anchored to `owner_id + platform + platform_user_id`, and only associate it to a NextGen channel through a separately reviewed owner-matching relation. Do not add a direct FK until multi-channel/account mapping and duplicate account behavior are decided.

## 5. Staging findings

- No `nextgen_private.platform_oauth_tokens` table exists.
- No `nextgen_private.oauth_transactions` table exists.
- No matching vault/state columns, constraints, indexes, triggers, or RLS table metadata were found.
- `nextgen_private` schema exists and is not in the Data API exposed-schema list per Step 5.
- `authenticated` currently has schema USAGE on `nextgen_private`, but no table exists there to grant access to. This USAGE is part of the previously audited private RPC wrapper architecture; do not revoke it without checking all function dependencies.
- `anon` has no schema USAGE.
- `service_role` currently has no schema USAGE in the inspected Staging schema; the eventual token service access model must be designed explicitly rather than assuming Production grants exist in Staging.
- Staging `public.channels` also uses UUID id/owner_id and an owner FK to auth.users; related content/analytics tables use composite owner/channel references.

## 6. Migration implications

1. **Do not create a new Production vault table.** Production already has a token vault with a live schema and platform uniqueness constraint.
2. **Do not blindly add channel_id.** Current token vault intentionally keys provider account identity by owner/platform/platform_user_id; NextGen channel association is a separate design decision.
3. **Do not rename owner_id to owner_user_id.** Existing code/schema compatibility must be preserved unless a separate migration is approved.
4. **Additive envelope metadata is likely required**, but exact columns and compatibility depend on the current encryption implementation and existing token records.
5. **Staging requires a new private vault/state design**, but service access grants and function runtime identity must be settled first.
6. **OAuth state table is absent in both environments** and should be a separate private, short-lived, one-time transaction store.
7. The Production vault's existing unique constraint should be preserved unless multi-account behavior requires a carefully designed alternative.
8. No executable migration should be generated until code dependencies and the current token encryption/decryption format are identified.

## 7. Remaining blockers

- Inspect the actual encryption/decryption code paths and all readers/writers of `private.platform_oauth_tokens`; no results were returned by the connected GitHub default-branch code search for the table/column names, which does not prove that the audit branch, deployed code, or external services have no references.
- Confirm whether Production currently contains any vault rows using a safe count only, if this is necessary and approved; do not inspect values.
- Determine the current ciphertext encoding/algorithm and key source without printing secrets.
- Decide if one provider identity can map to multiple NextGen channel records.
- Define Staging trusted server access without giving browser roles vault privileges.
- Confirm KMS authentication and key separation before generating an executable schema migration.

## 8. Non-changes

- No table, column, index, constraint, trigger, policy, grant, revoke, or schema was changed.
- No token rows or encrypted token values were read.
- No OAuth state rows were created.
- No secrets, API keys, client secrets, or KMS resources were accessed or changed.
- No Edge Function, OAuth client, redirect URI, frontend, or Master Design v32 was changed.
- No Production or Staging deployment occurred.
