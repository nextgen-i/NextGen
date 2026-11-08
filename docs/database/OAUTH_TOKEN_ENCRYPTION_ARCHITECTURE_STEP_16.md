# NextGen OAuth Token Encryption Architecture — Step 16

Date: 2026-11-08
Branch: `audit/migration-reconciliation`
Status: design decision record only; no cloud resources, keys, secrets, database, or deployments changed

## 1. Decision summary

**Recommended target:** application-layer envelope encryption for provider OAuth tokens, with a managed external Key Management Service (KMS) protecting key-encryption keys (KEKs).

**Candidate KMS:** Google Cloud KMS, because the project already uses Google Cloud for Google OAuth configuration. This is a candidate, not yet provisioned or activated. The Google Cloud project previously showed no associated billing account, so do not create a KMS key or enable billing as part of this step.

**Not approved as the production encryption design:**
- Plaintext provider tokens in Postgres, browser storage, function request bodies, or logs.
- A single hardcoded AES key in source code.
- Using Supabase `service_role` / secret API key as an encryption key.
- Treating Supabase Vault alone as the long-term key-management boundary for this OAuth token vault. Supabase currently documents Vault as public alpha; it may be useful for selected secret-storage use cases, but it does not replace an independently managed KMS boundary for this design.

## 2. Envelope encryption model

For each token record (or each independently encrypted token bundle):

