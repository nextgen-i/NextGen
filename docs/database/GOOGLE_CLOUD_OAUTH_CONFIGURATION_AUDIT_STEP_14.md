# NextGen Google Cloud OAuth App Configuration Audit — Step 14

Date: 2026-11-08
Branch: `audit/migration-reconciliation`
Status: configuration checklist and audit only; no Google Cloud, Supabase, code, credential, database, or deployment changes

## 1. Purpose and boundary

This step prepares the Google Cloud configuration required for the future NextGen YouTube OAuth integration. It is separate from Google Sign-In used to log in to NextGen: Google Sign-In authenticates a person to NextGen, while YouTube OAuth grants NextGen permission to access that person's YouTube channel and perform specifically consented YouTube actions.

This audit does not create OAuth clients, enable APIs, add test users, submit verification, change redirect URIs, or store secrets.

## 2. Official Google requirements reviewed

Sources reviewed on 2026-11-08:
- Google OAuth 2.0 web-server flow: https://developers.google.com/identity/protocols/oauth2/web-server
- YouTube Data API authorization: https://developers.google.com/youtube/data/guides/authentication
- YouTube Data API OAuth scopes: https://developers.google.com/youtube/v3/guides/auth/client-side-web-apps
- Google Auth Platform consent configuration: https://developers.google.com/workspace/guides/configure-oauth-consent
- OAuth production readiness and policy compliance: https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance

Verified requirements:
- Enable the YouTube Data API v3 in the Google Cloud project before calling it.
- A server-side web application OAuth client is the intended client type for the planned confidential server-side authorization-code flow.
- The callback redirect URI must exactly match an authorized redirect URI registered on that OAuth client; scheme, case, path, and trailing slash matter.
- Keep OAuth client secrets out of public repositories, browser bundles, screenshots, chat, and client-side code.
- Use authorization code flow, validate one-time state on callback, and request offline access only where background work requires refresh tokens.
- Request the narrowest scopes needed and add publishing scope only when publishing is actually ready to be enabled.
- API keys are for public-only YouTube data requests; private user data and write operations require OAuth 2.0.
- Google requires a consent/branding configuration. Audience, test-user and verification requirements depend on the app's audience and requested data scopes.
- Google OAuth production-readiness guidance calls for separate testing and production projects.

## 3. Recommended Google Cloud project separation

Maintain distinct Google Cloud projects for:
1. NextGen Development/Staging OAuth testing.
2. NextGen Production OAuth for public users.

Do not reuse a development OAuth client in production. Keep each project's API enablement, OAuth client, consent configuration, redirect URI, test-user list, quota and secrets isolated. Confirm actual project IDs and ownership in Cloud Console; none were inferred in this audit.

## 4. Console configuration checklist

### A. API enablement
In the intended Development/Staging Google Cloud project:
1. Open Google Cloud Console → APIs & Services → Library.
2. Find **YouTube Data API v3**.
3. Check whether it is already enabled. If not, enable it only after the owner confirms the correct project.
4. Review Quotas and system limits. Do not assume a quota increase or upload quota is available.

Repeat separately for Production only when its project is confirmed and the production rollout is approved.

### B. Google Auth Platform — Branding
Review:
- App name: NextGen.
- User support email: an owner-approved, monitored address.
- App logo: approved NextGen logo asset.
- Application home page: deployed public NextGen home page.
- Privacy policy URL and Terms of Service URL: public, accessible, accurate pages.
- Authorized domains: only domains owned and verified by the project owner.
- Developer contact email: monitored operational address.

Do not enter guessed URLs, personal contact details, or unverified domains. Verify that the privacy policy clearly describes YouTube data access, use, storage, retention, sharing, deletion and disconnect/revocation.

### C. Google Auth Platform — Audience
Determine and record:
- Internal vs External audience.
- Whether the project is eligible for Internal use (normally restricted to a Google Workspace organization).
- For External testing, the authorized test-user list and any testing-mode limitations.
- Production publishing/verification status and the requirements Google displays for the actual requested scopes.

Do not switch an app to production or add real users until the owner approves the privacy, policy and verification readiness.

