// Deno Edge Function: Direkte Vertragskuendigung (Paragraf 312k BGB Kuendigungsbutton).
// Kuendigt zum Ende der laufenden Abrechnungsperiode, identisch zur Wirkung des
// Stripe-Portal-Buttons, aber mit einer vom Anbieter selbst ausgestellten
// Bestaetigung (Inhalt, Datum, Uhrzeit, Beendigungszeitpunkt) statt einer
// Weiterleitung auf eine fremde Stripe-Seite.
import {
  ensureStripeCustomer,
  getAuthenticatedUser,
  getProfile,
  handleCors,
  jsonResponse,
  listStripeSubscriptions,
  pickPrimarySubscription,
  stripeRequest,
} from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await getAuthenticatedUser(req);
    const profile = await getProfile(user.id);
    const customerId = await ensureStripeCustomer(profile, user);

    const subscriptions = await listStripeSubscriptions(customerId);
    const subscription = pickPrimarySubscription(subscriptions);

    if (!subscription || !["active", "trialing", "past_due"].includes(subscription.status)) {
      return jsonResponse({ error: "NO_ACTIVE_SUBSCRIPTION" }, 409);
    }

    if (subscription.cancel_at_period_end) {
      return jsonResponse({ error: "ALREADY_CANCELLED" }, 409);
    }

    const params = new URLSearchParams();
    params.set("cancel_at_period_end", "true");
    const updated = await stripeRequest(`/v1/subscriptions/${subscription.id}`, { params });

    const declaredAt = new Date().toISOString();
    const periodEnd = updated.items?.data?.[0]?.current_period_end
      ? new Date(updated.items.data[0].current_period_end * 1000).toISOString()
      : (updated.current_period_end ? new Date(updated.current_period_end * 1000).toISOString() : null);

    return jsonResponse({
      subscriptionId: subscription.id,
      declaredAt,
      periodEnd,
    });
  } catch (error) {
    console.error("cancel-subscription failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 400);
  }
});