1. Generate a fresh cryptographically secure 256-bit Data Encryption Key (DEK) in the trusted server-side runtime.
2. Encrypt the provider token payload using AES-256-GCM.
3. Use a managed KMS KEK to wrap the DEK.
4. Persist only the ciphertext, wrapped DEK, nonce, authentication tag (or the library's combined authenticated ciphertext format), algorithm/version metadata, KMS key resource/version, and non-secret record metadata.
5. Erase plaintext token and DEK buffers as soon as practical after the operation. JavaScript runtimes cannot guarantee secure memory zeroization; keep their lifetime and copies minimal.
6. To use a token, fetch the encrypted record server-side, ask KMS to unwrap the DEK, authenticate/decrypt in memory, call the provider API, then discard plaintext material.

Use authenticated encryption. Bind ciphertext to its context with AEAD additional authenticated data (AAD), for example a canonical encoding of:
- application = `NextGen`
- environment = `staging` or `production`
- provider = `youtube`
- owner_user_id
- channel_id
- token_record_id
- schema_version

AAD must be reconstructed identically during decryption. Never include access tokens, refresh tokens, authorization codes, or client secrets in AAD or metadata.

Google's envelope-encryption guidance recommends locally generated DEKs, AES-256-GCM, wrapping DEKs with centrally managed KEKs, and never storing plaintext DEKs. See source [1].

## 3. Proposed token vault fields

The final schema must be reviewed against the existing production `private.platform_oauth_tokens` table and Staging architecture before any migration.

Required fields (names are illustrative; not SQL):
- `id` — opaque UUID token record identifier
- `owner_user_id` — Supabase Auth user UUID; immutable owner binding
- `channel_id` — existing channel reference; preserve the project's existing channel identity choice
- `provider` — constrained provider identifier
- `access_token_ciphertext` — authenticated ciphertext only
- `refresh_token_ciphertext` — authenticated ciphertext only, nullable when provider omits one
- `access_token_wrapped_dek` / `refresh_token_wrapped_dek` — wrapped DEKs, or one wrapped DEK if the bundle is encrypted as a single payload
- `access_token_nonce` / `refresh_token_nonce` — unique nonce per encryption operation
- `encryption_algorithm` — explicit allow-listed value, initially AES-256-GCM
- `encryption_format_version` — application envelope format version
- `kms_key_resource` and `kms_key_version` — non-secret key references
- `token_expires_at`, `refresh_expires_at` — nullable timestamps
- `granted_scopes` — allow-listed scope strings, never token contents
- `created_at`, `updated_at`, `last_refreshed_at`, `revoked_at`

Do not store raw Google authorization codes after exchange. Do not store client secrets in this table. Do not expose ciphertext or wrapped DEKs through the browser-facing Data API.

## 4. Key access and runtime boundary

- Only a narrowly scoped server-side OAuth/token service may call KMS decrypt/unwrap.
- Browser clients never receive provider access tokens, refresh tokens, DEKs, wrapped DEKs, KMS credentials, or raw OAuth authorization codes.
- The database stores ciphertext; it is not the encryption authority.
- KMS IAM grants only the minimum encrypt/decrypt permissions to the workload identity used by the token service.
- Separate Staging and Production KMS keys, identities, secrets, and data. Never reuse Staging key material in Production.
- Prefer short-lived workload identity federation over downloadable long-lived service-account private keys. If the Supabase Edge runtime cannot establish the required federation safely, use a small authenticated KMS broker service with tightly scoped identity; do not silently fall back to a broad service-account key.
- Keep KMS audit logs enabled. Alert on unusual decrypt volume, failed decrypt bursts, key permission changes, and unexpected principal use.

Supabase Edge Function secrets are suitable for server-side configuration and credentials, not for browser delivery. Supabase documents that secrets are read with `Deno.env.get`, and warns that secret/service-role keys bypass RLS and must never be used in the frontend. See source [2].

## 5. Rotation, recovery, and incident response

- Rotate KEKs on a documented schedule and immediately after suspected compromise.
- Keep old KMS key versions enabled for decryption until all data encrypted under them has been rewrapped or re-encrypted and verified.
- Store key resource/version metadata with every encrypted record so decrypt can select the correct key version.
- Rewrap DEKs under a new KEK without decrypting/re-encrypting provider token payloads where the KMS supports that operation and the workflow is tested.
- Back up key configuration and recovery instructions securely; KMS key material itself must remain non-exportable.
- If a key is lost or disabled permanently, affected token ciphertext may become unrecoverable. Document this explicitly and provide users a safe reauthorization flow.
- On user disconnect or account deletion, revoke provider authorization where supported and delete token ciphertext/wrapped DEKs plus related refresh state.
- Never log authorization headers, OAuth codes, plaintext tokens, decrypted payloads, or secret environment variables.

## 6. KMS candidate and cost gate

Google Cloud KMS is the leading candidate, not yet a final vendor commitment. Before provisioning:
- Confirm billing and cost implications in the selected Google Cloud project.
- Confirm KMS location/data residency and latency.
- Confirm the Supabase Staging workload can authenticate to KMS using short-lived identity, or approve a separate broker architecture.
- Confirm key rotation, IAM audit, and incident recovery ownership.
- Create separate Staging and Production key rings/keys only after explicit owner approval.

No billing account, KMS key, service account, workload identity, or IAM binding was created in this step.

## 7. OAuth state and replay protection

OAuth state is not an access token, but it is a security-sensitive, one-time transaction secret:
- Generate at least 256 bits of cryptographically secure random state.
- Store only a hash of state in a private, short-lived server-side transaction record.
- Bind transaction to authenticated owner, provider, expected redirect URI, environment, and expiry.
- Enforce one-time consumption atomically; reject expired, mismatched, reused, or missing state.
- Use PKCE (S256) where supported by the provider flow and library.
- Never put Supabase service keys, provider tokens, or owner identifiers in a client-controlled redirect parameter.

## 8. Decision gates before implementation

No implementation/deployment until all are true:
1. KMS provider and authentication method are explicitly approved.
2. Staging billing/cost gate is resolved.
3. Staging and Production key separation is documented.
4. Vault schema and one-time OAuth state schema are reviewed.
5. Owner-binding, RLS/private-schema access, grants, and RPC/service access are reviewed.
6. Encryption/decryption test vectors, tamper tests, wrong-owner tests, replay tests, and key-rotation tests pass in disposable development.
7. Token redaction is verified in function logs and error paths.
8. Explicit approval is obtained before Staging deployment; Production requires a separate explicit approval.

## 9. Sources checked

[1] Google Cloud KMS — Envelope encryption: https://cloud.google.com/kms/docs/envelope-encryption
[2] Supabase — Edge Function environment variables and secrets: https://supabase.com/docs/guides/functions/secrets
[3] Supabase — Managing secrets with Vault: https://supabase.com/docs/guides/database/vault
[4] Supabase — Breaking-change changelog reviewed for current platform changes: https://supabase.com/changelog?types=breaking-change

## 10. Non-changes

- No Supabase database or Edge Function changes.
- No OAuth scopes, clients, callback URLs, or redirect URIs changed.
- No Google Cloud billing, KMS, IAM, or service-account resources created.
- No API keys, OAuth client secrets, or user tokens read or exposed.
- No frontend UI, Master Design v32, or publishing behavior changed.
