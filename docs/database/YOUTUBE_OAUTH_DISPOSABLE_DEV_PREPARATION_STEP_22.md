# YouTube OAuth Disposable Development Preparation — Step 22

Date: 2026-11-08
Repository branch: `audit/migration-reconciliation`
Mode: Planning and read-only environment check
Target: Disposable Development environment only

## Executive result

The Staging Supabase project currently has **no Supabase development branches**. A disposable Development branch has therefore not been created and no OAuth test has been run.

Supabase documentation recommends using isolated development branches for changes and tests, rather than making experimental changes directly in Production. Branch creation can incur hourly compute and usage charges. The project branch list was checked read-only; no branch was created.

## Environment check

- Staging project: `wrwumlpobgcoxlngkvds`
- Existing development branches: none returned.
- Production project: `vexntvbufnawtxszslsz` — excluded from this work.
- No new Supabase project or branch created.
- No secrets or environment variable values inspected.

## Proposed disposable test environment

Use a dedicated Supabase development branch or separate development project with:
- No production user data.
- A test-only Google OAuth client and redirect URI.
- Test-only OAuth credentials and test user.
- A dedicated encryption/KMS key separate from all other environments.
- A private token vault and one-time OAuth transaction/state storage.
- Server-side Edge Functions only.
- No production publishing permissions or production social accounts.

Do not reuse the existing Google Login client/callback. YouTube channel authorization must use its own OAuth client and callback.

## Initial YouTube scope

Start with the read-only scope only:

`https://www.googleapis.com/auth/youtube.readonly`

Do not request `youtube.upload` or any publishing scope in this test phase.

## Proposed implementation components

1. `youtube-oauth-start`: authenticated start endpoint; generates one-time state and PKCE values, binds the transaction to the signed-in owner and Development environment, and returns only the provider authorization URL.
2. `youtube-oauth-callback`: validates and consumes state once, verifies owner/environment/provider/redirect binding, exchanges the authorization code server-side, and verifies the YouTube channel identity.
3. Private token-vault writer: envelope-encrypts tokens using a dedicated KMS-backed key and stores ciphertext plus nonce, wrapped DEK, algorithm/version, key metadata, and AAD version.
4. Private token-vault reader: owner-bound server-only retrieval and decryption; never returns token material to the browser.
5. Refresh handler: concurrency-safe refresh rotation; preserve the existing refresh token if the provider omits a replacement.
6. Disconnect/revoke handler: provider revocation where supported, safe deletion of stored ciphertext and connection metadata.
7. Safe connection response: return only channel ID, display name, handle, granted scopes, expiry/status, and non-sensitive timestamps.

No component above has been deployed or created in this step.

## Security test matrix

| Test | Expected result |
|---|---|
| Missing/invalid Supabase session | Reject OAuth start |
| User A attempts to consume User B state | Reject |
| Wrong provider/environment/redirect | Reject |
| Expired state | Reject |
| Replayed state/callback | Reject; one-time consume |
| Invalid authorization code | Fail without storing credentials |
| Token exchange provider error | No token persistence; safe error only |
| KMS unavailable | Fail closed; no plaintext fallback |
| Ciphertext/nonce/AAD tampering | Decryption fails |
| Vault read by another owner | Denied |
| Browser role attempts vault access | Denied |
| Token values in API response/logs | Must not appear |
| Concurrent refresh requests | Single valid rotation; no stale overwrite |
| Provider omits new refresh token | Preserve previous valid refresh token |
| Revoked/expired credentials | Mark reconnect required; no publish |
| Disconnect | Revoke where supported and remove stored ciphertext |
| Read-only scope only | Channel identity available; upload/publish unavailable |
| Google Login regression | Existing login still works unchanged |

## Entry criteria before any implementation

- User approves a disposable Development environment and understands any quoted recurring/hourly cost.
- Exact redirect URI is based on the actual deployed Development callback endpoint.
- Test OAuth client is separate from the existing Google Login client.
- Dedicated KMS/encryption-key service and rotation/recovery plan are selected.
- Deployed function versions and repository branch are reconciled.
- Security test plan and rollback/disposal procedure are reviewed.

## Supabase documentation reference

The Supabase Environment Variables guide describes storing secrets in Edge Function environment variables and keeping local `.env` files out of version control:
https://supabase.com/docs/guides/functions/secrets

Supabase for Platforms describes development branches as isolated/ephemeral environments, warns that branch creation can incur usage charges, and recommends avoiding production data in branches:
https://supabase.com/docs/guides/integrations/supabase-for-platforms

## Safety and change record

- Read-only branch inventory only.
- No branch/project creation, billing action, schema change, SQL, migration, secret change, function deployment, or OAuth console change.
- No Production or Staging configuration changed.
- No Google Login changes.
- No tokens, API keys, OAuth client secrets, KMS keys, or production user data accessed.

## Step 22 status

**Preparation plan complete. Execution is waiting for a disposable Development environment to be approved and provisioned.** No OAuth implementation has started.
