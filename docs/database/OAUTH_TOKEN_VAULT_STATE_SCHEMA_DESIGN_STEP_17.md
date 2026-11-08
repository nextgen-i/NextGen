# NextGen OAuth Token Vault and State Schema Design — Step 17

Date: 2026-11-08
Branch: `audit/migration-reconciliation`
Status: schema design only; not executable SQL; no database or deployment changes

## 1. Purpose and scope

Define the logical database structure required for secure YouTube OAuth authorization, token storage, refresh, disconnect, and one-time callback validation.

This document follows Steps 7, 13, 15, and 16. It deliberately does not create or apply a migration. Production already has `private.platform_oauth_tokens`; Staging currently has no equivalent table in `nextgen_private`. The final migration must be based on exact live DDL and compatibility inspection, not reconstructed from table names.

## 2. Environment and schema decision

- Production canonical private schema: `private` (already exists and contains `platform_oauth_tokens`).
- Staging canonical private schema for this design: `nextgen_private` (already used by Staging private RPC architecture).
- Do not rename either schema as part of this work.
- Neither private schema is included in the Data API exposed-schema list per Step 5.
- Keep browser roles without direct table access. No user-facing RLS policies are proposed for token ciphertext or OAuth transaction records.
- RLS should be enabled as defense in depth; access should be through narrowly scoped trusted server-side operations only.
- Do not grant `authenticated`, `anon`, or `PUBLIC` direct table privileges. Review any existing schema USAGE grants separately; do not assume USAGE alone provides safe access.
- Keep Production and Staging data, KMS keys, service identities, and OAuth clients fully separate.

## 3. Logical entity A — provider OAuth token vault

Proposed logical table: `<private_schema>.platform_oauth_tokens`.

One record represents one owner-authorized provider/channel connection and its encrypted credential bundle. The design must preserve the existing `channel_id` semantics and constraints after exact Production DDL inspection.

### Identity and ownership

| Field | Logical type | Requirement |
|---|---|---|
| id | UUID | Primary key; generated server-side |
| owner_user_id | UUID | Required; Supabase Auth user ID derived from verified session/state, never accepted as trusted from browser input |
| channel_id | UUID or existing exact type | Existing NextGen channel reference; preserve FK and deletion behavior after DDL inspection |
| provider | constrained text/enum | Initially `youtube`; future providers only after separate scope/security review |
| provider_account_id | text | Verified provider channel ID; unique per provider according to product policy |
| connection_status | constrained text | connected, refresh_required, reauthorization_required, revoked, error |
| created_at / updated_at | timestamptz | Server timestamps |

### Encrypted credential envelope

| Field | Logical type | Requirement |
|---|---|---|
| credential_ciphertext | bytea | Authenticated ciphertext containing token bundle; never plaintext |
| wrapped_dek | bytea | DEK wrapped by the environment's KMS KEK |
| nonce | bytea | Unique nonce for AES-256-GCM encryption |
| encryption_algorithm | text | Allow-listed; initially AES-256-GCM |
| encryption_format_version | integer | Versioned envelope format |
| kms_key_resource | text | Non-secret KMS key resource identifier |
| kms_key_version | text | Non-secret KMS key version identifier |
| aad_version | integer | Version for canonical AAD encoding |

The encrypted payload may contain access token, refresh token, token type, and token endpoint metadata only when needed. Do not store the OAuth client secret or authorization code in this record. Keep token values out of searchable columns, logs, error payloads, analytics, and browser responses.

AAD must bind the ciphertext to a canonical set of immutable context values: application, environment, provider, owner_user_id, channel_id, token-record id, and envelope version. Decryption must fail if any bound context differs.

### Token lifecycle metadata

| Field | Logical type | Requirement |
|---|---|---|
| access_token_expires_at | timestamptz nullable | Access token expiry |
| refresh_token_expires_at | timestamptz nullable | Only if provider returns a meaningful expiry |
| granted_scopes | text[] | Exact allow-listed scope set granted by provider |
| last_refreshed_at | timestamptz nullable | Server timestamp |
| refresh_lease_until | timestamptz nullable | Coordinates refresh workers; no raw lock secret |
| refresh_generation | bigint | Monotonic version to prevent stale concurrent refresh writes |
| revoked_at | timestamptz nullable | Server timestamp |
| last_error_code | text nullable | Sanitized internal code only; no provider response body/token |

