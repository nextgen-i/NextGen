# Token Encryption / Decryption Source Audit — Step 20

Date: 2026-11-08
Branch: `audit/migration-reconciliation`
Scope: Read-only source review of tracked repository files for OAuth authorization-code callbacks, token exchange, token encryption/decryption, vault readers/writers, refresh rotation, and token revocation.

## Executive result

**No complete provider OAuth token lifecycle is implemented in the tracked source reviewed.** The Production vault table exists (see Step 19), but no tracked code path was found that writes to it, decrypts from it, refreshes its credentials, or revokes stored provider credentials.

This is an implementation gap. It is not a reason to weaken the existing Pending/Connected safeguards.

## Files and paths inspected

- Full recursive Git tree for this branch: `audit/migration-reconciliation`.
- `supabase/functions/platform-connection-status/index.ts`
- `supabase/functions/channel-profile-lookup/index.ts`
- `channels.html`
- `nextgen-workspace.js`
- `login.html`
- `dashboard.html`
- `settings.html`
- `SUPABASE_SETUP.md`
- `supabase/functions/README-profile-name-lookup.md`
- `supabase/migrations/20261027223652_add_platform_connections_secure.sql`
- Prior audit reports Step 9 and Step 10.

The recursive tree contains only the two tracked Edge Functions above; no provider-specific OAuth start/callback function is present in this branch.

## Findings

### 1. Token encryption and decryption

- No tracked implementation using Web Crypto or another encryption library for provider-token encryption/decryption was identified.
- No dedicated encryption-key/KMS integration or key-rotation implementation was identified.
- No tracked writer to `private.platform_oauth_tokens` was identified.
- No tracked reader that retrieves and decrypts vault credentials for provider API calls was identified.
- No refresh-token rotation, refresh locking/lease, or provider-token revocation lifecycle was identified.

### 2. Channel profile lookup has an unsafe transitional token input

In `supabase/functions/channel-profile-lookup/index.ts`:
- The function reads `body.access_token` for Meta/Threads provider calls.
- Facebook can also fall back to the server-side `FACEBOOK_PAGE_ACCESS_TOKEN` secret.
- If no token is supplied, it returns `OAUTH_REQUIRED` and instructs that the provider token must be saved securely in Supabase.
- The function does not read the private vault or decrypt a stored token.

**Security requirement:** Do not add a browser token field or send provider access/refresh tokens in browser-to-function request bodies. Replace this transitional request-body path with server-side owner-bound vault retrieval after the secure OAuth lifecycle is implemented. Do not log request bodies containing credentials.

### 3. Platform connection status

In `supabase/functions/platform-connection-status/index.ts`:
- Reads and writes only `platform_connections` metadata.
- Rejects a browser-submitted attempt to mark a connection as `connected` with `OAUTH_VERIFICATION_REQUIRED`.
- Does not read/write the token vault and does not perform OAuth verification or token exchange.
- Unverified metadata does not establish a provider-authorized connection.

Keep this guard intact.

### 4. Frontend and Google Login distinction

- `channels.html` parses provider profile URLs and invokes profile lookup; no provider authorization-code callback or token exchange was identified.
- `login.html` contains the existing Supabase Auth social sign-in/session callback handling for account login. This is the existing Google/Supabase login path, not a YouTube channel authorization flow.
- No provider token encryption/decryption implementation was identified in the inspected frontend workspace, dashboard, or settings files.

**Do not modify the existing Google Login client, callback, or working login flow as part of YouTube channel OAuth.** YouTube channel authorization must be a separate provider connection flow.

## Required next design decisions

1. Confirm the actual deployed Edge Function source/version matches this branch before implementation.
2. Design separate provider OAuth start and callback handlers; exchange authorization codes only server-side.
3. Bind one-time OAuth state to the signed-in owner, provider, environment, redirect URI, and PKCE verifier; reject replay and expiry.
4. Use dedicated managed encryption/KMS keys and envelope encryption. Never derive encryption keys from the Supabase service-role key.
5. Write ciphertext and required envelope metadata only to the private vault; never return tokens or key material to the browser or logs.
6. Implement owner-bound server-side token retrieval/decryption, refresh rotation with concurrency protection, and revocation/disconnect.
7. Only mark `platform_connections` as Connected after server-side provider verification and secure credential persistence.
8. Keep YouTube scope read-only (`youtube.readonly`) for initial channel identity testing. Publishing scope requires a later, separately approved implementation.

## Safety and change record

- Read-only repository inspection only.
- No token values, API keys, OAuth client secrets, encryption keys, or credential-bearing database rows were read.
- No SQL, migration, grants, frontend edits, function deployments, OAuth settings, or production/staging changes were made.
- This report is not an executable migration or deployment instruction.

## Step 20 status

**Audit findings complete; implementation remains blocked** until deployed-source parity and the secure OAuth callback/encryption architecture are confirmed.
