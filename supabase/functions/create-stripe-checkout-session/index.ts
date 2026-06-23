import {
  buildBillingPatch,
  ensureStripeCustomer,
  getAppBaseUrl,
  getAuthenticatedUser,
  getEnv,
  getProfile,
  handleCors,
  jsonResponse,
  stripeRequest,
  updateProfileByUserId,
} from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await getAuthenticatedUser(req);
    const profile = await getProfile(user.id);
    const customerId = await ensureStripeCustomer(profile, user);
    const baseUrl = getAppBaseUrl(req);

    // Abrechnungsintervall aus dem Request lesen (Default: monatlich).
    let interval: "month" | "year" = "month";
    try {
      const body = await req.json();
      if (body && body.interval === "year") interval = "year";
    } catch (_) {
      // Kein/ungueltiger Body -> monatlich.
    }

    const priceId = interval === "year"
      ? getEnv("STRIPE_PRICE_ID_PRO_YEARLY")
      : getEnv("STRIPE_PRICE_ID_PRO");

    const params = new URLSearchParams();
    params.set("mode", "subscription");
    params.set("success_url", `${baseUrl}/?checkout=success`);
    params.set("cancel_url", `${baseUrl}/?checkout=cancelled`);
    params.set("customer", customerId);
    params.set("client_reference_id", user.id);
    params.set("line_items[0][price]", priceId);
    params.set("line_items[0][quantity]", "1");
    params.set("allow_promotion_codes", "true");
    params.set("metadata[app]", "promptomizer");
    params.set("metadata[plan]", "pro");
    params.set("metadata[interval]", interval);
    params.set("metadata[env]", "sandbox");
    params.set("subscription_data[metadata][supabase_user_id]", user.id);
    params.set("subscription_data[metadata][interval]", interval);
    params.set("subscription_data[metadata][app]", "promptomizer");
    params.set("subscription_data[metadata][plan]", "pro");
    params.set("subscription_data[metadata][env]", "sandbox");

    const session = await stripeRequest("/v1/checkout/sessions", { params });

    await updateProfileByUserId(user.id, buildBillingPatch({
      customerId,
      email: user.email ?? null,
      priceId,
      subscriptionStatus: typeof profile.subscription_status === "string" ? profile.subscription_status : null,
      subscriptionId: typeof profile.stripe_subscription_id === "string" ? profile.stripe_subscription_id : null,
    }));

    return jsonResponse({
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error("create-stripe-checkout-session failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 400);
  }
});
