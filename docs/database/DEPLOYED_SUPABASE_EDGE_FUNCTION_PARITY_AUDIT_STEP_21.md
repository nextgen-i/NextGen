# Deployed Supabase Edge Function Parity Audit — Step 21

Date: 2026-11-08
Repository branch: `audit/migration-reconciliation`
Mode: Read-only
Projects inspected: Production and Staging

## Executive result

**The deployed Edge Function inventory confirms that no provider OAuth start/callback/token-exchange function is currently deployed in either inspected project.** The deployed profile lookup functions still accept a provider access token in the request body for Meta/Threads paths, with a server-side Facebook token fallback. Neither deployed profile lookup function reads or decrypts the private token vault.

This confirms the Step 20 implementation gap in the live function inventory and source payloads inspected.

## Deployed function inventory

### Production project

| Function | Status | Deployed version | JWT verification |
|---|---|---:|---|
| `super-handler` | ACTIVE | 6 | enabled |
| `channel-profile-lookup` | ACTIVE | 17 | enabled |
| `draft-idea-queue` | ACTIVE | 7 | enabled |
| `platform-connection-status` | ACTIVE | 7 | enabled |

### Staging project

| Function | Status | Deployed version | JWT verification |
|---|---|---:|---|
| `channel-profile-lookup` | ACTIVE | 8 | enabled |

No provider-specific OAuth authorization-start, callback, token exchange, refresh, revoke, or token-vault function appeared in either deployed function inventory.

## Deployed source findings

### Production: `channel-profile-lookup` v17

- Reads `body.access_token` for provider requests.
- Has a server-side `FACEBOOK_PAGE_ACCESS_TOKEN` fallback.
- Uses the supplied/fallback token in Bearer authorization headers for provider API calls.
- Does not read `private.platform_oauth_tokens`.
- No token decrypt, refresh rotation, or revocation code was identified.

### Staging: `channel-profile-lookup` v8

- Same transitional request-body token pattern was found.
- Has a server-side Facebook token fallback.
- Makes provider API calls with the token.
- No private vault lookup/decryption, refresh, or revocation code was identified.

### Production: `platform-connection-status` v7

- Keeps the guard that rejects attempts to mark a connection Connected without server-side OAuth verification.
- Returns `OAUTH_VERIFICATION_REQUIRED`.
- No token vault access or provider OAuth callback was identified.

### Production: `super-handler` v6 and `draft-idea-queue` v7

- Retrieved deployed source payloads.
- No provider OAuth, token vault, encryption/decryption, refresh, or revoke implementation was identified in the inspected source.
- `super-handler` is a generic name-response handler, not an OAuth callback.

## Parity assessment

- The deployed Production profile lookup behavior is consistent with the Step 20 finding: browser/request-body token input remains present and no vault reader/decryptor is implemented.
- The deployed Staging profile lookup behavior has the same transitional token input pattern.
- The deployed connection-status function preserves the Pending/Connected security guard.
- Repository branch contains only the two tracked Edge Function directories previously inventoried; the deployed inventory adds no hidden OAuth function to the reviewed scope.
- A full cryptographic byte-for-byte comparison between the deployed Edge Function bundle and repository source is not asserted. The audit compares deployed source content and behavior with the corresponding tracked source files; deployed runtime bundles may include packaging/runtime transformations.

## Security decision

**Do not deploy or enable provider OAuth yet.** Before implementation:
1. Remove the browser-to-function provider-token request path from profile lookup and replace it with server-side retrieval after OAuth vault storage is ready.
2. Preserve the existing Pending/Connected guard.
3. Build a separate YouTube OAuth authorization start/callback flow; do not change the existing Supabase Google Login client or callback.
4. Use one-time owner-bound OAuth state and server-side authorization-code exchange.
5. Encrypt credentials with a dedicated managed key/envelope-encryption design and store ciphertext only in the private vault.
6. Implement owner-bound decrypt/read, refresh rotation with concurrency protection, revocation, and safe metadata responses.
7. Test the complete flow in a disposable development environment before Staging, and obtain separate approval before Production changes.

## Safety and change record

- Only function inventories and deployed source payloads were read.
- No environment variables, secrets, OAuth client secrets, API keys, provider token values, or vault rows were read.
- No database writes, migrations, grants, function deployments, OAuth configuration changes, or frontend changes were made.
- Existing Google Login and all Master Design/UI files were left untouched.

## Step 21 status

**Read-only deployed-source audit complete. OAuth implementation remains blocked pending a separately approved implementation plan and disposable development test environment.**
