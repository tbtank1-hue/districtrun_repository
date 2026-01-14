import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mailchimpApiKey = Deno.env.get("MAILCHIMP_API_KEY");
    const mailchimpListId = Deno.env.get("MAILCHIMP_LIST_ID");
    const mailchimpServerPrefix = Deno.env.get("MAILCHIMP_SERVER_PREFIX");

    if (!mailchimpApiKey || !mailchimpListId || !mailchimpServerPrefix) {
      return new Response(
        JSON.stringify({ 
          error: "Mailchimp not configured. Set MAILCHIMP_API_KEY, MAILCHIMP_LIST_ID, and MAILCHIMP_SERVER_PREFIX environment variables." 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: unsyncedUsers, error: fetchError } = await supabase
      .from("waitlist")
      .select("*")
      .eq("synced_to_mailchimp", false)
      .order("created_at", { ascending: true });

    if (fetchError) {
      throw fetchError;
    }

    if (!unsyncedUsers || unsyncedUsers.length === 0) {
      return new Response(
        JSON.stringify({ message: "No unsynced users found", synced: 0 }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let syncedCount = 0;
    const errors = [];

    for (const user of unsyncedUsers) {
      try {
        const mailchimpResponse = await fetch(
          `https://${mailchimpServerPrefix}.api.mailchimp.com/3.0/lists/${mailchimpListId}/members`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${mailchimpApiKey}`,
            },
            body: JSON.stringify({
              email_address: user.email,
              status: "subscribed",
              merge_fields: {
                FNAME: user.first_name,
              },
            }),
          }
        );

        if (mailchimpResponse.ok) {
          const mailchimpData = await mailchimpResponse.json();
          
          await supabase
            .from("waitlist")
            .update({
              synced_to_mailchimp: true,
              mailchimp_subscriber_id: mailchimpData.id,
            })
            .eq("id", user.id);

          syncedCount++;
        } else if (mailchimpResponse.status === 400) {
          const errorData = await mailchimpResponse.json();
          if (errorData.title === "Member Exists") {
            await supabase
              .from("waitlist")
              .update({
                synced_to_mailchimp: true,
              })
              .eq("id", user.id);
            syncedCount++;
          } else {
            errors.push({ email: user.email, error: errorData.detail });
          }
        } else {
          const errorText = await mailchimpResponse.text();
          errors.push({ email: user.email, error: errorText });
        }
      } catch (err) {
        errors.push({ email: user.email, error: err.message });
      }
    }

    return new Response(
      JSON.stringify({
        message: `Synced ${syncedCount} of ${unsyncedUsers.length} users`,
        synced: syncedCount,
        total: unsyncedUsers.length,
        errors: errors.length > 0 ? errors : undefined,
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