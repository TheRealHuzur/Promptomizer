// Deno Edge Function für Brevo (Variante B - Template)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  try {
    // 1. Hole den Payload vom Supabase Database Trigger
    const payload = await req.json();
    const userEmail = payload.record?.email;

    if (!userEmail) {
      throw new Error("Keine E-Mail-Adresse im Payload gefunden.");
    }

    // 2. Hole den Brevo API Key aus den Supabase Secrets
    const BREVO_API_KEY = Deno.env.get('brevo_api_key');

    if (!BREVO_API_KEY) {
      throw new Error("Secret 'brevo_api_key' fehlt.");
    }

    // 3. Sende den Request an die Brevo API (v3)
    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'accept': 'application/json',
        'api-key': BREVO_API_KEY
      },
      body: JSON.stringify({
        templateId: 5, // Deine Brevo Template-ID
        to: [
          {
            email: userEmail
          }
        ]
      })
    });

    if (!brevoResponse.ok) {
      const errorText = await brevoResponse.text();
      throw new Error(`Brevo API Fehler: ${errorText}`);
    }

    // 4. Erfolg zurückmelden
    return new Response(
      JSON.stringify({ status: "success", message: "Willkommens-Mail über Brevo versendet!" }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Fehler in der Edge Function:", error);
    return new Response(
      JSON.stringify({ status: "error", error: error.message }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
})
