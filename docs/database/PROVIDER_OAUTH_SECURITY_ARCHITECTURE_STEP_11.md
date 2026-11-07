# NextGen Provider OAuth Security Architecture — Step 11

Date: 2026-11-07
Branch: `audit/migration-reconciliation`
Status: design only; no implementation or deployment

## 1. Goal

Connect a user's YouTube, Facebook, Instagram, or Threads account through a real provider authorization flow. Provider access and refresh tokens must never be submitted by browser code, returned to browser code, stored in exposed tables, or written to logs.

Important distinction: Supabase Auth's OAuth Server makes Supabase an identity provider for third-party apps. It is not the same as NextGen acting as an OAuth client to Google/Meta to obtain permission to publish to YouTube/Facebook/Instagram/Threads. This design concerns the latter.

## 2. Proposed architecture

1. **Browser / NextGen UI**
   - User selects a platform and taps Connect.
   - Browser calls an authenticated Edge Function to start authorization.
   - Browser receives only a short-lived authorization URL/state handle and is redirected to the provider.
   - Browser never receives a provider client secret, access token, refresh token, or encryption key.

2. **OAuth start handler**
   - Validates Supabase user identity.
   - Creates cryptographically random, single-use state; bind it to user ID, platform, redirect URI, expiry, and (where provider flow supports it) PKCE verifier/challenge.
   - Store state server-side with a short TTL and single-use semantics. Do not trust owner ID, platform, redirect URI, or return path supplied again by the callback without comparing against the stored state.
   - Redirect only to allow-listed provider authorization endpoints and pre-registered redirect URIs.

3. **Provider callback handler**
   - Validate state, expiry, single-use status, provider identity, exact redirect URI, and callback error parameters.
   - Exchange the authorization code server-side over TLS using the platform's documented token endpoint and server-side client secret.
   - Never accept a provider access/refresh token from browser JSON or URL query parameters as an application credential.
   - Validate the provider response and fetch the provider account identity from the provider API before binding it to the signed-in NextGen owner.
   - Protect against account-linking / login CSRF and replay; make callback completion idempotent where practical.

4. **Token encryption and vault**
   - Use envelope encryption with a dedicated key-encryption key held in a managed KMS/secret manager, not in Git, browser code, database plaintext, or a Supabase service-role key.
   - Generate a fresh data-encryption key per token record or rotation unit; use an authenticated cipher (for example AES-256-GCM) with a unique nonce and versioned ciphertext format.
   - Bind ciphertext to context using authenticated additional data such as owner ID, platform, provider account ID, and token type. Validate this binding on decrypt.
   - Store ciphertext, nonce, algorithm/version, key identifier/version, and minimal non-secret metadata in the unexposed `private.platform_oauth_tokens` vault. The current table has only ciphertext-named text fields and no explicit nonce/key-version columns; a reviewed schema extension or a different structured ciphertext envelope is required before implementation.
   - Limit vault reads/writes to a server-only role. Keep RLS enabled as defense in depth; no browser grants or policies.
   - Never log tokens, authorization codes, client secrets, decrypted values, or encryption material.

5. **Token use / refresh**
   - A server-side publishing worker retrieves ciphertext for the authenticated owner/platform/account, decrypts only in memory, and calls the provider.
   - Refresh tokens only server-side. Serialize refresh operations per token record to prevent refresh races; atomically replace encrypted access/refresh tokens and expiry after successful rotation.
   - Handle provider revocation, invalid_grant, expiry, permission/scope changes, and disconnect. Revoke with provider when supported, then delete ciphertext and mark connection disconnected.
   - Do not expose raw tokens to the browser or persist them in `platform_connections`.

6. **Connection status**
   - Keep `platform_connections` as non-secret display/status metadata.
   - Only a trusted server-side callback/worker may set `connection_status='connected'`, and only after verified provider identity and successful token storage.
   - Browser-submitted status remains limited to Pending / Error / Not Connected, as current function enforces.

## 3. Required controls

- Exact allow-listed redirect URIs per provider and environment (Staging vs Production).
- State: cryptographically random, short TTL, one-time use, server-side storage, user/platform binding.
- PKCE where supported/required by provider; use server-side confidential-client authentication where provider requires it.
- CSRF, replay, open-redirect, callback injection, account-confusion, and cross-user token-access tests.
- OAuth scopes: request least privilege; publishing scopes only when user explicitly enables the relevant feature.
- Strict owner binding: never accept an owner ID from callback request as authority; use the stored state binding.
- Rate limits on connect/callback/refresh endpoints.
- Redacted structured logs and security-event audit trail.
- Secrets managed independently per environment; separate Staging and Production provider apps/credentials.
- Provider token revocation and user disconnect flow.
- Backup/PITR and recovery procedure for encrypted token data and key versions. Losing the KMS key must not silently strand tokens; key recovery/rotation process must be documented.

## 4. Current schema gaps

Production `private.platform_oauth_tokens` currently has:
- owner/platform/provider account identifiers and display metadata
- `encrypted_access_token` and nullable `encrypted_refresh_token`
- expiry, scopes, JSON metadata, created/updated timestamps
- unique owner/platform/provider-account constraint and owner FK

The schema does not currently declare a nonce, cipher/version, key ID/version, token type, or refresh coordination state. No OAuth state table, callback handler, or token crypto helper was found in the reviewed tracked code. Staging has no equivalent vault table. These are gaps to resolve in a separately reviewed design/migration; do not infer that encryption is implemented merely because columns contain the word `encrypted`.

## 5. Implementation sequence (not yet authorized/executed)

1. Confirm provider app registrations, supported OAuth grants, scopes, callback URLs, PKCE requirements, refresh/revocation behavior from current official Google and Meta docs.
2. Decide and document the managed KMS/key-management service and operational recovery/rotation owners.
3. Design state storage and vault schema changes; decide whether to use a separate OAuth state table and explicit ciphertext metadata columns.
4. Export and reconcile deployed Edge Function source with GitHub before modifying existing handlers.
5. Implement on a disposable development project with fake/test accounts and isolated provider credentials.
6. Add automated tests for CSRF/state replay, PKCE, owner isolation, token ciphertext at rest, no token in responses/logs, refresh races, revoke, and failure rollback.
7. Run Supabase Security and Performance Advisors and inspect function logs for accidental secret exposure.
8. Verify Staging backup/recovery, deploy to Staging, and run full end-to-end OAuth tests.
9. Confirm Production PITR/backup and obtain explicit approval before any Production DDL, secret changes, or deployment.

## 6. Explicit non-goals

- No UI or Master Design v32 changes in this step.
- No automatic publishing. Manual approval remains required before content is scheduled/published.
- No assumption that any provider OAuth credentials already exist.
- No token migration, plaintext token read, or guessed encryption implementation.

## 7. Supabase documentation references reviewed

- Edge Function environment secrets: https://supabase.com/docs/guides/functions/secrets
- Securing Edge Functions / caller authentication: https://supabase.com/docs/guides/functions/auth
- Supabase API key migration guidance: https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys

These Supabase references describe Supabase function secrets and request authentication. Provider-specific OAuth endpoints, scopes, and refresh/revocation semantics must be verified against the official provider documentation before implementation.
