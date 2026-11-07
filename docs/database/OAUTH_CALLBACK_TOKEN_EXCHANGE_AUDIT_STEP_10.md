# OAuth Callback and Token Exchange Audit — Step 10

Date: 2026-11-07
Branch: `audit/migration-reconciliation`

## Verified application flow

### Channel profile lookup

Tracked source: `supabase/functions/channel-profile-lookup/index.ts`

- Requires a Bearer-authenticated Supabase user and validates the session with `auth.getUser()`.
- YouTube profile lookup uses the server-side `YOUTUBE_DATA_API_KEY` secret.
- For Facebook, Instagram, and Threads, the function reads `body.access_token`; Facebook has a fallback to the server secret `FACEBOOK_PAGE_ACCESS_TOKEN`.
- If no token is supplied, it returns `OAUTH_REQUIRED` and says the provider token must be saved securely in Supabase.
- The function does not query `private.platform_oauth_tokens`, does not decrypt a stored token, and no OAuth authorization-code callback/token exchange was found in the tracked source reviewed.

Security concern: accepting a provider access token in the request body means the token is passed through the browser-to-function request path. This is not an acceptable final token-vault architecture. Do not add a browser token field or send provider tokens from the frontend. The server should resolve the authenticated user's token from a protected server-side store after completing OAuth authorization-code exchange.

### Platform connection status

Tracked source: `supabase/functions/platform-connection-status/index.ts`

- Requires Bearer authentication and validates the Supabase user.
- GET reads only the current user's `platform_connections` metadata.
- POST only permits `not_connected`, `pending`, or `error`.
- A browser request attempting to set `connected` is rejected with `OAUTH_VERIFICATION_REQUIRED`.
- The function explicitly sets `token_expires_at`, `scopes`, and `last_verified_at` to null/empty for browser-submitted metadata.
- It does not read/write the private token vault and does not perform OAuth verification or token exchange.

### Channel UI

Tracked `channels.html` source parses platform URLs and calls the profile lookup function. The UI text explicitly separates saving a channel as Pending from platform authorization. No OAuth authorization redirect/callback or token exchange was identified in the inspected Channels UI.

## Overall conclusion

The Production private token vault exists but the inspected frontend/Edge Function flow does not use it. No end-to-end OAuth authorization-code exchange, encrypted token write, token decrypt/use, refresh-token rotation, or revoke flow has been verified. The current connection-status function intentionally cannot mark a platform Connected from a browser request.

This is a material implementation gap, not a reason to weaken the current checks. Keep all connections Pending until a real server-side OAuth flow verifies the provider response and safely stores credentials.

## Required implementation design (not implemented)

1. Create provider-specific OAuth authorization start and callback handlers on the server.
2. Validate state (and PKCE where supported), redirect URI, issuer/provider response, and authenticated owner binding.
3. Exchange authorization code server-side; never accept access/refresh tokens from browser request bodies.
4. Encrypt tokens using a dedicated managed secret/key strategy; do not reuse the Supabase service-role key.
5. Write only ciphertext to `private.platform_oauth_tokens` using a server-only role; ensure no token columns appear in browser-readable responses/logs.
6. Add server-side token retrieval/decryption and refresh/rotation/revocation with strict owner binding and provider scopes.
7. Only after provider verification update `platform_connections` to Connected.
8. Test on disposable development, review RLS/ACL and Advisors, and obtain backup/PITR confirmation plus explicit approval before Production DDL/deployment.

## Safety boundary

Source review and read-only metadata inspection only. No provider token values, OAuth secrets, API keys, or encryption keys were read. No SQL writes, migrations, grants, UI changes, or deployments were performed.
