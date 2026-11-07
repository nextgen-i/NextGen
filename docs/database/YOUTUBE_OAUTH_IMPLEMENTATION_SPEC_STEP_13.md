# NextGen YouTube OAuth Implementation Specification — Step 13

Date: 2026-11-07
Branch: `audit/migration-reconciliation`
Status: implementation specification only; no code, credentials, database, or deployment changes

## 1. Scope

This specification covers the first provider integration: YouTube channel authorization and the future ability to publish only after explicit NextGen content approval. It does not implement Google Sign-In for NextGen login; it authorizes YouTube Data API access to a user's YouTube channel.

## 2. Verified official requirements

Sources reviewed:
- YouTube Data API authorization: https://developers.google.com/youtube/data/guides/authentication
- YouTube Data API upload: https://developers.google.com/youtube/data/guides/uploading_a_video
- Google OAuth 2.0 web server flow: https://developers.google.com/identity/protocols/oauth2/web-server
- YouTube API Services Developer Policies: https://developers.google.com/youtube/terms/developer-policies

Verified points:
- OAuth 2.0 is required for private user data and write operations such as uploading videos. API keys are for public-only data requests.
- A server-side web application can request `access_type=offline` to obtain a refresh token for background actions when the user is not present.
- Google requires the `redirect_uri` to exactly match an authorized redirect URI registered for the OAuth client.
- Google recommends `state` to maintain request/response integrity and mitigate CSRF.
- YouTube supports `youtube.readonly` for viewing the user's YouTube account and `youtube.upload` for managing/uploading videos.
- Google advises requesting the narrowest scopes needed and supports incremental authorization.
- Refresh tokens are limited per user/client; store and reuse them rather than repeatedly forcing consent.
- YouTube policies prohibit requesting scopes for features that are not currently built and prohibit collecting users' Google login credentials.

## 3. Permission plan

### Phase A — connect and identify channel
Request the minimum YouTube account-read permission:
- `https://www.googleapis.com/auth/youtube.readonly`

Purpose:
- Verify the authorized Google/YouTube identity.
- Retrieve the authenticated channel identity using an authorized channel lookup (for example, `channels.list` with `mine=true`).
- Store channel ID, display title, and public handle/custom URL metadata where returned.

Do not request upload permission solely to detect a channel name.

### Phase B — publishing authorization
Only when the user enables YouTube publishing, request:
- `https://www.googleapis.com/auth/youtube.upload`

Use incremental authorization if supported by the selected Google client implementation, and explain why the additional permission is needed. Do not request broad `youtube` or unrelated scopes without a documented feature requirement.

Important: confirm current Google verification / sensitive-scope requirements for the actual OAuth consent configuration before requesting production users to authorize.

## 4. Proposed server-side flow

1. User is signed in to NextGen and taps **Connect YouTube**.
2. Browser invokes authenticated Edge Function `youtube-oauth-start` with the user's Supabase session.
3. Handler validates the user JWT and obtains the owner ID from verified claims, never from an untrusted body field.
4. Handler creates a cryptographically random one-time state value, stores only a hash where practical, and binds the record to owner ID, provider=YouTube, exact redirect URI, requested scope set, creation time and short expiry.
5. Generate PKCE verifier/challenge if supported and required by the chosen Google web-server OAuth configuration. Verify the final flow requirements against current Google docs and library behavior; do not assume PKCE parameters are interchangeable with another provider.
6. Redirect browser to Google's authorization endpoint with response_type=code, client_id, exact redirect_uri, state, scope, access_type=offline, and incremental-grant parameter where appropriate.
7. Google redirects to a server callback. Callback validates state hash, expiry, one-time status, provider, owner binding, and exact redirect URI. Reject missing, replayed, expired, mismatched, or error callbacks.
8. Exchange authorization code server-to-server at Google's documented token endpoint using the OAuth client credentials held only in Edge Function secrets.
9. Call YouTube Data API with the access token to identify the authenticated channel. Verify the response and bind the channel ID to the stored owner/provider authorization attempt.
10. Encrypt access and refresh tokens with the approved envelope-encryption scheme and write ciphertext only to the private vault.
11. Update `platform_connections` with non-secret metadata and Connected status only after successful provider identity verification and successful vault storage.
12. Redirect browser to a clean NextGen URL without authorization code or token query parameters. Return only safe metadata (status, channel ID/title, granted scopes, expiry timestamp).
13. Publishing worker later decrypts token server-side and performs API actions only for content whose NextGen approval status is explicitly approved.

## 5. Proposed Edge Function boundaries