Recommended uniqueness: one active connection per (owner_user_id, provider, provider_account_id), subject to the existing channel model and approved multi-channel policy. Add indexes only for server-side lookup patterns; avoid indexing ciphertext.

## 4. Logical entity B — one-time OAuth transaction/state

Proposed logical table: `<private_schema>.oauth_transactions`.

Purpose: short-lived callback transaction validation and replay protection. This table must be inaccessible to browser roles.

| Field | Logical type | Requirement |
|---|---|---|
| id | UUID | Primary key |
| state_hash | bytea | Hash of high-entropy random state; unique |
| owner_user_id | UUID | Verified Supabase Auth owner |
| provider | constrained text | Initially youtube |
| environment | constrained text | staging or production; must match deployment |
| redirect_uri | text | Exact callback URI used in authorization request |
| requested_scopes | text[] | Exact allow-listed scopes requested |
| pkce_verifier_ciphertext | bytea nullable | Encrypted verifier if PKCE is used and server must retain it |
| pkce_wrapped_dek / nonce / envelope metadata | appropriate types | Same KMS envelope discipline for verifier if persisted |
| created_at | timestamptz | Server timestamp |
| expires_at | timestamptz | Short expiry; proposed 10 minutes, configurable and validated |
| consumed_at | timestamptz nullable | Set atomically once; prevents replay |
| outcome_code | text nullable | Sanitized terminal result only |

Rules:
- Generate at least 256 bits of cryptographically secure random state.
- Return the raw state only in the authorization redirect URL; store only its cryptographic hash.
- Bind the transaction to the verified owner, provider, environment, exact redirect URI, and exact requested scopes.
- If PKCE S256 is adopted for the Google web-server flow, retain the verifier only in encrypted server-side form. Do not put verifier in browser storage or logs.
- Callback must atomically consume a matching unexpired transaction before exchanging the authorization code. A second callback must fail.
- Expired transactions should be purged by a scheduled cleanup process after a short retention buffer. Keep only sanitized audit outcome metadata as needed.
- Do not accept owner_user_id, redirect_uri, or scope set as authoritative callback query parameters; load them from the stored transaction.

## 5. Logical entity C — optional OAuth audit events

A separate append-only `oauth_audit_events` table is optional, not required for the first YouTube connection. If implemented, store only:
- event ID, owner ID, provider, transaction/token record ID, event type, timestamp, sanitized error code, environment, correlation ID.

Never store OAuth code, state value, access/refresh token, PKCE verifier, client secret, decrypted payload, Authorization header, or KMS request credential. Restrict reads to trusted operators and apply retention limits.

## 6. Refresh concurrency and atomicity

- A worker obtains a short refresh lease using an atomic conditional update (or equivalent transaction-safe lock).
- It reads the encrypted bundle, decrypts only in trusted server memory, and calls Google's token endpoint.
- A successful refresh writes a new encrypted bundle and increments `refresh_generation`.
- The update must compare the generation it originally read; if another worker already updated it, discard the stale result and reload.
- If Google omits a refresh token in a refresh response, retain the previous valid refresh token rather than overwriting it with null.
- If refresh fails permanently (for example, revoked/invalid grant), set a safe status requiring reauthorization; never expose provider error bodies or token values.
- Keep network calls outside long-running database transactions. Use short claim/write transactions around the refresh lease and generation checks.

## 7. Ownership, authorization, and database access

