# NextGen Supabase Migration Reconciliation Plan

Status: audit / planning only  
Base commit: d8b449d8e737a36d618810c96f8bd7a78f27f810  
Branch: audit/migration-reconciliation

## Safety boundary
- No database migrations have been applied by this plan.
- Production and Staging schemas/data must remain unchanged during this planning phase.
- Do not apply a Production migration until a current backup / PITR restore point is verified in the Supabase Dashboard and the migration is reviewed.
- Preserve the NextGen Master Design v32 Locked; this database task must not change frontend layout, CSS, navigation, typography, colors, or page structure.

## Observed drift
- Production and Staging each report 14 migration history entries, but the versions and contents do not match.
- The repository migration directory is incomplete and does not represent either database history exactly.
- Production has a private OAuth token vault table/schema and a safe channel-removal function that are absent from Staging.
- Staging has a private RPC layout (nextgen_private) and a three-channel-groups migration that are absent from Production.
- Production exposes three SECURITY DEFINER RPCs in public; Staging uses private-schema implementations with public wrappers.
- Production's cancellation function is older than Staging's implementation. Staging includes stronger owner-scoped checks, consistent row-lock order, schedule-state matching, and an audit event.

## Reconciliation work order
1. Inventory and compare every migration file in GitHub against both live migration histories. Do not infer equivalence from filenames alone; compare SQL bodies and live function definitions.
2. Review the Data API exposed-schema configuration and exact schema/function ACLs before deciding whether nextgen_private is truly non-exposed and appropriately protected.
3. Select one canonical migration-history strategy and document the intended end state for Production, Staging, and GitHub.
4. Prepare a reviewed SQL draft for moving privileged RPC implementations into a non-exposed schema, retaining only compatibility wrappers that are safe for authenticated callers. Verify auth.uid() ownership checks, explicit grants/revokes, function owner, search_path, and PUBLIC/anon execution.
5. Separately review the improved cancellation logic, including channel_id semantics and concurrent-job edge cases, before proposing any Production change.
6. Reconcile safe channel removal and the OAuth token vault migration without exposing or logging secrets.
7. Review the Staging three-channel-groups feature as a separate product/schema change; do not automatically port it to Production.
8. Test the complete proposed migration sequence on a disposable development database/branch before any Production deployment.
9. After tests pass, obtain explicit approval and verify backup/PITR before applying to Production. Run Supabase security/performance advisors and read-only verification queries after deployment.

## Current decision
Production is treated as the provisional comparison baseline for this audit only. This is not authorization to alter Production, and canonical migration history remains subject to explicit confirmation after the complete diff is reviewed.

## Not in scope
- No UI, branding, layout, design, CSS, or navigation changes.
- No channel connection changes.
- No content publishing, scheduling, or approval setting changes.
- No production data updates or deletions.
