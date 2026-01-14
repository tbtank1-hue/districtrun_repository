import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface StravaTokenResponse {
  token_type: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
  athlete: {
    id: number;
    username: string;
    firstname: string;
    lastname: string;
    city: string;
    state: string;
    profile: string;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const userId = url.searchParams.get("state");

    if (!code) {
      return new Response(
        JSON.stringify({ error: "No authorization code provided" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "No user ID provided" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stravaClientId = Deno.env.get("STRAVA_CLIENT_ID");
    const stravaClientSecret = Deno.env.get("STRAVA_CLIENT_SECRET");

    if (!stravaClientId || !stravaClientSecret) {
      return new Response(
        JSON.stringify({ 
          error: "Strava not configured. Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET environment variables." 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const tokenResponse = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: stravaClientId,
        client_secret: stravaClientSecret,
        code: code,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return new Response(
        JSON.stringify({ error: "Failed to exchange code for token", details: errorText }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const tokenData: StravaTokenResponse = await tokenResponse.json();

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: updateError } = await supabase
      .from("users")
      .update({
        strava_id: tokenData.athlete.id,
        strava_access_token: tokenData.access_token,
        strava_refresh_token: tokenData.refresh_token,
        token_expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
        connected_at: new Date().toISOString(),
        first_name: tokenData.athlete.firstname || "",
        last_name: tokenData.athlete.lastname,
        profile_picture_url: tokenData.athlete.profile,
        city: tokenData.athlete.city,
        state: tokenData.athlete.state,
      })
      .eq("id", userId);

    if (updateError) {
      throw updateError;
    }

    const syncUrl = `${supabaseUrl}/functions/v1/sync-strava-activities`;
    fetch(syncUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId }),
    }).catch(() => {
      // Fire and forget
    });

    const appUrl = Deno.env.get("APP_URL") || "https://www.districtrun.co";
    const redirectUrl = `${appUrl}/dashboard?strava=connected`;
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        "Location": redirectUrl,
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});