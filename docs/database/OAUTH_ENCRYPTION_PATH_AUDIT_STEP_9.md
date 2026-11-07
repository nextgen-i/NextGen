# OAuth Encryption Path and Source Reconciliation — Step 9

Date: 2026-11-07
Branch: `audit/migration-reconciliation`

## Search results

Read-only repository searches were run for:
- `encrypt access token`
- `crypto.subtle encrypt decrypt`
- `ENCRYPTION_KEY`
- `platform_oauth_tokens`
- `oauth token storage`

No matching GitHub code-search results were returned. GitHub code search searches the repository default branch, not the audit branch, so this is not proof that no implementation exists on the audit branch or in unindexed/deployed sources.

The deployed Edge Function source payloads previously retrieved from Production (super-handler v6, channel-profile-lookup v17, draft-idea-queue v7, platform-connection-status v7) and Staging (channel-profile-lookup v8) contained no literal references to the vault table/columns or private schema. The scan does not establish that they do not handle OAuth tokens by another name or via an external service.

## Current conclusion

The encryption/decryption lifecycle remains unverified:
- No identified code path writes encrypted token values to the Production vault.
- No identified code path decrypts them for API calls.
- No encryption key name, storage mechanism, rotation policy, or key access boundary has been verified.
- The Production table currently reports zero rows in the metadata listing; no token values were queried.

## Safe next step

Before writing or deploying code, obtain and inspect the exact OAuth callback/token-exchange implementation and any external secret-management configuration. If those are not present in the repository or deployed Edge Function source, the vault should remain unused until the design is completed. Do not invent an encryption scheme or reuse a Supabase service-role key as an encryption key.

## Source coverage gap

Production's deployed `super-handler` and `draft-idea-queue` functions are not present in the audit branch's `supabase/functions` directory. Their deployed sources were retrievable for this audit, but should be exported and version-controlled through a reviewed source-sync change before any edits. No deployment was performed.

## Safety boundary

Read-only searches and metadata inspection only. No OAuth token data, API keys, or secrets were read. No SQL writes, migrations, grants, frontend edits, or Edge Function deployments were performed.
