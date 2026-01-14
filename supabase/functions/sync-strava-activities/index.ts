import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_speed: number;
  max_speed: number;
  start_latlng: [number, number] | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  manual: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
}

interface RefreshTokenResponse {
  token_type: string;
  access_token: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
}

async function refreshStravaToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<RefreshTokenResponse> {
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Strava token");
  }

  return await response.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { userId } = await req.json();

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
          error: "Strava not configured" 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("strava_access_token, strava_refresh_token, token_expires_at, last_synced_at")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!user.strava_access_token || !user.strava_refresh_token) {
      return new Response(
        JSON.stringify({ error: "User has not connected Strava" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let accessToken = user.strava_access_token;
    const tokenExpiresAt = new Date(user.token_expires_at);
    const now = new Date();

    if (now >= tokenExpiresAt) {
      const refreshData = await refreshStravaToken(
        user.strava_refresh_token,
        stravaClientId,
        stravaClientSecret
      );

      accessToken = refreshData.access_token;

      await supabase
        .from("users")
        .update({
          strava_access_token: refreshData.access_token,
          strava_refresh_token: refreshData.refresh_token,
          token_expires_at: new Date(refreshData.expires_at * 1000).toISOString(),
        })
        .eq("id", userId);
    }

    const after = user.last_synced_at 
      ? Math.floor(new Date(user.last_synced_at).getTime() / 1000)
      : Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);

    const activitiesResponse = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=200`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      }
    );

    if (!activitiesResponse.ok) {
      const errorText = await activitiesResponse.text();
      return new Response(
        JSON.stringify({ error: "Failed to fetch activities from Strava", details: errorText }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const activities: StravaActivity[] = await activitiesResponse.json();

    const runActivities = activities.filter(a => 
      a.type === "Run" || a.sport_type === "Run" || 
      a.type === "TrailRun" || a.sport_type === "TrailRun" ||
      a.type === "VirtualRun" || a.sport_type === "VirtualRun"
    );

    let insertedCount = 0;
    let skippedCount = 0;

    for (const activity of runActivities) {
      const distanceMiles = Math.round((activity.distance * 0.000621371) * 100) / 100;

      const { error: insertError } = await supabase
        .from("activities")
        .insert({
          user_id: userId,
          strava_activity_id: activity.id,
          activity_type: activity.type || activity.sport_type,
          activity_date: activity.start_date,
          distance_meters: activity.distance,
          distance_miles: distanceMiles,
          moving_time_seconds: activity.moving_time,
          elapsed_time_seconds: activity.elapsed_time,
          total_elevation_gain: activity.total_elevation_gain,
          average_speed: activity.average_speed,
          max_speed: activity.max_speed,
          start_latitude: activity.start_latlng ? activity.start_latlng[0] : null,
          start_longitude: activity.start_latlng ? activity.start_latlng[1] : null,
          city: activity.location_city,
          state: activity.location_state,
          country: activity.location_country,
          manual: activity.manual,
          average_heartrate: activity.average_heartrate,
          max_heartrate: activity.max_heartrate,
        });

      if (insertError) {
        if (insertError.code === "23505") {
          skippedCount++;
        }
      } else {
        insertedCount++;
      }
    }

    await supabase
      .from("users")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", userId);

    const { error: recalcError } = await supabase.rpc(
      "recalculate_user_mileage",
      { p_user_id: userId }
    );

    if (recalcError) {
      console.error("Failed to recalculate mileage:", recalcError);
    }

    return new Response(
      JSON.stringify({
        message: "Activities synced successfully",
        total: runActivities.length,
        inserted: insertedCount,
        skipped: skippedCount,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
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