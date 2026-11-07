# OAuth Token Vault Structure and Edge Function Audit

Date: 2026-11-07
Branch: `audit/migration-reconciliation`

## Production token-vault structure (metadata only)

Production contains `private.platform_oauth_tokens` with these columns:
- `id` uuid primary key, default `gen_random_uuid()`
- `owner_id` uuid, FK to `auth.users(id)` with ON DELETE CASCADE
- `platform` text, CHECK limited to instagram, facebook, threads, youtube
- `platform_user_id` text
- `display_name` text nullable
- `handle` text nullable
- `encrypted_access_token` text
- `encrypted_refresh_token` text nullable
- `token_expires_at` timestamptz nullable
- `scopes` text[] default empty array
- `token_metadata` jsonb default empty object
- `created_at` and `updated_at` timestamptz default now()

Indexes/constraints:
- Primary key on `id`
- Unique constraint/index on `(owner_id, platform, platform_user_id)`
- FK on `owner_id` to auth.users with cascade delete
- Platform CHECK constraint described above

No non-internal triggers were found. No functions exist in Production's `private` schema. RLS is enabled; no policies were reported in the previous Security Advisor inspection. ACL inspection showed schema USAGE and table CRUD only for `service_role` (plus postgres owner privileges), with no PUBLIC/anon/authenticated grants.

Important: The encrypted token columns' names alone do not establish how encryption keys, rotation, or decryption are handled. No token data was queried.

## Staging

Staging's `nextgen_private` schema currently contains no tables. The token vault is absent there. Its schema currently grants USAGE to authenticated, which should be reviewed and restricted in a separate migration after confirming no legitimate dependency.

## Deployed Edge Functions

Production has four ACTIVE functions, all with JWT verification enabled:
- `super-handler` (version 6)
- `channel-profile-lookup` (version 17)
- `draft-idea-queue` (version 7)
- `platform-connection-status` (version 7)

Staging has one ACTIVE function:
- `channel-profile-lookup` (version 8; JWT verification enabled)

Deployed source retrieval succeeded for these functions. A source scan found no references to `platform_oauth_tokens`, `encrypted_access_token`, `encrypted_refresh_token`, `nextgen_private`, or `private.` in the retrieved function payloads. The exact deployed source is not fully mirrored in the audit branch: GitHub currently contains only `channel-profile-lookup` and `platform-connection-status` folders, not `super-handler` or `draft-idea-queue`. Treat repository source coverage as incomplete until deployed versions are exported/reconciled.

## Findings and required next actions

1. Production has a tightly ACL-restricted token table, but the audit has not established a functioning encryption/decryption lifecycle. Verify where encryption/decryption occurs and how the key is stored/rotated before relying on this vault.
2. No deployed Edge Function source references the vault by its table/column/schema names. Do not assume the deployed OAuth flows use this table.
3. Staging does not have an equivalent vault. Do not copy a guessed schema; use the verified Production DDL and security grants only after confirming application dependencies.
4. Export and version-control the exact deployed `super-handler` and `draft-idea-queue` sources, plus reconcile deployed versions with GitHub.
5. Do not select or log token values. No SQL writes, migrations, grants, deployments, or application changes were made.

## Status

Read-only audit complete for current table metadata, ACLs, indexes, constraints, triggers, private-schema function inventory, and deployed Edge Function inventory/source scan. Migration readiness remains blocked on identifying the actual OAuth encryption/decryption path and reconciling missing deployed function source.
