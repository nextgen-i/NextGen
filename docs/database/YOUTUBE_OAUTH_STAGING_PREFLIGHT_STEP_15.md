# NextGen YouTube OAuth Staging Preflight — Step 15

Date: 2026-11-08
Branch: `audit/migration-reconciliation`
Status: read-only Staging preflight; no deployment, secrets, database, OAuth settings, or frontend changes

## 1. Scope

This step checks the actual Staging Supabase Edge Function inventory and the currently deployed channel lookup function before implementing YouTube OAuth. It follows the successful Google Sign-In test but treats YouTube channel authorization as a separate provider consent flow.

## 2. Staging function inventory

Project: Staging Supabase project `wrwumlpobgcoxlngkvds`
Project API origin: `https://wrwumlpobgcoxlngkvds.supabase.co`

Read-only Edge Function inventory returned one active function:
- `channel-profile-lookup`
- Version: 8
- Status: ACTIVE
- `verify_jwt: true`

No `youtube-oauth-start`, `youtube-oauth-callback`, token refresh, disconnect, or YouTube connection-status function is currently deployed to Staging.

The only current function's callback endpoint cannot be inferred as an OAuth callback; it is a profile lookup endpoint. A future callback URL may use the Supabase functions route pattern, but the exact deployed URL must be confirmed after the callback function is created and deployed. Do not register a guessed redirect URI in Google Cloud.

## 3. Current deployed channel-profile-lookup behavior

The deployed Staging source was inspected directly.

Positive controls:
- Requires POST (OPTIONS for CORS).
- Requires a Bearer Supabase session.
- Calls `supabase.auth.getUser()` and rejects invalid/expired sessions.
- Uses the authenticated user's session for Supabase client operations.
- YouTube public channel handle lookup uses server-side `YOUTUBE_DATA_API_KEY`.
- Provider failures are logged with status metadata rather than returning provider token values.

Security blocker:
- For Facebook, Instagram and Threads, the function currently reads `body.access_token` and uses it as a provider credential. Facebook also has a server-secret fallback.
- This means browser-supplied provider tokens are currently accepted by this endpoint. This is not an acceptable final OAuth/token-handling architecture.
- Do not add any new browser token input or send OAuth access/refresh tokens from the browser.
- Before any public production OAuth rollout, replace this pattern with server-side retrieval of encrypted credentials from the private token vault and remove the request-body token path after compatibility review.

YouTube limitation:
- Current YouTube lookup uses a public API key with `forHandle`. It does not prove the caller owns or controls the channel.
- It does not call YouTube API using the authenticated user's OAuth access token.
- Therefore it is a public profile lookup, not a verified YouTube OAuth connection.

## 4. Required YouTube OAuth components — not yet implemented

Planned Staging components:
1. `youtube-oauth-start`: authenticated user; generate one-time state, bind to verified Supabase owner, store attempt securely, issue Google authorization URL.
2. `youtube-oauth-callback`: validate state/expiry/one-time use/owner binding; exchange authorization code server-to-server; call YouTube API to verify the authorized channel; encrypt and store tokens server-side; update safe connection metadata only after success.
3. `youtube-connection-status`: authenticated, owner-scoped safe metadata only.
4. `youtube-token-refresh`: trusted server/worker only; refresh safely with locking and rotation handling.
5. `youtube-disconnect`: authenticated owner action; revoke where supported, erase encrypted tokens and update status.
6. Publishing worker: use tokens server-side and publish only content with explicit approved status and valid schedule.

The Google Sign-In OAuth client must remain separate in purpose from YouTube channel authorization. Keep the existing Supabase Google provider and its callback intact.

## 5. Hard blockers before code deployment

Do not deploy OAuth handlers until these are resolved:
- Exact Google Cloud project/environment selection for Staging is confirmed.
- Staging OAuth Web Client is created or selected specifically for YouTube authorization.
- Exact callback URI is derived from the deployed function endpoint, not guessed.
- Dedicated managed KMS / envelope-encryption scheme and key recovery/rotation process are selected.
- Token vault schema supports nonce/IV, algorithm/format version, key identifier, ciphertext, expiry/scopes and safe refresh coordination.
- A safe one-time OAuth state store with expiry and replay protection is designed.
- Staging Edge Function secrets are configured by the owner directly in the secret manager; secrets must never be pasted into chat or committed.
- The existing browser-supplied provider-token path is scheduled for removal/replacement.
- A disposable development test path and end-to-end test plan are ready.

## 6. Safe immediate next steps

1. Confirm which Google Cloud project is the Staging OAuth project.
2. Decide the dedicated KMS/encryption provider and key-management approach.
3. Finalize the vault/state schema design and migration review.
4. Implement and test OAuth start/callback only in disposable development.
5. Deploy to Staging only after explicit approval, then register the exact callback URI in the Staging Google OAuth client.
6. Keep Production and the existing Google Sign-In client unchanged.

## 7. Non-changes

- No Edge Function deployed or modified.
- No Supabase database DDL/DML, grants, migrations, or secrets changed.
- No Google Cloud OAuth client, redirect URI, scope, or consent settings changed.
- No frontend code or Master Design v32 changed.
- No content published or scheduled.
