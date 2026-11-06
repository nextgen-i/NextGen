import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://nextgen-i.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const allowedPlatforms = ["youtube", "facebook", "instagram", "threads"] as const;
const allowedTypes = [
  "reel", "short_video", "long_form_video", "photo_post",
  "carousel_photo_post", "story", "text_post",
] as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function cleanString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function extractOutputText(response: Record<string, unknown>): string {
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const value = part as Record<string, unknown>;
      if (value.type === "output_text" && typeof value.text === "string") return value.text;
      if (value.type === "refusal") throw new Error("The content request was refused by the AI safety system.");
    }
  }
  throw new Error("The AI response did not contain structured content.");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required." }, 405);

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Sign in to NextGen first." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!supabaseUrl || !anonKey) return json({ error: "Supabase function configuration is incomplete." }, 500);
  if (!openAiKey) return json({ error: "AI provider is not configured yet. Add OPENAI_API_KEY as a server-side Edge Function secret." }, 503);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return json({ error: "Your session is invalid. Sign in again." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Send a valid JSON body." }, 400);
  }

  const platform = cleanString(body.platform, 20).toLowerCase();
  const contentType = cleanString(body.content_type, 30).toLowerCase();
  const brief = cleanString(body.brief, 1200);
  const language = cleanString(body.language || "English", 40);
  const audience = cleanString(body.target_audience || "general audience", 160);
  const brandName = cleanString(body.brand_name, 100);
  const channelId = cleanString(body.channel_id, 80) || null;
  const count = Number.isInteger(body.count) ? Number(body.count) : 3;

  if (!allowedPlatforms.includes(platform as typeof allowedPlatforms[number])) {
    return json({ error: "platform must be youtube, facebook, instagram, or threads." }, 400);
  }
  if (!allowedTypes.includes(contentType as typeof allowedTypes[number])) {
    return json({ error: "Choose a supported content_type." }, 400);
  }
  if (!brief) return json({ error: "Add a topic or content brief before generating drafts." }, 400);
  if (!Number.isInteger(count) || count < 1 || count > 3) {
    return json({ error: "Generate between 1 and 3 drafts per request." }, 400);
  }

  if (channelId) {
    const { data: channel, error } = await supabase
      .from("channels")
      .select("id, platform, is_paused")
      .eq("id", channelId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (error) return json({ error: "Could not verify channel ownership." }, 400);
    if (!channel) return json({ error: "Channel not found for this account." }, 404);
    if (channel.platform !== platform) return json({ error: "The selected channel does not match the requested platform." }, 400);
    if (channel.is_paused) return json({ error: "This channel is paused. No draft was created." }, 409);
  }

  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      drafts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            caption: { type: "string" },
            description: { type: "string" },
            hashtags: { type: "array", items: { type: "string" } },
            tags: { type: "array", items: { type: "string" } },
            keywords: { type: "array", items: { type: "string" } },
            thumbnail_prompt: { type: "string" },
          },
          required: ["title", "caption", "description", "hashtags", "tags", "keywords", "thumbnail_prompt"],
        },
      },
    },
    required: ["drafts"],
  };

  const instructions = [
    "You are NextGen's social content drafting assistant.",
    "Create original, brand-safe draft content. Never claim that facts have been verified.",
    "Do not invent statistics, quotations, endorsements, news, or personal experiences.",
    "Avoid copyrighted lyrics, copied scripts, impersonation, political persuasion, harassment, hate, adult content, and dangerous instructions.",
    "If the brief asks for uncertain or sensitive claims, use cautious wording and clearly flag the subject for human review in the caption.",
    "Return exactly the requested number of distinct drafts in the required JSON schema.",
    "All generated content remains unpublished and requires explicit human approval.",
  ].join(" ");

  const input = [
    `Platform: ${platform}`,
    `Content type: ${contentType}`,
    `Language: ${language}`,
    `Target audience: ${audience}`,
    brandName ? `Brand/channel name: ${brandName}` : "",
    `Brief/topic: ${brief}`,
    `Create exactly ${count} distinct drafts.`,
    "Keep the title concise, caption platform-appropriate, hashtags without #, and tags/keywords useful for search.",
    "Thumbnail prompt should describe an original visual and must not request a real person's likeness.",
  ].filter(Boolean).join("\n");

  let generated: { drafts: Array<Record<string, unknown>> };
  try {
    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions,
        input,
        max_output_tokens: 2400,
        text: {
          format: {
            type: "json_schema",
            name: "nextgen_content_drafts",
            strict: true,
            schema,
          },
        },
      }),
    });
    const payload = await aiResponse.json();
    if (!aiResponse.ok) {
      console.error("OpenAI draft generation failed:", aiResponse.status, payload?.error?.type || "provider_error");
      return json({ error: "AI draft generation failed. Please try again later." }, 502);
    }
    generated = JSON.parse(extractOutputText(payload));
  } catch (error) {
    console.error("NextGen AI draft generation error:", error instanceof Error ? error.message : "unknown");
    return json({ error: "Could not generate drafts. Please revise the brief and try again." }, 502);
  }

  if (!Array.isArray(generated.drafts) || generated.drafts.length !== count) {
    return json({ error: "The AI returned an incomplete draft set. Nothing was saved; please try again." }, 502);
  }

  const rows = generated.drafts.map((draft) => ({
    owner_id: user.id,
    channel_id: channelId,
    platform,
    content_type: contentType,
    title: cleanString(draft.title, 180) || "Untitled draft",
    caption: cleanString(draft.caption, 5000),
    description: cleanString(draft.description, 5000),
    hashtags: Array.isArray(draft.hashtags) ? draft.hashtags.filter((v): v is string => typeof v === "string").map(v => v.trim().replace(/^#/, "").slice(0, 80)).filter(Boolean).slice(0, 30) : [],
    tags: Array.isArray(draft.tags) ? draft.tags.filter((v): v is string => typeof v === "string").map(v => v.trim().slice(0, 80)).filter(Boolean).slice(0, 30) : [],
    keywords: Array.isArray(draft.keywords) ? draft.keywords.filter((v): v is string => typeof v === "string").map(v => v.trim().slice(0, 80)).filter(Boolean).slice(0, 30) : [],
    thumbnail_prompt: cleanString(draft.thumbnail_prompt, 1200) || null,
    status: "draft",
    scheduled_for: null,
    published_at: null,
    safety_checks: {
      ai_generated: true,
      manual_review_required: true,
      checks_completed: false,
      published: false,
      scheduled: false,
      note: "AI-generated draft only. Factual, spelling, copyright, duplicate, and platform-policy checks have not been completed. Explicit human approval is required.",
    },
  }));

  if (rows.some(row => !row.caption)) return json({ error: "The AI returned an empty caption. Nothing was saved." }, 502);

  const { data, error } = await supabase.from("content_items")
    .insert(rows)
    .select("id, platform, content_type, title, caption, hashtags, tags, keywords, status, created_at, safety_checks");

  if (error) {
    console.error("NextGen draft insert failed:", error.message);
    return json({ error: "Drafts could not be saved to your NextGen account." }, 400);
  }

  return json({
    ok: true,
    message: "AI drafts saved for manual review. Nothing was approved, scheduled, or published.",
    drafts: data ?? [],
  }, 201);
});
