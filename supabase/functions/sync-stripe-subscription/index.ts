import {
  buildBillingPatch,
  ensureStripeCustomer,
  getAuthenticatedUser,
  getProfile,
  handleCors,
  jsonResponse,
  listStripeSubscriptions,
  pickPrimarySubscription,
  updateProfileByUserId,
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

    const patch = buildBillingPatch({
      customerId,
      email: user.email ?? null,
      subscriptionId: subscription?.id ?? null,
      subscriptionStatus: subscription?.status ?? null,
      priceId: subscription?.items?.data?.[0]?.price?.id ?? null,
    });

    await updateProfileByUserId(user.id, patch);

    return jsonResponse({
      tier: patch.tier,
      subscriptionStatus: patch.subscription_status,
      subscriptionId: patch.stripe_subscription_id,
      customerId: patch.stripe_customer_id,
      priceId: patch.stripe_price_id,
    });
  } catch (error) {
    console.error("sync-stripe-subscription failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 400);
  }
});
