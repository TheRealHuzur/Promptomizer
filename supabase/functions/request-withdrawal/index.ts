// Deno Edge Function: Elektronische Widerrufsfunktion (Paragraf 356a BGB).
// Nimmt die Widerrufserklaerung elektronisch entgegen, bestaetigt den Eingang
// sofort (Inhalt, Datum, Uhrzeit) und beendet das Abonnement mit sofortiger
// Wirkung, da der Widerruf den Vertrag beendet. Die tatsaechliche Erstattung
// (vollstaendig, laut AGB) verarbeitet der Anbieter manuell ueber Stripe
// innerhalb der gesetzlichen 14-Tage-Frist.
import {
  ensureStripeCustomer,
  getAuthenticatedUser,
  getEnv,
  getProfile,
  handleCors,
  jsonResponse,
  listStripeSubscriptions,
  pickPrimarySubscription,
  stripeRequest,
} from "../_shared/stripe.ts";

const WITHDRAWAL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const OPERATOR_EMAIL = "info@promptomizer.de";

async function sendBrevoMail(to: string, subject: string, htmlContent: string) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      "api-key": getEnv("brevo_api_key"),
    },
    body: JSON.stringify({
      sender: { email: OPERATOR_EMAIL, name: "Promptomizer" },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API Fehler (${response.status}): ${errorText}`);
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await getAuthenticatedUser(req);
    if (!user.email) throw new Error("Authenticated user has no email address.");
    const profile = await getProfile(user.id);
    const customerId = await ensureStripeCustomer(profile, user);

    const subscriptions = await listStripeSubscriptions(customerId);
    const subscription = pickPrimarySubscription(subscriptions);

    if (!subscription || !["active", "trialing", "past_due"].includes(subscription.status)) {
      return jsonResponse({ error: "NO_ACTIVE_SUBSCRIPTION" }, 409);
    }

    const contractStartedAt = subscription.created ? subscription.created * 1000 : null;
    if (!contractStartedAt || Date.now() - contractStartedAt > WITHDRAWAL_WINDOW_MS) {
      return jsonResponse({ error: "WITHDRAWAL_PERIOD_EXPIRED" }, 409);
    }

    // Widerruf beendet den Vertrag sofort (nicht erst zum Periodenende).
    await stripeRequest(`/v1/subscriptions/${subscription.id}`, { method: "DELETE" });

    const declaredAt = new Date().toISOString();
    const declaredAtDisplay = new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" });

    const userHtml = `
      <p>Hiermit bestätigen wir den Eingang Ihrer Widerrufserklärung.</p>
      <p><strong>Inhalt:</strong> Widerruf des Vertrags über den Promptomizer Pro-Plan.</p>
      <p><strong>Eingegangen am:</strong> ${declaredAtDisplay} (MEZ/MESZ)</p>
      <p>Ihr Abonnement wurde mit sofortiger Wirkung beendet. Die vollständige Erstattung bereits geleisteter Zahlungen erfolgt gemäß unserer Widerrufsbelehrung spätestens binnen 14 Tagen ab Eingang dieser Erklärung.</p>
    `;
    const operatorHtml = `
      <p>Neue Widerrufserklärung eingegangen.</p>
      <p><strong>Nutzer:</strong> ${user.email} (User-ID: ${user.id})</p>
      <p><strong>Eingegangen am:</strong> ${declaredAtDisplay} (MEZ/MESZ)</p>
      <p><strong>Stripe-Subscription:</strong> ${subscription.id}</p>
      <p>Abonnement wurde bereits automatisch sofort gekündigt. Bitte vollständige Erstattung über Stripe manuell veranlassen (spätestens binnen 14 Tagen ab Eingang).</p>
    `;

    await Promise.all([
      sendBrevoMail(user.email, "Bestätigung: Eingang Ihres Widerrufs — Promptomizer", userHtml),
      sendBrevoMail(OPERATOR_EMAIL, "Neue Widerrufserklärung — Erstattung erforderlich", operatorHtml),
    ]);

    return jsonResponse({
      subscriptionId: subscription.id,
      declaredAt,
    });
  } catch (error) {
    console.error("request-withdrawal failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 400);
  }
});
