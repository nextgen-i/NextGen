# Step 5 — Secure RPC Migration Design and Compatibility Review

Status: design review only; no SQL migration created or applied  
Branch: `audit/migration-reconciliation`  
Database scope: Production and Staging read-only  
UI scope: no frontend or Master Design v32 files touched

## 1. Confirmed Data API exposure

The owner supplied Dashboard screenshots for both projects.

- Production exposed schemas: `graphql_public`, `public`; `private` is not exposed.
- Staging exposed schemas: `graphql_public`, `public`; `nextgen_private` is not exposed.

This confirms that the private implementation schemas are not in the Data API exposed-schema list. It does not itself remove PostgreSQL schema/function privileges; those remain separately controlled by grants.

## 2. Current architecture

### Production
- Three owner-scoped RPC implementations are SECURITY DEFINER functions in exposed `public`.
- The Security Advisor reports three warnings: signed-in users can call these SECURITY DEFINER functions through REST RPC.
- Their bodies explicitly check `auth.uid()` and scope relevant records by owner, but they still execute with function-owner privileges and bypass ordinary RLS.
- Function ACLs grant EXECUTE to authenticated and service_role; PUBLIC and anon are not in the effective ACL.
- `private` schema already exists and contains `private.platform_oauth_tokens`; it is not Data API exposed.

### Staging
- The three SECURITY DEFINER implementations live in unexposed `nextgen_private`.
- Three public SQL wrappers are SECURITY INVOKER and call the private implementations.
- `nextgen_private` is not Data API exposed.
- authenticated has schema USAGE and EXECUTE on the private functions; wrappers also grant authenticated EXECUTE. This is compatible with invoker wrappers calling the private functions, while the schema remains outside the Data API exposed schemas.
- Security Advisor reports no SECURITY DEFINER RPC warnings for these three functions.

## 3. Recommended migration direction

Use the Staging wrapper pattern as the target architecture, while retaining the Production `private` schema name so the existing Production token-vault table is not disrupted.

For Production, the intended design is:
1. Move/recreate the three privileged implementations in `private` as SECURITY DEFINER functions.
2. Keep the implementation functions' owner checks, `auth.uid()` checks, schema-qualified relation references, and fixed/empty search_path.
3. Create/retain public SECURITY INVOKER SQL wrappers with the client-facing RPC names and compatible signatures.
4. Grant only the minimum schema USAGE and function EXECUTE required for wrapper invocation; explicitly revoke PUBLIC and anon.
5. Keep `private` out of Data API exposed schemas (confirmed in screenshot).
6. Preserve existing public wrapper endpoint names so the web app does not need an unnecessary API rename.

For Staging, do not blindly rewrite the working implementation. First decide whether `nextgen_private` remains its canonical private schema or is renamed to `private` in a separately reviewed change. Renaming is not required for security while it remains unexposed, and could create avoidable migration risk.

## 4. Compatibility and logic differences that block a final executable SQL draft

### Cancellation function signature
- Production currently exposes `public.cancel_scheduled_content(p_job_id uuid)`.
- Staging currently exposes `public.cancel_scheduled_content(p_job_id uuid, p_note text DEFAULT NULL)`.
- GitHub's tracked migration file uses the two-argument form, but Production live state has the one-argument form.
- Before changing Production's signature, inspect every app/Edge Function caller and confirm whether it sends `p_note`. Keep a compatible one-argument wrapper if any caller relies on the current signature.

### Cancellation behavior
- Production locks the job first, then content; clears `channel_id` on restoration; and does not verify that the content still matches the exact cancelled schedule before restoring.
- Staging locks content before job, verifies schedule time and channel identity, avoids overwriting a newer schedule, and appends an audit event.
- Staging behavior is the stronger candidate, but must be tested for lock ordering, concurrent schedule/cancel operations, duplicate active jobs, and expected channel_id semantics before adoption.

### Other missing migration source files
The audit branch migration directory does not currently contain tracked SQL for the live Production safe channel removal migration, Production OAuth token vault migration, Staging private-RPC move, or Staging three-channel-groups migration. Do not reconstruct or replay these from names alone. Capture/compare exact live definitions and schema state before creating a canonical forward migration.

## 5. Security Advisor findings (observed 2026-11-07)

### Production
- WARN: 3 authenticated SECURITY DEFINER functions in public (cancel, review, schedule).
- WARN: leaked password protection disabled.
- INFO: private.platform_oauth_tokens has RLS enabled with no policies. This is expected only if access is intentionally restricted to privileged server roles; verify grants before changing.

### Staging
- WARN: leaked password protection disabled.
- No SECURITY DEFINER public RPC warning for the reviewed three functions.

Remediation links:
- [SECURITY DEFINER callable by authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

## 6. Required checks before executable migration SQL

1. Search the current frontend and Edge Function code for all three RPC names and capture exact parameter payloads.
2. Inspect exact ACLs on `private.platform_oauth_tokens`, its owner, and any token-vault helper functions; never query token values.
3. Fetch exact live definitions of `remove_channel_safely` and the OAuth token-vault helpers; compare with any tracked SQL.
4. Confirm cancellation audit constraint values and test expected channel_id behavior.
5. Build the migration on a disposable database branch, test authenticated RPC calls and cross-owner denial, then run Supabase Security and Performance Advisors.
6. Confirm a recent backup/PITR restore point before any Production DDL and obtain explicit approval.

## 7. Explicit safety boundary

No DDL/DML was run. No grants or revokes were changed. No migration history was modified. No Production or Staging changes were applied. This document is a design decision record, not executable migration SQL.
