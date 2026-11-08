# NextGen OAuth Disposable Development Migration Draft & Security Test Plan — Step 18

Date: 2026-11-08
Branch: `audit/migration-reconciliation`
Status: review draft only; intentionally NOT executable; no database changes

## 1. Purpose

Translate Step 17's logical schema into a controlled migration plan for a disposable development database. This is not a production or staging migration and must not be pasted into Supabase SQL Editor or run as-is.

## 2. Mandatory preconditions before making this draft executable

The following are still unknown or require fresh verification:
- Exact Production `private.platform_oauth_tokens` DDL, column types, constraints, indexes, triggers, ownership, ACLs and dependent objects.
- Exact Staging `nextgen_private` schema grants and existing function dependencies.
- Exact channel table name, primary-key type, FK delete behavior, and channel ownership constraints.
- Existing OAuth token row shape and whether any application/Edge Function currently reads it.
- KMS vendor, key resource, workload identity, encryption library and supported runtime integration.
- Whether the disposable development project can use an isolated KMS key and service identity.

Do not invent FK targets, UUID/text types, enum labels, constraints, or grants. Capture metadata only; never SELECT token values.

## 3. Migration packaging

Create a migration only after confirming the local Supabase CLI version and migration command syntax using CLI `--help`. Follow the repository's existing migration naming and directory convention. Keep the migration additive and forward-only.

Proposed migration units:
1. Private schema and privilege preflight (assertion/check only).
2. OAuth transaction/state table.
3. Token vault additive envelope columns, only after exact live table comparison.
4. Constraints and narrowly scoped server indexes.
5. Grants/RLS verification.
6. Rollback/forward-recovery runbook.

Do not combine this work with unrelated RPC migration, channel table redesign, or production cleanup.

## 4. SQL design skeleton — NOT EXECUTABLE

The following is a structural review aid only. Placeholders are deliberately unresolved. It is not valid migration SQL and must not be run.

```sql
-- HOLD: design skeleton only. Do not execute.
-- Replace every placeholder only after exact live DDL and dependency review.

-- A. Confirm the intended private schema exists and is NOT Data API exposed.
-- Do not rename private / nextgen_private schemas in this migration.

-- B. OAuth transaction table (logical shape only).
-- CREATE TABLE <approved_private_schema>.oauth_transactions (
--   id                         <confirmed_uuid_type> PRIMARY KEY,
--   state_hash                 <confirmed_binary_type> NOT NULL UNIQUE,
--   owner_user_id              <confirmed_auth_user_fk_type> NOT NULL,
--   provider                   <approved_constrained_type> NOT NULL,
--   environment                <approved_environment_type> NOT NULL,
--   redirect_uri               <confirmed_uri_storage_type> NOT NULL,
--   requested_scopes           <confirmed_array_type> NOT NULL,
--   pkce_verifier_ciphertext   <confirmed_binary_type>,
--   pkce_wrapped_dek           <confirmed_binary_type>,
--   pkce_nonce                 <confirmed_binary_type>,
--   encryption_format_version  <confirmed_integer_type>,
--   kms_key_resource           <confirmed_text_type>,
--   kms_key_version            <confirmed_text_type>,
--   created_at                 <confirmed_timestamp_type> NOT NULL,
--   expires_at                 <confirmed_timestamp_type> NOT NULL,
--   consumed_at                <confirmed_timestamp_type>,
--   outcome_code               <confirmed_sanitized_code_type>
-- );

-- C. Token vault:
-- ALTER TABLE <approved_private_schema>.platform_oauth_tokens
--   ADD COLUMN <approved_ciphertext_column> <confirmed_binary_type>,
--   ADD COLUMN <approved_wrapped_dek_column> <confirmed_binary_type>,
--   ADD COLUMN <approved_nonce_column> <confirmed_binary_type>,
--   ADD COLUMN <approved_algorithm_column> <confirmed_text_type>,
--   ADD COLUMN <approved_format_version_column> <confirmed_integer_type>,
--   ADD COLUMN <approved_kms_key_resource_column> <confirmed_text_type>,
--   ADD COLUMN <approved_kms_key_version_column> <confirmed_text_type>,
--   ADD COLUMN <approved_aad_version_column> <confirmed_integer_type>,
--   ADD COLUMN <approved_refresh_generation_column> <confirmed_integer_type>;

-- D. Constraints/indexes:
-- Add only after existing rows have a reviewed backfill strategy.
-- Add indexes only for measured server-side lookup and cleanup patterns.
-- Never index token ciphertext or state plaintext.

-- E. Security:
-- RLS enabled as defense in depth.
-- No anon/authenticated/PUBLIC table privileges.
-- Grant only the minimum privileges to the approved trusted server role.
-- Do not create browser-callable SECURITY DEFINER token-vault RPCs.
```

Important: existing token rows, if any, must not be assumed to contain valid encrypted envelopes. Do not mark old plaintext records as encrypted or delete them without a separately reviewed migration and verified reauthorization/backfill plan. If any legacy plaintext exists, stop and raise a security incident review rather than copying it into new columns automatically.

## 5. Development-only implementation sequence

