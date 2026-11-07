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
        // Resolve Facebook share URLs server-side, following only Facebook-owned redirects.
        // Never substitute the token owner's /me identity for the submitted target URL.
        let resolvedHandle = handle;
        let resolvedPageId = "";
        if (isShareLink) {
          let current = new URL(profileUrl);
          const allowedHosts = new Set(["facebook.com", "www.facebook.com", "m.facebook.com", "fb.com", "www.fb.com"]);
          for (let hop = 0; hop < 6; hop++) {
            if (!allowedHosts.has(current.hostname.toLowerCase())) {
              return json({ error: "Facebook share link redirected outside Facebook and was rejected.", code: "FACEBOOK_REDIRECT_UNSAFE" }, 422);
            }
            const redirectResponse = await fetch(current.toString(), {
              method: "GET",
              redirect: "manual",
              headers: { "User-Agent": "Mozilla/5.0 (compatible; NextGenProfileResolver/1.0)", "Accept": "text/html,application/xhtml+xml" },
            });
            if ([301, 302, 303, 307, 308].includes(redirectResponse.status)) {
              const location = redirectResponse.headers.get("location");
              if (!location) break;
              current = new URL(location, current);
              continue;
            }
            if (!redirectResponse.ok) break;
            const html = await redirectResponse.text();
            const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
              || html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1];
            if (canonical) {
              const canonicalUrl = new URL(canonical, current);
              if (allowedHosts.has(canonicalUrl.hostname.toLowerCase())) current = canonicalUrl;
            }
            break;
          }
          const finalHost = current.hostname.toLowerCase();
          if (!allowedHosts.has(finalHost)) {
            return json({ error: "Facebook share link did not resolve to a Facebook Page.", code: "FACEBOOK_REDIRECT_UNSAFE" }, 422);
          }
          const finalParts = current.pathname.split("/").filter(Boolean);
          if (finalParts[0]?.toLowerCase() === "profile.php" || current.pathname.toLowerCase().includes("profile.php")) {
            resolvedPageId = current.searchParams.get("id") || "";
          } else if (finalParts[0] && !["share", "watch", "reel", "reels", "posts", "photo", "permalink.php"].includes(finalParts[0].toLowerCase())) {
            resolvedHandle = finalParts[0];
          }
          if (!resolvedHandle && !resolvedPageId) {
            return json({
              error: "Facebook did not expose the destination Page from this share link. It may require a Facebook login or be a post/profile that cannot be resolved publicly.",
              code: "FACEBOOK_SHARE_DESTINATION_HIDDEN",
            }, 422);
          }
        }
        if (!resolvedHandle && !resolvedPageId) {
          return json({ error: "The Facebook URL does not contain a resolvable Page identifier.", code: "FACEBOOK_PAGE_IDENTIFIER_MISSING" }, 422);
        }
        const directUrl = "https://graph.facebook.com/v26.0/" +
          encodeURIComponent(resolvedPageId || resolvedHandle) + "?fields=id,name,username";
        const directResponse = await fetch(directUrl, {
          headers: { Authorization: "Bearer " + accessToken },
        });
        const directResult = await readJson(directResponse);
        if (!directResponse.ok) {
          console.error("channel-profile-lookup facebook_direct_lookup_error", {
            status: directResponse.status,
            provider_code: directResult.error?.code,
            provider_subcode: directResult.error?.error_subcode,
          });
          return json({
            error: "Facebook could not resolve this Page username with the saved token. Check that the Page is accessible to this account and the URL is correct.",
            code: "FACEBOOK_DIRECT_LOOKUP_FAILED",
            provider_status: directResponse.status,
          }, 404);
        }
        profile = { ...directResult, username: directResult.username || resolvedHandle };
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
