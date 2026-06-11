import {
  ensureStripeCustomer,
  getAppBaseUrl,
  getAuthenticatedUser,
  getProfile,
  handleCors,
  jsonResponse,
  stripeRequest,
} from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await getAuthenticatedUser(req);
    const profile = await getProfile(user.id);
    const customerId = await ensureStripeCustomer(profile, user);
    const baseUrl = getAppBaseUrl(req);

    const params = new URLSearchParams();
    params.set("customer", customerId);
    params.set("return_url", `${baseUrl}/?billing=return`);

    const session = await stripeRequest("/v1/billing_portal/sessions", { params });
    return jsonResponse({ url: session.url });
  } catch (error) {
    console.error("create-stripe-portal-session failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 400);
  }
});
