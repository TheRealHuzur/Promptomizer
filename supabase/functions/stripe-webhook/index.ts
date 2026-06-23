import {
  buildBillingPatch,
  getAdminClient,
  handleCors,
  jsonResponse,
  stripeRequest,
  updateProfileByCustomerId,
  updateProfileByUserId,
  verifyStripeSignature,
} from "../_shared/stripe.ts";

async function applySubscriptionObject(subscription: Record<string, any>) {
  const customerId = subscription.customer as string | undefined;
  if (!customerId) return;

  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  const billingInterval = subscription.items?.data?.[0]?.price?.recurring?.interval ?? null;
  const patch = buildBillingPatch({
    customerId,
    subscriptionId: subscription.id ?? null,
    subscriptionStatus: subscription.status ?? null,
    priceId,
    billingInterval,
    email: null,
  });

  await updateProfileByCustomerId(customerId, patch);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const payload = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return jsonResponse({ error: "Missing stripe-signature header." }, 400);

  const verified = await verifyStripeSignature(payload, signature);
  if (!verified) return jsonResponse({ error: "Invalid Stripe signature." }, 400);

  try {
    const event = JSON.parse(payload);
    const object = event?.data?.object ?? {};

    switch (event.type) {
      case "checkout.session.completed": {
        if (object.mode !== "subscription" || !object.customer) break;

        const patch = buildBillingPatch({
          customerId: object.customer,
          subscriptionId: object.subscription ?? null,
          subscriptionStatus: "active",
          email: object.customer_details?.email ?? null,
          priceId: null,
        });

        if (object.client_reference_id) {
          await updateProfileByUserId(object.client_reference_id, patch);
        } else {
          await updateProfileByCustomerId(object.customer, patch);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await applySubscriptionObject(object);
        break;
      }

      case "invoice.paid":
      case "invoice.payment_failed": {
        const subscriptionId = object.subscription as string | undefined;
        if (!subscriptionId) break;
        const subscription = await stripeRequest(`/v1/subscriptions/${subscriptionId}`, { method: "GET" });
        await applySubscriptionObject(subscription);
        break;
      }

      default:
        break;
    }

    return jsonResponse({ received: true });
  } catch (error) {
    console.error("stripe-webhook failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 400);
  }
});
