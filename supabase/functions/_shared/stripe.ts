import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);

export function handleCors(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

export function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function getAppBaseUrl(req: Request) {
  const configured = Deno.env.get("APP_BASE_URL");
  if (configured) return configured.replace(/\/$/, "");

  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");

  throw new Error("APP_BASE_URL is required when no Origin header is available.");
}

export async function stripeRequest(
  path: string,
  init: {
    method?: string;
    params?: URLSearchParams;
  } = {},
) {
  const secretKey = getEnv("STRIPE_SECRET_KEY");
  const url = `https://api.stripe.com${path}`;
  const method = init.method ?? "POST";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    "Stripe-Version": "2026-02-25.clover",
  };

  let body: string | undefined;
  if (init.params) {
    body = init.params.toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const response = await fetch(url, { method, headers, body });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    console.error("Stripe API error", { path, status: response.status, data });
    const message = data?.error?.message ?? `Stripe request failed for ${path}`;
    throw new Error(message);
  }

  return data;
}

export function getAdminClient() {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export async function getAuthenticatedUser(req: Request) {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const anonKey = getEnv("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) throw new Error("Missing Authorization header.");

  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new Error("Authentication failed.");
  }

  return data.user;
}

export async function getProfile(userId: string) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const { data: created, error: insertError } = await admin
    .from("profiles")
    .insert({
      id: userId,
      tier: "free",
      plan_since: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return created;
}

export async function updateProfileByUserId(userId: string, patch: Record<string, unknown>) {
  const admin = getAdminClient();
  const { error } = await admin.from("profiles").update(patch).eq("id", userId);
  if (error) throw error;
}

export async function updateProfileByCustomerId(customerId: string, patch: Record<string, unknown>) {
  const admin = getAdminClient();
  const { error } = await admin
    .from("profiles")
    .update(patch)
    .eq("stripe_customer_id", customerId);
  if (error) throw error;
}

export async function ensureStripeCustomer(profile: Record<string, unknown>, user: { id: string; email?: string | null }) {
  const existingCustomerId = typeof profile.stripe_customer_id === "string"
    ? profile.stripe_customer_id
    : null;

  if (existingCustomerId) return existingCustomerId;
  if (!user.email) throw new Error("Authenticated user has no email address.");

  const params = new URLSearchParams();
  params.set("email", user.email);
  params.set("metadata[supabase_user_id]", user.id);
  params.set("metadata[app]", "promptomizer");
  params.set("metadata[env]", "sandbox");

  const customer = await stripeRequest("/v1/customers", { params });
  await updateProfileByUserId(user.id, {
    stripe_customer_id: customer.id,
    billing_email: user.email,
    billing_updated_at: new Date().toISOString(),
  });

  return customer.id as string;
}

export function deriveTier(status: string | null | undefined) {
  return status && PRO_STATUSES.has(status) ? "pro" : "free";
}

export function buildBillingPatch(input: {
  customerId: string;
  subscriptionId?: string | null;
  subscriptionStatus?: string | null;
  priceId?: string | null;
  email?: string | null;
}) {
  const patch: Record<string, unknown> = {
    stripe_customer_id: input.customerId,
    stripe_subscription_id: input.subscriptionId ?? null,
    stripe_price_id: input.priceId ?? null,
    subscription_status: input.subscriptionStatus ?? null,
    tier: deriveTier(input.subscriptionStatus),
    billing_updated_at: new Date().toISOString(),
  };

  if (input.email !== undefined) {
    patch.billing_email = input.email;
  }

  return patch;
}

export async function listStripeSubscriptions(customerId: string) {
  const params = new URLSearchParams({
    customer: customerId,
    status: "all",
    limit: "10",
  });
  const data = await stripeRequest(`/v1/subscriptions?${params.toString()}`, { method: "GET" });
  return Array.isArray(data?.data) ? data.data : [];
}

export function pickPrimarySubscription(subscriptions: Array<Record<string, any>>) {
  const score = (status: string) => {
    switch (status) {
      case "active":
        return 5;
      case "trialing":
        return 4;
      case "past_due":
        return 3;
      case "unpaid":
        return 2;
      case "canceled":
        return 1;
      default:
        return 0;
    }
  };

  return [...subscriptions].sort((a, b) => {
    const byStatus = score(b.status ?? "") - score(a.status ?? "");
    if (byStatus !== 0) return byStatus;
    return (b.created ?? 0) - (a.created ?? 0);
  })[0] ?? null;
}

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function secureCompare(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function verifyStripeSignature(payload: string, signatureHeader: string) {
  const secret = getEnv("STRIPE_WEBHOOK_SECRET");
  const parts = signatureHeader.split(",").reduce<Record<string, string[]>>((acc, entry) => {
    const [key, value] = entry.split("=");
    if (!key || !value) return acc;
    acc[key] ??= [];
    acc[key].push(value);
    return acc;
  }, {});

  const timestamp = parts.t?.[0];
  const signatures = parts.v1 ?? [];
  if (!timestamp || signatures.length === 0) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedPayload = `${timestamp}.${payload}`;
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = hex(digest);

  return signatures.some((value) => secureCompare(value, expected));
}
