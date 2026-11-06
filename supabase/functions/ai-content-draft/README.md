# NextGen AI content draft generator

This Edge Function creates 1–3 AI-assisted content drafts for the authenticated NextGen user.

## Safety behavior

- Requires a valid Supabase user session.
- Writes only to `content_items` with status `draft`.
- Sets `manual_review_required: true` and `checks_completed: false`.
- Never approves, schedules, or publishes content.
- Validates an optional channel belongs to the signed-in user, matches the platform, and is not paused.
- Does not claim factual, spelling, copyright, duplicate, or platform-policy checks have been completed.

## Required Edge Function secrets

Set these as server-side Supabase Edge Function secrets; never put them in browser code or Git:

- `OPENAI_API_KEY` — required provider key.
- `OPENAI_MODEL` — optional; defaults to `gpt-4o-mini`.

Supabase supplies `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the Edge Function runtime.

## Request

Authenticated POST to `/functions/v1/ai-content-draft`:

```json
{
  "platform": "youtube",
  "content_type": "reel",
  "brief": "A short educational video about choosing a durable sofa",
  "language": "English",
  "target_audience": "Homeowners",
  "brand_name": "NextGen Demo Brand",
  "count": 3,
  "channel_id": null
}
```

Allowed platforms: `youtube`, `facebook`, `instagram`, `threads`.

Allowed content types: `reel`, `short_video`, `long_form_video`, `photo_post`, `carousel_photo_post`, `story`, `text_post`.

## Deployment and verification status

- Source added on branch `automation-foundation`.
- Not deployed to Production or Staging.
- Not connected to the Content page yet.
- Requires an Edge Function secret and an authenticated end-to-end test before deployment.
- No scheduler or background worker is created by this function.