1. Create/use a disposable development Supabase project with no production users or credentials.
2. Confirm the project ref and environment label before every operation.
3. Use synthetic test users, a test YouTube channel, and a separate OAuth client.
4. Configure a dedicated development KMS key only after cost, IAM and workload authentication are approved.
5. Create schema/migration from verified local metadata; review generated SQL before execution.
6. Apply migration only to disposable development.
7. Inspect resulting DDL, constraints, indexes, grants, RLS and advisors.
8. Implement server-side start/callback/token storage against the dev project only.
9. Run every security test below and capture sanitized results.
10. Destroy the disposable environment and test credentials after evidence is retained, or explicitly retain it as an isolated dev environment.

## 6. Security test matrix

| ID | Test | Expected result |
|---|---|---|
| ST-01 | Anonymous call to start/status/disconnect | 401/403; no transaction or token row created |
| ST-02 | Expired Supabase JWT | Rejected; no state created |
| ST-03 | User A attempts to access User B connection | Denied; no metadata or ciphertext leaked |
| ST-04 | Missing state | Callback rejected; no code exchange |
| ST-05 | Wrong state | Callback rejected; no code exchange |
| ST-06 | Expired state | Callback rejected |
| ST-07 | Replayed/consumed state | Second callback rejected atomically |
| ST-08 | Wrong provider or environment | Callback rejected |
| ST-09 | Redirect URI mismatch | Callback rejected before code exchange |
| ST-10 | Scope set differs from stored request | Callback rejected or narrowed safely; never silently broaden |
| ST-11 | Google denies consent | Safe pending/error status; no connected record |
| ST-12 | Token exchange fails | No connected status; no partial credential record |
| ST-13 | YouTube returns no channel / identity error | No connected status |
| ST-14 | Owner/channel mismatch | Reject and record sanitized diagnostic only |
| ST-15 | Ciphertext tampering | AES-GCM authentication fails closed |
| ST-16 | Nonce or AAD mismatch | Decryption fails closed |
| ST-17 | Wrong KMS key/version | Decryption fails closed; no fallback key guessing |
| ST-18 | KMS unavailable | Safe retryable error; no plaintext fallback |
| ST-19 | Concurrent refresh workers | Single lease winner; generation prevents stale overwrite |
| ST-20 | Refresh response omits refresh_token | Previous valid refresh token retained |
| ST-21 | Provider returns invalid_grant/revocation | Reauthorization required; tokens not exposed |
| ST-22 | Disconnect | Revoke where supported; ciphertext/wrapped DEK removed; safe metadata retained |
| ST-23 | Browser network inspection | No access token, refresh token, code, verifier, DEK, wrapped DEK, or KMS credential |
| ST-24 | Function/database logs inspection | No secrets, Authorization headers, token response bodies or plaintext crypto material |
| ST-25 | Data API direct access attempt | anon/authenticated cannot read/write private vault/state tables |
| ST-26 | Content status pending/draft/rejected | Publishing worker refuses upload |
| ST-27 | Content explicitly approved | Publishing still requires valid connection, schedule and policy checks |
| ST-28 | Key rotation | Old records decrypt only with recorded permitted key version; rewrap verified |
| ST-29 | Restore test | Restored ciphertext decrypts with retained KMS key version and correct AAD |
| ST-30 | User deletion | Credentials revoked/erased and outstanding OAuth transactions invalidated |

## 7. Negative assertions / stop conditions

Stop immediately if:
- Any browser response, log, database metadata, analytics event, or error includes a token, authorization code, client secret, PKCE verifier, DEK, or KMS credential.
- A user can read or mutate another user's connection.
- Callback can mark a connection connected without successful state validation, code exchange, YouTube identity verification and durable encrypted storage.
- Ciphertext tampering does not fail authentication.
- A stale refresh worker can overwrite a newer credential generation.
- The migration requires dropping or rewriting existing token rows before a verified backup and backfill plan exists.
- Security Advisor reveals unexpected exposed functions, grants, or RLS bypasses.

## 8. Acceptance evidence

Before approving Staging deployment, retain:
- Sanitized migration diff and exact target project ref.
- Before/after schema metadata only (no token rows).
- Grant/RLS inspection output.
- Security and Performance Advisor output.
- Test matrix results with synthetic IDs only.
- KMS IAM and key-version audit evidence (no secret material).
- Browser network/log redaction checks.
- Rollback and key recovery runbook.
- Explicit owner approval for Staging deployment.

Production deployment requires a separate change request, confirmed backup/PITR restore point, complete staging sign-off, and separate explicit approval.

## 9. Current state and non-changes

- No SQL migration was created or executed.
- No database metadata or token data was changed/read in this step.
- No KMS resources, billing, IAM or secrets were changed.
- No OAuth clients, redirect URIs or scopes were changed.
- No Edge Functions deployed or modified.
- No frontend or Master Design v32 changes.
- No content published or scheduled.

## 10. Next gate

Before generating executable SQL, perform a read-only metadata capture of the exact existing vault DDL, channel FK target, schema/table ACLs, triggers, indexes and code dependencies in a disposable/dev context. Reconcile Production and Staging separately. Only then produce a migration tailored to the actual schema.