### D. Google Auth Platform — Data Access / scopes
Use least privilege and incremental authorization.

Initial channel connection / identity check:
- `https://www.googleapis.com/auth/youtube.readonly`

Only when the user separately enables YouTube publishing:
- `https://www.googleapis.com/auth/youtube.upload`

Do not request the broad `youtube` scope or unrelated Google scopes without a documented feature need. Confirm Google's current verification classification and any additional review requirements for the exact scopes in the Console before external launch.

### E. OAuth client
After the deployed callback endpoint and environment are confirmed:
1. Open Google Auth Platform → Clients (or the OAuth Clients page).
2. Create a **Web application** OAuth client for the matching environment.
3. Add the exact deployed NextGen web origin under Authorized JavaScript origins only if the selected implementation actually uses browser-origin OAuth requests.
4. Add the exact server callback URL under Authorized redirect URIs.
5. Store the client ID and client secret only in the appropriate environment's server-side secret manager / Supabase Edge Function secrets.

The exact origin and callback URI are intentionally not listed here: the production and staging callback function URLs have not been verified in this step. Never guess them. A mismatch causes `redirect_uri_mismatch`.

## 5. Secret handling rules

- Never paste the Google OAuth client secret into ChatGPT, screenshots, GitHub, frontend code, issue trackers or logs.
- Do not put the OAuth client secret in a public Vite/React environment variable or any variable compiled into browser JavaScript.
- Add the secret directly to the correct Staging server-side secret store only when implementation is approved.
- Keep Staging and Production client IDs/secrets separate.
- Do not use a Supabase publishable/anon key or service-role/secret key as a token-encryption key.
- The dedicated KMS/envelope-encryption design remains a prerequisite from Step 11/13.
- If a secret is exposed, rotate it in Google Cloud and update only the affected environment's secret store.

## 6. NextGen-specific configuration blockers

The following must be confirmed before creating the OAuth client:
- [ ] Actual Google Cloud Development/Staging project selected by owner.
- [ ] Actual Google Cloud Production project selected by owner.
- [ ] YouTube Data API v3 enabled state in each project.
- [ ] Deployed Staging OAuth callback endpoint and exact URL.
- [ ] Deployed Production OAuth callback endpoint and exact URL.
- [ ] Public NextGen home, privacy policy and terms URLs.
- [ ] Verified authorized domain(s).
- [ ] Support and developer contact email addresses.
- [ ] App audience and test-user plan.
- [ ] Exact requested scopes and Google verification requirements.
- [ ] Quota and publishing limits reviewed.
- [ ] Dedicated encryption/KMS design approved before storing tokens.

## 7. Owner review evidence requested

When ready, the owner can share screenshots of these Google Cloud Console pages:
1. Project selector showing the project name (project number/IDs may be masked).
2. YouTube Data API v3 API details showing Enabled/Disabled.
3. Google Auth Platform → Branding.
4. Google Auth Platform → Audience.
5. Google Auth Platform → Data Access / scopes.
6. Clients page showing client type and configured redirect URI, with client ID and secret fully masked.

Never share a client secret, API key, access token, refresh token, authorization code, recovery code or private credential in a screenshot or message. If the Console page displays any such value, cover it before sharing.

## 8. Go / no-go decision

**Current decision: NO-GO for OAuth client creation or production configuration.**

Reason: exact deployed callback endpoints, selected Google Cloud projects, public policy URLs, app audience and verification status have not yet been evidenced. Creating a client before these details are known risks incorrect redirect URIs, wrong environment configuration and unnecessary rework.

Next action after this audit: review the owner's masked screenshots, confirm the project/environment and deployed callback URLs, then prepare an exact configuration checklist. Any actual Google Cloud setting change requires a separate explicit instruction.

## 9. Non-changes

- No Google Cloud project, API, OAuth client, consent screen, audience, scope, test user or verification setting was changed.
- No client ID, client secret, API key, access token or refresh token was read or modified.
- No Supabase secrets, database schema, grants, migrations or Edge Functions were changed.
- No GitHub application code or frontend files were changed.
- No deployment, content publishing or scheduling occurred.
- Master Design v32 remains untouched.
