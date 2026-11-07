// NextGen secure channel profile lookup.
// Provider tokens and API keys remain server-side; never expose them to browser code.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://nextgen-i.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function parseProfileUrl(platform: string, rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("Use a valid HTTPS profile link.");
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (platform === "facebook") {
    if (!["facebook.com", "m.facebook.com", "fb.com"].includes(host)) {
      throw new Error("The link does not match Facebook.");
    }
    // Share links contain an opaque share ID, not a username. Do not treat "share" as a handle.
    if (parts[0]?.toLowerCase() === "share") return { handle: "", isShareLink: true };
    return { handle: parts[0] || "", isShareLink: false };
  }
  if (platform === "youtube" && ["youtube.com", "m.youtube.com"].includes(host)) {
    return { handle: parts.find((part) => part.startsWith("@")) || "", isShareLink: false };
  }
  if (platform === "instagram" && host === "instagram.com") {
    return { handle: parts[0] || "", isShareLink: false };
  }
  if (platform === "threads" && ["threads.net", "threads.com"].includes(host)) {
    return { handle: parts[0] || "", isShareLink: false };
  }
  throw new Error("The link does not match the selected platform.");
}

async function readJson(response: Response) {
  return await response.json().catch(() => ({}));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) {
      console.error("channel-profile-lookup: missing Supabase environment configuration");
      return json({ error: "Supabase function environment is not configured." }, 500);
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Sign in to NextGen first." }, 401);

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Your session is invalid or expired. Please sign in again." }, 401);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Request body must be valid JSON." }, 400);
    }

    const platform = String(body.platform || "").toLowerCase();
    const profileUrl = String(body.url || "").trim();
    if (!["youtube", "facebook", "instagram", "threads"].includes(platform)) {
      return json({ error: "Unsupported platform." }, 400);
    }
    if (!profileUrl) return json({ error: "A channel or profile link is required." }, 400);

    const { handle, isShareLink } = parseProfileUrl(platform, profileUrl);
    let profile: Record<string, unknown> | null = null;

    if (platform === "youtube") {
      const apiKey = Deno.env.get("YOUTUBE_DATA_API_KEY");
      if (!apiKey) return json({ error: "YouTube API is not configured. Add YOUTUBE_DATA_API_KEY to Supabase function secrets." }, 503);
      if (!handle.startsWith("@")) return json({ error: "Use the channel's YouTube handle URL (youtube.com/@handle)." }, 400);
      const apiUrl = "https://www.googleapis.com/youtube/v3/channels?part=snippet&forHandle=" +
        encodeURIComponent(handle) + "&key=" + encodeURIComponent(apiKey);
      const response = await fetch(apiUrl);
      const result = await readJson(response);
      if (!response.ok) {
        console.error("channel-profile-lookup provider_error", { platform, status: response.status });
        return json({ error: "YouTube rejected the lookup. Check the server-side API key and API access.", provider_status: response.status }, 502);
      }
      profile = result.items?.[0]?.snippet || null;
    } else {
      const accessToken = String(body.access_token || (
        platform === "facebook" ? Deno.env.get("FACEBOOK_PAGE_ACCESS_TOKEN") || "" : ""
      )).trim();
      if (!accessToken) {
        return json({
          error: "Connect and authorize this account first. The provider token must be saved securely in Supabase.",
          code: "OAUTH_REQUIRED",
          platform,
        }, 428);
      }

      if (platform === "facebook") {
        const meResponse = await fetch(
          "https://graph.facebook.com/v26.0/me?fields=id,name,username,category",
          { headers: { Authorization: "Bearer " + accessToken } },
        );
        const me = await readJson(meResponse);
        if (!meResponse.ok) {
          console.error("channel-profile-lookup provider_error", { platform, status: meResponse.status, provider_code: me.error?.code });
          return json({ error: "Facebook rejected the saved token. Re-authorize the Facebook Page in NextGen.", provider_status: meResponse.status, code: "FACEBOOK_TOKEN_REJECTED" }, 502);
        }

        // A Page token resolves /me directly to the Page. A User token resolves /me to a person,
        // so fetch the Pages the user can manage and select only an unambiguous match.
        if (me.category && me.name) {
          profile = me;
        } else {
          const pagesResponse = await fetch(
            "https://graph.facebook.com/v26.0/me/accounts?fields=id,name,username,access_token",
            { headers: { Authorization: "Bearer " + accessToken } },
          );
          const pagesResult = await readJson(pagesResponse);
          if (!pagesResponse.ok) {
            console.error("channel-profile-lookup pages_error", { status: pagesResponse.status, provider_code: pagesResult.error?.code });
            return json({ error: "Facebook did not allow this User Token to list Pages. Use a Page Access Token or re-authorize pages_show_list.", provider_status: pagesResponse.status, code: "FACEBOOK_PAGES_ACCESS_DENIED" }, 403);
          }
          const pages = Array.isArray(pagesResult.data) ? pagesResult.data : [];
          const wanted = handle.replace(/^@/, "").toLowerCase();
          let selected = wanted
            ? pages.find((page: any) => String(page.username || "").replace(/^@/, "").toLowerCase() === wanted)
            : null;
          if (!selected && pages.length === 1) selected = pages[0];
          if (!selected) {
            return json({
              error: pages.length
                ? "More than one Facebook Page is available. Use that Page's direct Page Access Token to verify the correct Page."
                : "No Facebook Pages were returned for this User Token.",
              code: "FACEBOOK_PAGE_SELECTION_REQUIRED",
              page_count: pages.length,
            }, 409);
          }
          profile = { id: selected.id, name: selected.name, username: selected.username };
        }
      } else {
        const apiUrl = platform === "instagram"
          ? "https://graph.instagram.com/v23.0/me?fields=id,username,name"
          : "https://graph.threads.net/v1.0/me?fields=id,username,name";
        const response = await fetch(apiUrl, { headers: { Authorization: "Bearer " + accessToken } });
        const result = await readJson(response);
        if (!response.ok) {
          console.error("channel-profile-lookup provider_error", { platform, status: response.status, provider_code: result.error?.code });
          return json({ error: "The platform rejected the saved token. Re-authorize this account.", platform, provider_status: response.status }, 502);
        }
        profile = result;
      }
    }

    const displayName = String(profile?.title || profile?.name || "").trim();
    const returnedHandle = String(profile?.customUrl || profile?.username || handle).trim();
    if (!displayName) {
      return json({
        error: "The platform did not return a verified Page or channel name for this link.",
        platform,
        code: platform === "facebook" ? "FACEBOOK_PAGE_LOOKUP_EMPTY" : "PROFILE_LOOKUP_EMPTY",
      }, 404);
    }

    return json({
      platform,
      display_name: displayName,
      handle: returnedHandle,
      provider_id: profile?.id ? String(profile.id) : undefined,
      verified_by_platform: true,
      share_link: platform === "facebook" ? isShareLink : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected lookup error.";
    console.error("channel-profile-lookup unhandled_error", { message });
    return json({ error: "Profile lookup failed safely. Check the function logs for the diagnostic message." }, 500);
  }
});
