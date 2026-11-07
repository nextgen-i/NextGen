# Step 6 — Frontend RPC Compatibility Audit

Status: read-only code and live-definition review; no SQL or application changes  
Branch: `audit/migration-reconciliation`

## 1. RPC calls found in tracked frontend code

File inspected: `nextgen-workspace.js`

- Approval buttons call `client.rpc('review_content_item', { p_content_id, p_action, p_note })`.
- Schedule action calls `client.rpc('schedule_approved_content', { p_content_id, p_channel_id, p_scheduled_for })`.
- No tracked frontend call to `cancel_scheduled_content` was found.
- The current Schedule Cancel button directly updates `publishing_jobs.status = 'cancelled'` via PostgREST rather than calling the audited cancellation RPC.
- No tracked frontend call to `remove_channel_safely` was found. The inspected `channels.html` contains channel insert/list logic but no channel delete call.

This means migration design must not assume the cancellation RPC is currently wired into the UI. Replacing the direct update with the RPC is a separate application change and must be tested with RLS/permissions; it is outside this database-only audit.

## 2. Signature compatibility

| RPC | Production live | Staging live | Frontend payload |
|---|---|---|---|
| review_content_item | (uuid,text,text DEFAULT NULL) | (uuid,text,text DEFAULT NULL) public invoker wrapper | p_content_id, p_action, p_note |
| schedule_approved_content | (uuid,uuid,timestamptz) | same public invoker wrapper | p_content_id, p_channel_id, p_scheduled_for |
| cancel_scheduled_content | (uuid) | (uuid,text DEFAULT NULL) public invoker wrapper | no current RPC caller found |

Approval and schedule payloads match both environments. Cancellation differs: Production has the one-argument signature while Staging has a two-argument signature with optional note. Preserve a compatibility overload/wrapper if changing Production to the Staging form, and do not alter it until all external callers are checked.

## 3. Channel removal and cancellation findings

Production `remove_channel_safely(uuid)` is SECURITY INVOKER and checks auth.uid(), locks the owner-scoped channel, refuses removal while linked content/jobs/analytics exist, then deletes the channel. No frontend caller was found in inspected files. The database function exists but is not currently shown as wired to the tracked channel UI.

Production cancellation is materially weaker than Staging:
- Production locks the job first, then updates the content if no other active jobs remain.
- It does not verify the content's current scheduled_for/channel_id still match the cancelled job.
- It clears channel_id when restoring the content.
- Staging locks content then job, checks exact schedule/channel match, avoids overwriting a newer schedule, and writes a cancellation audit event.
- Current frontend bypasses both implementations and directly updates the publishing_jobs row.

Do not silently change the UI or database behavior in this audit. The desired cancellation behavior (keep or clear channel_id after restoring to approved) requires a product decision and test coverage.

## 4. Private implementation security observations

Live function definitions:
- Production public SECURITY DEFINER functions use `search_path = public, pg_temp` and qualify table references with `public.`.
- Staging private SECURITY DEFINER functions use an empty search_path (`SET search_path TO ''`) and schema-qualify table references. This is a stronger hardening pattern against search_path object-shadowing.
- Staging public wrappers are SECURITY INVOKER and use an empty search_path; they call schema-qualified `nextgen_private.*` functions.
- The wrapper architecture preserves the existing public RPC endpoint names and parameter names used by the frontend.

The target migration should preserve exact parameter names and result JSON fields, keep all table references schema-qualified, use an empty search_path where safe, and explicitly manage EXECUTE/schema grants. Do not grant broad access to the token vault.

## 5. Next required decision/checks

1. Confirm whether cancellation should restore approved content with its previous channel_id retained (Staging behavior) or cleared (Production behavior).
2. Decide whether to wire the Schedule Cancel UI to the audited RPC in a separate frontend change; current code directly updates publishing_jobs.
3. Confirm whether channel removal UI is intentionally not implemented yet, or whether another deployed client/Edge Function calls `remove_channel_safely`.
4. Inspect exact token-vault table/function grants and the OAuth Edge Function usage before drafting the token-vault migration.
5. Test on disposable database with two users, cross-owner IDs, concurrent schedule/cancel, paused channels, duplicate jobs, and audit-event verification.

## 6. Safety boundary

No DDL/DML executed. No database grants changed. No SQL migration applied. No frontend or design files changed. Production and Staging remain unchanged.
