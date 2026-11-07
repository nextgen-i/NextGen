# Step 7 — OAuth Token Vault and Cancellation Decision Audit

Date: 2026-11-07  
Branch: `audit/migration-reconciliation`  
Scope: read-only metadata review. No token values were queried or displayed.

## User decision: cancellation behavior

The user confirmed: **retain the original Channel** when a scheduled item is cancelled and returned to Approved. The intended cancellation behavior must therefore preserve `content_items.channel_id`; it must not clear the channel link. This is a product requirement for the eventual safe cancellation implementation, not a database change made in this step.

## Production token vault

- Token table exists at `private.platform_oauth_tokens`.
- RLS is enabled; there are no table policies.
- Information-schema table grants show only `postgres` and `service_role` have table privileges. No `anon` or `authenticated` table grants were returned.
- Schema privilege check: `anon` USAGE=false, `authenticated` USAGE=false, `service_role` USAGE=true.
- This is consistent with a server-only vault design. Keep the schema unexposed and do not grant browser roles access.
- The audit did not select, print, export, or otherwise inspect any token values.

## Staging private schema

- Staging has `nextgen_private`, but no tables were returned in that schema by the metadata query.
- Three SECURITY DEFINER functions exist there:
  - `cancel_scheduled_content(p_job_id uuid, p_note text)`
  - `review_content_item(p_content_id uuid, p_action text, p_note text)`
  - `schedule_approved_content(p_content_id uuid, p_channel_id uuid, p_scheduled_for timestamptz)`
- All three have an empty `search_path` and explicit EXECUTE ACL entries for `authenticated` and `service_role` (as well as owner `postgres`).
- The staging schema itself was previously confirmed as not Data API exposed, but the authenticated USAGE/EXECUTE grants remain a separate database privilege surface. These grants need to be narrowed or justified in the final RPC design; non-exposure alone is not a substitute for ACL review.
- No OAuth token vault table was found in the staging `nextgen_private` schema.

## Edge Function source inventory

The audit branch currently tracks these directories under `supabase/functions`:
- `channel-profile-lookup`
- `platform-connection-status`

It also contains `README-profile-name-lookup.md`. This is only the Git-tracked source inventory on the audit branch. It does not prove which Edge Functions are deployed in either Supabase project. Previously observed deployed functions included additional names; source/deployment parity remains unverified. Do not assume deployed functions are safely reproducible from this branch.

## Required follow-up before any implementation

1. Obtain the exact source/definition for the Production token-vault creation and any token read/write helper functions, without exposing token values.
2. Verify whether the deployed Production Edge Functions use the vault and identify their source versions.
3. Confirm Staging's intended private-schema function ACL model; avoid authenticated EXECUTE on privileged SECURITY DEFINER functions unless the public invoker-wrapper design requires it and the private boundary is demonstrably secure.
4. Design cancellation to preserve the original `channel_id`, while preventing stale or mismatched job cancellation and retaining audit history.
5. Reconcile safe channel removal and three-channel groups only after their exact live definitions and source files are available.
6. Keep all work on this audit branch until the user explicitly approves implementation. No Production or Staging DDL/DML has been run in this step.

## Status

- Read-only metadata inspection only.
- No OAuth token values accessed.
- No SQL migration applied.
- No table data modified.
- No frontend, UI, or design files changed.