- Start/status/disconnect calls require a verified Supabase Auth session.
- Derive owner identity from verified Auth claims, never from client-supplied owner IDs.
- Callback is reachable by Google's redirect without a Supabase JWT, but is authorized only by the single-use state transaction and strict callback validation.
- Token decrypt and refresh operations are trusted server-only. They must verify the vault row owner/provider/channel binding before use.
- Do not create public SECURITY DEFINER RPC endpoints for vault access.
- Prefer a narrowly scoped server role / trusted service operation with explicit table privileges. If a privileged SQL function is unavoidable, put it in the private schema, use a fixed search_path, explicit owner/context checks, revoke PUBLIC/anon/authenticated EXECUTE, and review it separately.
- Keep the private schema out of exposed Data API schemas. RLS is defense in depth, not a substitute for schema/table grants.
- No direct client SELECT/INSERT/UPDATE/DELETE on either table.

## 8. Retention and deletion

- Pending OAuth transactions: expire quickly; purge after a short operational buffer.
- Connected credentials: retain only while the user connection is active and needed for the enabled feature.
- Disconnect: revoke provider grant where supported, delete ciphertext and wrapped DEK, clear refresh state, set safe connection status, and retain only minimal non-secret audit metadata if policy requires.
- Account deletion: revoke and erase provider credentials and pending transactions associated with the owner.
- Backups and restore procedures must account for encrypted data and KMS key retention; restoring ciphertext without its matching KMS key version is not sufficient.

## 9. Migration sequence — design only

1. Capture exact Production `private.platform_oauth_tokens` DDL, constraints, indexes, triggers, owner and ACL without reading token rows.
2. Inspect Staging `nextgen_private` grants and ensure no browser role can read or write vault/state tables.
3. Compare tracked migrations and all application/Edge Function references.
4. Prepare a forward-only Staging migration that creates only missing structures and safely reconciles existing columns; never drop or rewrite existing ciphertext without a tested migration plan.
5. Add transaction/state table and required indexes/constraints.
6. Add vault envelope columns only after exact live DDL comparison and backward-compatibility plan.
7. Run migration in a disposable development database first.
8. Test cross-owner denial, replay denial, expiry, ciphertext tampering, AAD mismatch, refresh race, disconnect, and deletion.
9. Run Supabase Security and Performance Advisors and inspect actual grants.
10. Obtain explicit approval before applying to Staging. Production requires a separate backup/PITR check and separate explicit approval.

## 10. Acceptance tests

- No browser role can select or mutate vault or OAuth transaction rows.
- Wrong owner cannot read/use another owner's connection.
- State hash mismatch, expiry, reuse, provider mismatch, environment mismatch, redirect mismatch, and wrong scope set all fail closed.
- A callback cannot set connection status to connected before channel identity is verified and ciphertext is durably stored.
- Tampered ciphertext, nonce, wrapped DEK, or AAD fails authenticated decryption.
- A stale refresh worker cannot overwrite a newer token generation.
- A missing refresh_token in a provider response does not erase the existing valid refresh token.
- Logs and error responses contain no code, state, tokens, verifier, secret, plaintext crypto material, or sensitive provider payload.
- Disconnect removes credential ciphertext and wrapped key material and leaves no active refresh lease.
- Restored database backups can still decrypt only when the correct retained KMS key version is available.

## 11. Open decisions (must be resolved before executable SQL)

1. KMS vendor, project, location, billing, workload identity, and key recovery ownership.
2. Whether one ciphertext bundle or separate access/refresh ciphertexts is preferred; this design recommends one bundle to simplify atomic rotation.
3. Exact Production table DDL and existing data compatibility.
4. Exact Staging private schema privileges and whether any authenticated USAGE grant is still needed by current RPC wrappers.
5. Provider account/channel uniqueness policy if one Google account controls multiple YouTube channels.
6. Whether PKCE is used in the selected Google web-server flow after implementation-library review.
7. Transaction cleanup cadence and operational audit retention.

## 12. Non-changes

- No SQL migration file created or applied.
- No database tables, columns, indexes, constraints, grants, or policies changed.
- No tokens or token values read.
- No KMS resources, billing, IAM, or secrets changed.
- No OAuth client, redirect URI, scope, Edge Function, or frontend changed.
- No Production or Staging deployment.
- No Master Design v32 or publishing/approval behavior changed.
