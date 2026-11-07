# NextGen Private RPC Security Review — Step 4

Status: read-only database inspection; documentation only  
Branch: audit/migration-reconciliation  
No schema changes, grants, revokes, migrations, or application changes were made.

## Confirmed live function layout

### Production
- `public.cancel_scheduled_content(p_job_id uuid)` — SECURITY DEFINER; search_path `public, pg_temp`; authenticated EXECUTE true; anon EXECUTE false.
- `public.review_content_item(p_content_id uuid, p_action text, p_note text)` — SECURITY DEFINER; search_path `public, pg_temp`; authenticated EXECUTE true; anon EXECUTE false.
- `public.schedule_approved_content(p_content_id uuid, p_channel_id uuid, p_scheduled_for timestamptz)` — SECURITY DEFINER; search_path `public, pg_temp`; authenticated EXECUTE true; anon EXECUTE false.
- Each inspected function checks `auth.uid()` and scopes the relevant content/job/channel to the authenticated owner.
- `public.remove_channel_safely(p_channel_id uuid)` exists as SECURITY INVOKER.

### Staging
- Three privileged implementations exist in `nextgen_private`, each SECURITY DEFINER, owner postgres, with an empty search_path.
- Matching `public` SQL wrappers exist and are SECURITY INVOKER with an empty search_path.
- anon has no schema USAGE and no EXECUTE on the private functions.
- authenticated has schema USAGE on `nextgen_private` and EXECUTE on the three private functions, in addition to EXECUTE on the public wrappers.
- The private implementations include explicit `auth.uid()` and owner checks.
- Staging cancellation has stronger state matching, lock ordering, and audit-event behavior than Production.

## Security interpretation

1. Staging's private-schema design is a better direction than putting SECURITY DEFINER implementations directly in public, because the public endpoints are invoker wrappers.
2. However, `nextgen_private` is not inaccessible to authenticated at the PostgreSQL privilege layer: authenticated has both schema USAGE and EXECUTE on the implementation functions. That may be necessary for invoker wrappers to call them, but it means the schema must be excluded from PostgREST/Data API exposed schemas if direct RPC access is not intended.
3. The Supabase project metadata endpoint did not expose the Data API exposed-schema configuration. Therefore, whether `nextgen_private` is excluded from REST/RPC exposure remains UNVERIFIED and must be checked in each project's Dashboard API settings.
4. Production's public SECURITY DEFINER functions are currently callable by authenticated users and contain owner checks. This is not proof of an exploitable issue, but it is a hardening priority because SECURITY DEFINER bypasses ordinary RLS.
5. Do not simply copy Staging's grants into Production. First verify API exposure, wrapper invocation behavior, function ACLs, function ownership, and whether private function EXECUTE can be narrowed without breaking the wrappers.
6. Keep `private.platform_oauth_tokens` in a non-exposed schema. Production has RLS enabled on that table; this review did not inspect token values.

## Recommended target architecture (not yet implemented)

- Keep privileged implementation functions in a schema excluded from Supabase Data API exposed schemas.
- Keep client-compatible public wrappers SECURITY INVOKER with fixed/empty search_path and schema-qualified calls.
- Grant only the minimum schema USAGE and function EXECUTE required for wrapper invocation; revoke PUBLIC and anon explicitly.
- Keep explicit auth.uid() and owner checks inside every privileged implementation.
- Use an empty/fixed search_path and schema-qualify every relation/function reference.
- Test wrapper invocation using an authenticated test user on a disposable database branch before any production migration.
- Decide whether the private implementation functions should be executable directly by authenticated users. Do not assume schema privacy alone prevents RPC calls if the schema is exposed.
- Preserve the improved Staging cancellation checks, but confirm expected channel_id behavior before adopting.

## Required manual verification before migration drafting can be finalized

In Supabase Dashboard for BOTH projects:
1. Open Integrations / Data API settings.
2. Inspect the exact Exposed schemas list.
3. Confirm whether `nextgen_private` (Staging) and `private` (Production) are absent.
4. Record the result without changing the setting.

## Safety
Read-only SQL inspection only. No SQL DDL or DML was run. No migration was applied. No GitHub main-branch changes were made. No frontend or Master Design v32 files were touched.


## Additional ACL verification (follow-up)

A direct ACL expansion of the inspected functions confirms:
- Production public SECURITY DEFINER functions grant EXECUTE to `authenticated` and `service_role`; no PUBLIC or anon EXECUTE grant appears in the effective ACL.
- Staging private SECURITY DEFINER functions grant EXECUTE to `authenticated` and `service_role`; no PUBLIC or anon EXECUTE grant appears in the effective ACL.
- Staging public invoker wrappers grant EXECUTE to `authenticated` and `service_role`; no PUBLIC or anon EXECUTE grant appears in the effective ACL.
- Production's `remove_channel_safely` is invoker and grants EXECUTE to authenticated and service_role only.

This reduces the concern about anonymous/public function execution, but does not resolve whether the `nextgen_private` schema is listed in the Data API exposed schemas. Authenticated has both USAGE and EXECUTE on the private schema/functions, so direct Data API RPC reachability still depends on that project setting. No privilege changes were made.


## Dashboard verification completed from user-provided screenshots

The user supplied the open Exposed schemas dropdown for both projects.

- Production (NextGen): checked schemas are `graphql_public` and `public`; `private` is unchecked. Confirmed not exposed.
- Staging (NextGen-Staging): checked schemas are `graphql_public` and `public`; `nextgen_private` is unchecked. Confirmed not exposed.
- The Staging screenshot also shows the separate Extra search path dropdown open; it is not the Exposed schemas control and was not used to infer exposure.
- No selection was changed and no Save action was performed.

This resolves the Data API exposure uncertainty for these two private schemas: neither is included in the exposed schemas list. Keep the existing grants as-is for now; any privilege tightening or RPC architecture migration still requires a separately reviewed, tested migration and explicit approval.
