# Token Vault and Cancellation Decision Audit

Date: 2026-11-07
Branch: `audit/migration-reconciliation`

## User decision: preserve the selected channel on cancellation

The user accepted the recommendation to keep the previously selected channel when a scheduled job is cancelled and its content returns to Approved. The eventual cancellation implementation must preserve `content_items.channel_id` while clearing the schedule timestamp, and must only restore the content when the cancelled job still corresponds to the content's current schedule and channel and no other active job remains. This is a design decision only; no database or application code was changed.

## Production token vault

Production contains `private.platform_oauth_tokens`. Its effective ACL inspection showed:
- Schema USAGE: `service_role` and `postgres`.
- Table privileges: `service_role` has SELECT, INSERT, UPDATE, DELETE; `postgres` has owner-level privileges.
- No PUBLIC, anon, or authenticated table/schema grants appeared in the inspected ACL.

The table has RLS enabled and no policies (previous Security Advisor inspection). This is consistent with a service-role-only access design, provided no other indirect access path is introduced. Do not expose token values in audit output or logs.

No OAuth/token-named helper functions were found in the Production `private` schema from the metadata query.

## Staging comparison

Staging's `nextgen_private` schema currently has no tables. The schema grants USAGE to `authenticated` (and owner access to postgres). No `platform_oauth_tokens` table exists there, so Staging does not mirror Production's token vault. The metadata query found no OAuth/token/platform-named helper functions in `nextgen_private`.

This means the Production token-vault migration is not yet reconciled with Staging. Do not assume the vault is used by deployed Edge Functions until their source and deployment inventory are confirmed.

## Required follow-up before migration

1. Inspect the complete Production token-vault table definition, constraints, indexes, and any triggers without selecting token data.
2. Find all tracked application and Edge Function references to the vault; verify deployed Edge Function source for any functions not present in GitHub.
3. Decide whether Staging should receive an equivalent private vault, then draft a migration from the exact Production DDL rather than reconstructing it from its name.
4. Keep the schema unexposed and restrict schema/table privileges to the server role. Review any authenticated USAGE on Staging's `nextgen_private` schema and revoke it only in a separately reviewed migration.
5. Test on a disposable development database, run Security and Performance Advisors, verify OAuth flows, then require confirmed backup/PITR and explicit approval before Production changes.

## Safety boundary

Read-only metadata queries only. No token values were read. No SQL migration, grant change, data change, frontend change, or deployment was performed.
