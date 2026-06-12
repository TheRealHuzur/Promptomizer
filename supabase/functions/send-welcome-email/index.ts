// Deno Edge Function: Willkommens-Mail über Brevo (Template)
// Aufrufer: Supabase Database Webhook auf INSERT in auth.users.
// Schutzschichten: Shared Secret, User-Existenz-Check, Einmal-Versand pro Account.
// Siehe README.md in diesem Ordner für Secrets, Trigger-Konfiguration und Deployment.
import { getAdminClient, getEnv, secureCompare } from "../_shared/stripe.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  // Der anon-Key steht öffentlich im Frontend und genügt für verify_jwt —
  // erst dieses Secret beschränkt den Aufruf auf den Database-Webhook.
  const providedSecret = req.headers.get("x-welcome-secret") ?? "";
  const expectedSecret = getEnv("WELCOME_EMAIL_SECRET");
  if (!secureCompare(providedSecret, expectedSecret)) {
    console.error("send-welcome-email: Aufruf mit ungültigem Secret abgelehnt");
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  let payload: { record?: { id?: string; email?: string } };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload." }, 400);
  }

  const userId = payload.record?.id;
  const userEmail = payload.record?.email;
  if (!userId || !userEmail || !EMAIL_PATTERN.test(userEmail)) {
    return jsonResponse({ error: "Payload must contain record.id and record.email." }, 400);
  }

  try {
    const admin = getAdminClient();

    // Mails gehen nur an real existierende Accounts, deren E-Mail zum Payload passt.
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError || !userData?.user) {
      console.error("send-welcome-email: unbekannter User", { userId });
      return jsonResponse({ error: "Unknown user." }, 403);
    }
    if ((userData.user.email ?? "").toLowerCase() !== userEmail.toLowerCase()) {
      console.error("send-welcome-email: E-Mail passt nicht zum User", { userId });
      return jsonResponse({ error: "Email does not match user." }, 403);
    }

    // Einmal-Versand pro Account: schützt vor doppelten Triggern und Replays.
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, welcome_email_sent_at")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.welcome_email_sent_at) {
      console.log("send-welcome-email: bereits versendet, übersprungen", { userId });
      return jsonResponse({ status: "skipped", message: "Willkommens-Mail wurde bereits versendet." });
    }

    const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        "api-key": getEnv("brevo_api_key"),
      },
      body: JSON.stringify({
        templateId: 5, // Brevo Template-ID der Willkommens-Mail
        to: [{ email: userEmail }],
      }),
    });

    if (!brevoResponse.ok) {
      const errorText = await brevoResponse.text();
      throw new Error(`Brevo API Fehler (${brevoResponse.status}): ${errorText}`);
    }

    const sentAt = new Date().toISOString();
    const { error: markError } = profile
      ? await admin
        .from("profiles")
        .update({ welcome_email_sent_at: sentAt })
        .eq("id", userId)
      : await admin
        .from("profiles")
        .insert({ id: userId, tier: "free", plan_since: sentAt, welcome_email_sent_at: sentAt });
    if (markError) {
      // Mail ist bereits raus — Markierungsfehler nur loggen, Versand nicht als Fehler melden.
      console.error("send-welcome-email: Versand-Markierung fehlgeschlagen", { userId, markError });
    }

    console.log("send-welcome-email: versendet", { userId });
    return jsonResponse({ status: "success", message: "Willkommens-Mail über Brevo versendet!" });
  } catch (error) {
    console.error("send-welcome-email fehlgeschlagen", { userId, error });
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
