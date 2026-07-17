import { deriveTier, getAdminClient, handleCors, jsonResponse } from "../_shared/stripe.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const corsResult = handleCors(req);
  if (corsResult) return corsResult;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  // JWT-Verifikation: user aus Authorization-Header extrahieren
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const adminClient = getAdminClient();

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("subscription_status")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  if (profile && deriveTier(profile.subscription_status) === "pro") {
    return jsonResponse({ error: "ACTIVE_SUBSCRIPTION" }, 409);
  }

  const { error } = await adminClient.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("delete-account: Fehler beim Loeschen von", user.id, error.message);
    return jsonResponse({ error: "Account konnte nicht gelöscht werden." }, 500);
  }

  console.log("delete-account: Account geloescht", user.id);
  return jsonResponse({ success: true });
});
