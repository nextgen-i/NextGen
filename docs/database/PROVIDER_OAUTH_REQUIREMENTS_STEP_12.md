# NextGen Provider OAuth Requirements — Step 12

Date: 2026-11-07
Branch: `audit/migration-reconciliation`
Status: official-source review and implementation specification only; no code, secrets, database, or deployment changes

## 1. Purpose

Translate the Step 11 secure architecture into provider-specific requirements without guessing app configuration, callback URLs, scopes, or token behavior. Provider-specific configuration must be confirmed in the actual Google Cloud / Meta developer apps before implementation.

## 2. Provider comparison

| Platform | Verified from reviewed sources | NextGen implementation implication | Still must verify |
|---|---|---|---|
| YouTube | YouTube Data API requires OAuth for private channel data and write operations. Public-only data can use a restricted API key. Server-side web apps can request offline access for refresh tokens. | Use server-side authorization-code flow. Use read-only permission for channel discovery if sufficient; request upload/manage scope only when user enables publishing. | Exact scopes for every feature, OAuth consent screen / verification status, redirect URI, token policy, app quota and audit requirements. |
| Instagram | Meta's official Postman Instagram API collection says the API is for Instagram Professional accounts (Businesses and Creators), and requires a Meta app and user access token. | Do not assume personal Instagram accounts are eligible. Verify the professional account and supported login route before marking Connected. | Whether NextGen uses Instagram Login or Facebook Login route; exact current permissions, account prerequisites, token exchange/refresh/revoke rules, app review and business verification. |
| Threads | Meta's official Threads API collection requires a Meta app with the Threads use case and user authorization. Its Postman setup documents authorization-code grant configuration. | Treat Threads as a distinct provider integration and permission set, even if Meta developer app infrastructure is shared. | Exact scopes, authorization/token endpoints, PKCE requirements, token lifetime/refresh/revoke semantics, app review requirements and callback URL. |
| Facebook Pages | The reviewed source set did not provide enough official Facebook Login / Pages documentation to certify exact permissions or token behavior. | Do not reuse Instagram or Threads assumptions. Keep Facebook connection Pending until the Page identity and permissions are verified server-side. | Current Facebook Login flow, Page access token derivation, exact Page permissions, long-lived token exchange/refresh/revoke behavior, app review and business verification. |

## 3. Confirmed YouTube details

- YouTube Data API OAuth is required for private user data and insert/update/delete operations.
- Public-only requests may use an API key; restrict that key to the YouTube Data API and appropriate application origins/IPs.
- Server-side web applications should request offline access when NextGen needs scheduled/background publishing and refresh capability.
- Google documents `https://www.googleapis.com/auth/youtube.readonly` for account viewing and `https://www.googleapis.com/auth/youtube.upload` for video management/upload. A broader `youtube` scope exists, but least privilege should be preferred.
- Google notes refresh tokens may only be returned on first authorization and limits the number issued per user/client. Store and reuse valid refresh tokens rather than repeatedly forcing re-consent.
- Google requires the redirect URI to exactly match an authorized URI.

Do not request upload/manage scopes merely to auto-detect a channel name. Separate channel discovery from publishing authorization where the provider and product design permit.

## 4. Meta platform requirements and unresolved items

- Instagram API source reviewed describes Professional (Business/Creator) accounts, not arbitrary personal accounts.
- Threads requires a Meta app with Threads use case and explicit user authorization.
- The reviewed Meta Postman collections are useful implementation references, but final permission and policy decisions must be checked against the current official Meta developer documentation and the actual app's available products.
- Facebook Pages permissions and Page token behavior have not yet been verified to a sufficient standard in this step.
- No Meta scope names are approved by this report. In particular, do not copy old permission names from earlier setup attempts without confirming the current official docs and App Dashboard configuration.

## 5. Proposed feature-to-permission approach

| NextGen feature | Permission strategy |
|---|---|
| Detect connected account name / handle | Request only the minimum identity/profile read permission supported by the chosen provider login route. |
| Read channel/profile analytics | Request analytics/insights permissions only when user enables analytics. |
| Create drafts / prepare content locally | No provider publishing permission needed. |
| Publish or schedule approved content | Request the provider's minimum content-publishing permission only when the user connects that publishing feature. |
| Background scheduled publishing | Requires a valid server-side refresh/re-authorization path and provider terms compliance. |
| Disconnect | Revoke provider grant where supported, erase encrypted token material, and update connection metadata. |

Manual approval remains the default. OAuth success never implies permission to auto-publish.

## 6. Configuration checklist before implementation

For each platform and environment (Staging and Production), record and verify:
- Developer app ID and app type/use case (IDs only in the report; never secrets).
- Exact OAuth authorization and token endpoints from current official docs.
- Exact redirect URI registered in the provider dashboard.
- Exact requested scopes, each mapped to a NextGen feature and justification.
- PKCE support/requirement and client authentication method.
- Token lifetime, refresh behavior, refresh-token rotation, and revocation endpoint.
- Provider account eligibility and required Page / Professional account linkage.
- App mode, tester roles, review/verification status, data-use checks and platform policy requirements.
- Rate limits, API product access and publishing constraints.

Client secrets, access tokens, refresh tokens, encryption keys and full credential files must never be committed to GitHub or pasted into chat.

## 7. Recommended implementation order

1. **YouTube first:** the official Google server-side web-app flow and YouTube Data API requirements are sufficiently documented to draft a provider-specific design, subject to checking the actual Google Cloud app configuration.
2. **Instagram second:** choose the correct Meta login route and verify Professional account eligibility, current permissions and token lifecycle.
3. **Threads third:** configure the Threads use case and verify current scopes and token lifecycle separately.
4. **Facebook Pages fourth:** complete a dedicated Facebook Login / Pages permissions audit before implementation.

This order is a planning recommendation, not a commitment to deploy or enable any provider.

## 8. Official sources reviewed

- Google OAuth 2.0 for Web Server Applications: https://developers.google.com/identity/protocols/oauth2/web-server
- YouTube Data API — Implement authorization: https://developers.google.com/youtube/data/guides/authentication
- YouTube Data API — Upload a video: https://developers.google.com/youtube/data/guides/uploading_a_video
- Meta Instagram API official Postman collection: https://www.postman.com/meta/instagram/collection/6yqw8pt/instagram-api
- Meta Threads API official Postman documentation: https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api

The Meta Postman workspaces link back to Meta's developer documentation and changelog. Before implementation, verify every Meta detail against the live official docs and the connected developer app dashboard.

## 9. Scope and safety confirmation

- Audit branch only.
- No database DDL/DML or migration history changes.
- No Edge Function code or deployment changes.
- No API key, provider secret, access token, or refresh token read or changed.
- No UI / Master Design v32 changes.
- Production and Staging remain unchanged.