| Function | Caller | Responsibility |
|---|---|---|
| `youtube-oauth-start` | Authenticated user | Generate state and authorization URL; never issue tokens. |
| `youtube-oauth-callback` | Google redirect | Validate state, exchange code, verify channel identity, encrypt/store tokens. |
| `youtube-connection-status` | Authenticated user | Return safe connection metadata only; no token fields. |
| `youtube-token-refresh` | Internal worker / trusted server | Refresh and rotate tokens under per-record locking. |
| `youtube-disconnect` | Authenticated user | Revoke grant where supported, erase ciphertext, update metadata. |
| Publishing worker | Internal worker | Use server-side decrypted token only after checking approved content and schedule. |

Keep callback function public at the HTTP routing layer only if Google must reach it without a Supabase user JWT; its handler must authenticate the callback using the one-time stored state and strict validation. It must not be a general unauthenticated data endpoint. User-facing start/status/disconnect operations require verified user authentication. Keep privileged token operations internal-only.

## 6. Token storage and encryption prerequisites

The current Production vault table is not yet sufficient as a fully specified encryption envelope. Before implementation, approve a schema design that can preserve:
- Ciphertext for access and refresh token.
- Nonce / IV.
- Algorithm and envelope format version.
- Key-encryption-key identifier/version.
- Token expiry and granted scopes.
- Refresh coordination / lock state or an equivalent transaction-safe mechanism.
- Audit timestamps and revocation status.

Use a dedicated managed KMS or secret-management key-encryption key. Do not derive encryption keys from Supabase API keys or use service-role/secret keys as encryption keys. The exact KMS product and key recovery process are still undecided.

The `private` schema must remain unexposed. Browser roles must have no schema/table privileges. Keep RLS enabled as defense in depth, with no user-facing policies for a strictly service-only vault. Any privileged access must be narrowly scoped and reviewed. Never return decrypted values to a browser.

## 7. YouTube API publishing constraints

- Upload only after NextGen approval state is verified as approved.
- Keep Manual Approval ON by default; Auto Approval OFF by default.
- Do not let OAuth connection status bypass content approval.
- Respect YouTube API quotas, upload requirements, privacy settings and developer policies.
- Do not use OAuth to scrape or collect Google login credentials.
- Do not request publishing scopes until the publishing feature is actually implemented and ready for user testing.

## 8. Required tests before Staging

- State missing, wrong, expired, replayed and cross-user callback rejected.
- Callback error/denial handled without creating a Connected state.
- Redirect URI mismatch rejected.
- Wrong Google account / no YouTube channel / multiple channels handled safely.
- Channel identity matches the provider response and is bound to the correct NextGen owner.
- No authorization code, access token, refresh token, client secret or plaintext crypto key in browser responses, logs, analytics or database metadata.
- Encrypted token can be decrypted only by authorized server path; tampering with ciphertext/nonce/AAD fails authentication.
- Refresh token omitted on a subsequent consent response does not accidentally erase a still-valid stored refresh token.
- Concurrent refresh attempts do not overwrite newer rotated credentials.
- Revocation and disconnect erase vault ciphertext and set safe status.
- Upload denied for draft/pending/rejected content; upload allowed only for approved content and valid schedule.
- Reauthorization and key rotation/recovery paths tested.
- Supabase Security and Performance Advisors reviewed after any eventual DDL.

## 9. Configuration details deliberately not guessed

The following must be obtained from the actual Google Cloud Console and confirmed by the project owner:
- Google Cloud project and YouTube Data API v3 enabled state.
- OAuth consent screen configuration, audience, app name, support contact and authorized domains.
- OAuth client type and client ID.
- Exact authorized redirect URI (cannot be safely invented before the deployed function/domain is confirmed).
- Test users / publishing status / verification requirements.
- Approved scopes and any additional verification required by Google.
- Quota allocation and upload-related limits.

Client secret must be entered directly into the appropriate Staging Edge Function secret store by the owner; never paste it into chat or commit it to GitHub.

## 10. Rollout sequence

1. Owner confirms Google Cloud app settings and provides screenshots with all secrets/IDs masked where necessary.
2. Confirm exact production and staging redirect URLs based on deployed project URLs.
3. Decide encryption KMS and vault schema changes.
4. Reconcile the live deployed Edge Function source with GitHub source.
5. Implement on a disposable development project first.
6. Test end-to-end using a test YouTube channel.
7. Deploy to Staging only after explicit approval and successful tests.
8. Confirm backups/PITR and obtain separate explicit approval before Production migration or deployment.

## 11. Current status / non-changes

- Specification only; no OAuth code has been written.
- No Google Cloud or Meta settings have been changed.
- No secrets, API keys, tokens or credentials were read or changed.
- No Supabase database DDL/DML, grants, migrations or deployments were run.
- No frontend files or Master Design v32 were changed.
- No content was published or scheduled.
