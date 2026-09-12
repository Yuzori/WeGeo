/**
 * Abonnements Stripe. La clé secrète ne sort jamais du serveur.
 * L’état « payé » vient des webhooks (et d’une vérification de session),
 * jamais d’un signal du navigateur.
 */

import Stripe from 'stripe';
import type { Request } from 'express';
import type { BillingPlan, BillingPublicConfig, PlanId, SubscriptionStatus } from '../shared/types.ts';
import db from './db.ts';
import type { AuthUser } from './auth.ts';
import { findUserById } from './auth.ts';
import { recordEvent } from './analytics.ts';
import { sendSubscriptionEmail } from './mail.ts';
import { publicBaseUrl } from './security.ts';

const PLAN_IDS: PlanId[] = ['starter', 'pro', 'agence'];

type Row = Record<string, unknown>;

let stripeClient: Stripe | null | undefined;

function stripe(): Stripe | null {
  if (stripeClient !== undefined) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  stripeClient = key ? new Stripe(key) : null;
  return stripeClient;
}

function envPrice(plan: PlanId, interval: 'month' | 'year' = 'month'): string | undefined {
  const annualSuffix = interval === 'year' ? '_ANNUAL' : '';
  const map: Record<PlanId, string | undefined> = {
    starter: process.env[`STRIPE_PRICE_STARTER${annualSuffix}`],
    pro: process.env[`STRIPE_PRICE_PRO${annualSuffix}`],
    agence: process.env[`STRIPE_PRICE_AGENCE${annualSuffix}`],
  };
  const value = map[plan]?.trim();
  return value || undefined;
}

function euros(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}

function amountLabel(plan: PlanId): string {
  const centsRaw = process.env[`PLAN_${plan.toUpperCase()}_CENTS`];
  const parsed = centsRaw ? Number(centsRaw) : NaN;
  const cents = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_CENTS[plan];
  return euros(cents);
}

function annualLabels(plan: PlanId): Pick<BillingPlan, 'annualAmountLabel' | 'annualWasLabel' | 'annualBadge'> {
  const monthly = DEFAULT_CENTS[plan];
  const annual = ANNUAL_CENTS[plan];
  return {
    annualAmountLabel: euros(annual),
    annualWasLabel: euros(monthly * 12),
    annualBadge: '-17 % · 2 mois offerts',
  };
}

const DEFAULT_CENTS: Record<PlanId, number> = {
  starter: 2900,
  pro: 5900,
  agence: 11900,
};

const ANNUAL_CENTS: Record<PlanId, number> = {
  starter: 29000,
  pro: 59000,
  agence: 111900,
};

const CATALOG: Array<
  Omit<BillingPlan, 'amountLabel' | 'annualAmountLabel' | 'annualWasLabel' | 'annualBadge' | 'priceConfigured'>
> = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Pour lancer les premières tournées.',
    interval: 'month',
    cta: 'Choisir Starter',
    features: [
      'Relevé Google Maps des commerces sans site',
      'Pipeline d’appels. Trier, appeler, classer',
      'Export CSV / Excel',
      '1 compte, 1 session personnelle',
      '2 métiers et 50 entreprises par relevé',
    ],
    locked: [
      'Nom du dirigeant',
      'Invitations d’équipe',
      'Quadrillage des grandes villes',
      'Tous les réglages de recherche',
      'Carte, score et session d’appels clavier',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Pour appeler et conclure au quotidien.',
    interval: 'month',
    highlighted: true,
    cta: 'Choisir Pro',
    features: [
      'Tout Starter',
      'Nom du dirigeant (SIRENE) et lien source',
      '8 métiers et 250 entreprises par relevé',
      'Quadrillage 2 × 2',
      'Inviter 2 personnes',
      'Carte, score, session d’appels, Google Sheets',
      'Réglages de recherche étendus',
    ],
    locked: [
      'Quadrillage large (jusqu’à 5 × 5)',
      'Volume de relevé illimité',
      'Plus de 3 personnes par session',
    ],
  },
  {
    id: 'agence',
    name: 'Agence',
    tagline: 'Pour les équipes qui enchaînent villes et métiers.',
    interval: 'month',
    cta: 'Choisir Agence',
    features: [
      'Tout Pro',
      '15 métiers et 1 000 entreprises par relevé',
      'Tous les réglages, quadrillage jusqu’à 5 × 5',
      'Jusqu’à 10 personnes par session',
      'Historique complet et actions groupées',
    ],
  },
];

export function publicBillingConfig(): BillingPublicConfig {
  const raw = process.env.STRIPE_PUBLISHABLE_KEY?.trim() || null;
  const publishable = raw?.startsWith('pk_') ? raw : null;

  const plans: BillingPlan[] = CATALOG.map((plan) => ({
    ...plan,
    amountLabel: amountLabel(plan.id),
    ...annualLabels(plan.id),
    priceConfigured: Boolean(envPrice(plan.id, 'month')),
    annualPriceConfigured: Boolean(envPrice(plan.id, 'year')),
  }));

  return {
    publishableKey: publishable,
    configured: Boolean(stripe() && publishable && plans.some((p) => p.priceConfigured)),
    plans,
  };
}

function mapStripeStatus(status: string | null | undefined): SubscriptionStatus {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'canceled':
    case 'unpaid':
    case 'incomplete':
    case 'paused':
      return status;
    case 'incomplete_expired':
      return 'canceled';
    default:
      return 'none';
  }
}

function planFromPrice(priceId: string | undefined): PlanId | null {
  if (!priceId) return null;
  for (const id of PLAN_IDS) {
    if (envPrice(id, 'month') === priceId || envPrice(id, 'year') === priceId) return id;
  }
  return null;
}

function subscriptionPaid(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing';
}

export function upsertSubscription(params: {
  userId: number;
  customerId: string;
  subscriptionId: string | null;
  plan: PlanId | null;
  status: SubscriptionStatus;
}): boolean {
  const ts = new Date().toISOString();
  const existing = db.prepare('SELECT id, status FROM subscriptions WHERE user_id = ?').get(params.userId) as
    | Row
    | undefined;
  const previousStatus =
    typeof existing?.status === 'string' ? (existing.status as SubscriptionStatus) : null;
  const activated = subscriptionPaid(params.status) && !subscriptionPaid(previousStatus ?? 'incomplete');

  if (existing) {
    db.prepare(
      `UPDATE subscriptions
       SET stripe_customer_id = ?, stripe_subscription_id = ?, plan = ?, status = ?, updated_at = ?
       WHERE user_id = ?`,
    ).run(params.customerId, params.subscriptionId, params.plan, params.status, ts, params.userId);
    return activated;
  }
  db.prepare(
    `INSERT INTO subscriptions
      (user_id, stripe_customer_id, stripe_subscription_id, plan, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(params.userId, params.customerId, params.subscriptionId, params.plan, params.status, ts, ts);
  return activated;
}

async function notifySubscriptionActivated(userId: number, plan: PlanId | null): Promise<void> {
  const user = findUserById(userId);
  if (!user) return;
  const catalog = CATALOG.find((entry) => entry.id === plan);
  try {
    await sendSubscriptionEmail({
      to: user.email,
      planName: catalog?.name ?? plan ?? 'Prospy',
      planId: plan,
    });
    recordEvent({
      visitorId: `user:${userId}`,
      event: 'funnel:paid',
      path: '/abonnement',
      meta: { plan: plan ?? 'unknown' },
    });
  } catch (err) {
    console.error('[Prospy] e-mail abonnement:', err instanceof Error ? err.message : err);
  }
}

function applySubscription(params: {
  userId: number;
  customerId: string;
  subscriptionId: string | null;
  plan: PlanId | null;
  status: SubscriptionStatus;
}): void {
  const activated = upsertSubscription(params);
  if (activated) void notifySubscriptionActivated(params.userId, params.plan);
}

function userIdFromStripe(obj: { client_reference_id?: string | null; metadata?: Stripe.Metadata | null }): number | null {
  const raw = obj.metadata?.userId ?? obj.client_reference_id;
  const id = raw ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

const CHECKOUT_PAYMENT_METHODS = ['card', 'link', 'paypal'] as const;

function paymentIntentIdFromClientSecret(clientSecret: string): string | null {
  const id = clientSecret.split('_secret_')[0];
  return id.startsWith('pi_') ? id : null;
}

async function syncPaymentIntentMethods(client: Stripe, clientSecret: string): Promise<void> {
  const piId = paymentIntentIdFromClientSecret(clientSecret);
  if (!piId) return;
  try {
    await client.paymentIntents.update(piId, {
      payment_method_types: [...CHECKOUT_PAYMENT_METHODS],
    });
  } catch {
    /* Stripe a déjà verrouillé les moyens de paiement sur la facture */
  }
}

function clientSecretFromSubscription(subscription: Stripe.Subscription): string | null {
  const invoice = subscription.latest_invoice;
  if (!invoice || typeof invoice === 'string') return null;

  type InvoicePayment = Stripe.Invoice & {
    confirmation_secret?: { client_secret?: string | null; type?: string } | null;
    payment_intent?: Stripe.PaymentIntent | string | null;
  };

  const expanded = invoice as InvoicePayment;
  if (expanded.confirmation_secret?.client_secret) {
    return expanded.confirmation_secret.client_secret;
  }

  const paymentIntent = expanded.payment_intent;
  if (paymentIntent && typeof paymentIntent !== 'string' && paymentIntent.client_secret) {
    return paymentIntent.client_secret;
  }

  return null;
}

export async function createSubscriptionPayment(
  user: AuthUser,
  planId: string,
  interval: 'month' | 'year',
  req: Request,
): Promise<
  | {
      clientSecret: string;
      returnUrl: string;
      planName: string;
      amountLabel: string;
      interval: 'month' | 'year';
    }
  | { error: string; status: number }
> {
  const client = stripe();
  const publishable = process.env.STRIPE_PUBLISHABLE_KEY?.trim();
  if (!client || !publishable) {
    return { error: 'Les paiements ne sont pas encore configurés sur ce serveur.', status: 503 };
  }
  if (!isPlanId(planId)) {
    return { error: 'Offre inconnue.', status: 400 };
  }
  const plan = planId;
  const price = envPrice(plan, interval);
  if (!price) {
    return { error: 'Cette offre n’a pas de tarif Stripe configuré.', status: 503 };
  }

  const customerId = await ensureStripeCustomer(client, user);

  const stale = await client.subscriptions.list({ customer: customerId, status: 'incomplete', limit: 20 });
  for (const sub of stale.data) {
    await client.subscriptions.cancel(sub.id);
  }

  const catalog = CATALOG.find((entry) => entry.id === plan);
  const subscription = await client.subscriptions.create({
    customer: customerId,
    items: [{ price }],
    payment_behavior: 'default_incomplete',
    payment_settings: {
      payment_method_types: [...CHECKOUT_PAYMENT_METHODS],
      save_default_payment_method: 'on_subscription',
    },
    expand: ['latest_invoice.confirmation_secret', 'latest_invoice.payment_intent'],
    metadata: { userId: String(user.id), plan, interval },
  });

  const clientSecret = clientSecretFromSubscription(subscription);

  if (!clientSecret) {
    return { error: 'Stripe n’a pas renvoyé de session de paiement.', status: 502 };
  }

  await syncPaymentIntentMethods(client, clientSecret);

  return {
    clientSecret,
    returnUrl: `${publicBaseUrl(req)}/abonnement?checkout=success`,
    planName: catalog?.name ?? plan,
    amountLabel: interval === 'year' ? annualLabels(plan).annualAmountLabel : amountLabel(plan),
    interval,
  };
}

/** @deprecated Embedded Checkout — conservé pour compatibilité interne. */
export async function createEmbeddedCheckout(
  user: AuthUser,
  planId: string,
  interval: 'month' | 'year',
  req: Request,
): Promise<{ clientSecret: string } | { error: string; status: number }> {
  const result = await createSubscriptionPayment(user, planId, interval, req);
  if ('error' in result) return result;
  return { clientSecret: result.clientSecret };
}

async function ensureStripeCustomer(client: Stripe, user: AuthUser): Promise<string> {
  const existing = db
    .prepare('SELECT stripe_customer_id FROM subscriptions WHERE user_id = ?')
    .get(user.id) as Row | undefined;
  const stored = typeof existing?.stripe_customer_id === 'string' ? existing.stripe_customer_id : null;
  if (stored) return stored;

  const customer = await client.customers.create({
    email: user.email,
    metadata: { userId: String(user.id) },
  });

  upsertSubscription({
    userId: user.id,
    customerId: customer.id,
    subscriptionId: null,
    plan: null,
    status: 'incomplete',
  });

  return customer.id;
}

export async function createPortal(user: AuthUser, req: Request): Promise<{ url: string } | { error: string; status: number }> {
  const client = stripe();
  if (!client) return { error: 'Les paiements ne sont pas encore configurés.', status: 503 };

  const row = db
    .prepare('SELECT stripe_customer_id FROM subscriptions WHERE user_id = ?')
    .get(user.id) as Row | undefined;
  const customer = row?.stripe_customer_id;
  if (typeof customer !== 'string' || !customer) {
    return { error: 'Aucun abonnement à gérer pour ce compte.', status: 404 };
  }

  const portal = await client.billingPortal.sessions.create({
    customer,
    return_url: `${publicBaseUrl(req)}/app`,
  });
  return { url: portal.url };
}

export async function cancelSubscription(
  user: AuthUser,
): Promise<{ ok: true; endsAt: string | null } | { error: string; status: number }> {
  const client = stripe();
  if (!client) return { error: 'Les paiements ne sont pas encore configurés.', status: 503 };

  const row = db
    .prepare('SELECT stripe_subscription_id, status FROM subscriptions WHERE user_id = ?')
    .get(user.id) as Row | undefined;
  const subId = row?.stripe_subscription_id;
  if (typeof subId !== 'string' || !subId) {
    return { error: 'Aucun abonnement Stripe à résilier sur ce compte.', status: 404 };
  }

  const sub = await client.subscriptions.update(subId, { cancel_at_period_end: true });
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  if (!customerId) {
    return { error: 'Client Stripe introuvable.', status: 404 };
  }
  const period = sub as unknown as { cancel_at?: number | null; current_period_end?: number };
  const unix = typeof period.cancel_at === 'number' ? period.cancel_at : typeof period.current_period_end === 'number' ? period.current_period_end : null;
  upsertSubscription({
    userId: user.id,
    customerId,
    subscriptionId: sub.id,
    plan: planFromPrice(sub.items.data[0]?.price.id) ?? (sub.metadata?.plan as PlanId | undefined) ?? null,
    status: mapStripeStatus(sub.status),
  });
  return { ok: true, endsAt: unix ? new Date(unix * 1000).toISOString() : null };
}

export async function confirmPaymentIntent(
  user: AuthUser,
  paymentIntentId: string,
): Promise<{ ok: true } | { error: string; status: number }> {
  const client = stripe();
  if (!client || !paymentIntentId.startsWith('pi_')) {
    return { error: 'Paiement introuvable.', status: 400 };
  }

  const pi = await client.paymentIntents.retrieve(paymentIntentId);
  if (pi.status !== 'succeeded' && pi.status !== 'processing') {
    return { error: 'Le paiement n’est pas encore confirmé.', status: 402 };
  }

  const customerId = typeof pi.customer === 'string' ? pi.customer : pi.customer?.id;
  if (!customerId) return { error: 'Client Stripe introuvable.', status: 400 };

  const row = db
    .prepare('SELECT stripe_customer_id FROM subscriptions WHERE user_id = ?')
    .get(user.id) as Row | undefined;
  if (row?.stripe_customer_id && row.stripe_customer_id !== customerId) {
    return { error: 'Ce paiement ne correspond pas à votre compte.', status: 403 };
  }

  let subscriptionId: string | null = null;
  let plan: PlanId | null = null;

  const invoiceRef = (pi as Stripe.PaymentIntent & { invoice?: string | Stripe.Invoice | null }).invoice;
  const invoiceId = typeof invoiceRef === 'string' ? invoiceRef : invoiceRef?.id;
  if (invoiceId) {
    const invoice = await client.invoices.retrieve(invoiceId, { expand: ['subscription'] });
    const subRef = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription;
    subscriptionId = typeof subRef === 'string' ? subRef : subRef?.id ?? null;
  }

  if (!subscriptionId) {
    const subs = await client.subscriptions.list({ customer: customerId, status: 'all', limit: 12 });
    const owned = subs.data.find((sub) => userIdFromStripe(sub) === user.id);
    subscriptionId = owned?.id ?? null;
  }

  if (!subscriptionId) return { error: 'Abonnement introuvable pour ce paiement.', status: 404 };

  const sub = await client.subscriptions.retrieve(subscriptionId);
  if (userIdFromStripe(sub) !== user.id) {
    return { error: 'Ce paiement ne correspond pas à votre compte.', status: 403 };
  }

  const priceId = sub.items.data[0]?.price.id;
  plan = planFromPrice(priceId) ?? (sub.metadata?.plan as PlanId | undefined) ?? null;

  let status = mapStripeStatus(sub.status);
  if (!subscriptionPaid(status)) {
    const fresh = await client.subscriptions.retrieve(subscriptionId);
    status = mapStripeStatus(fresh.status);
  }
  if (!subscriptionPaid(status) && pi.status === 'succeeded') {
    status = 'active';
  }

  applySubscription({
    userId: user.id,
    customerId,
    subscriptionId: sub.id,
    plan,
    status,
  });

  return { ok: true };
}

export async function confirmCheckoutSession(user: AuthUser, sessionId: string): Promise<void> {
  const client = stripe();
  if (!client || !sessionId.startsWith('cs_')) return;

  const session = await client.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
  const owner = userIdFromStripe(session);
  if (owner !== user.id) return;
  if (session.mode !== 'subscription') return;

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (!customerId) return;

  const sub = session.subscription;
  const stripeSub = typeof sub === 'string' ? await client.subscriptions.retrieve(sub) : sub;
  const priceId = stripeSub && !('deleted' in stripeSub) ? stripeSub.items.data[0]?.price.id : undefined;

  applySubscription({
    userId: user.id,
    customerId,
    subscriptionId: stripeSub && !('deleted' in stripeSub) ? stripeSub.id : null,
    plan: planFromPrice(priceId) ?? (session.metadata?.plan as PlanId | undefined) ?? null,
    status: stripeSub && !('deleted' in stripeSub) ? mapStripeStatus(stripeSub.status) : session.status === 'complete' ? 'active' : 'incomplete',
  });
}

export async function handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<{ ok: true } | { error: string; status: number }> {
  const client = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!client || !secret) return { error: 'Webhook Stripe non configuré.', status: 503 };
  if (!signature) return { error: 'Signature manquante.', status: 400 };

  let event: Stripe.Event;
  try {
    event = client.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return { error: 'Signature Stripe invalide.', status: 400 };
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = userIdFromStripe(session);
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      if (!userId || !customerId) break;
      let plan: PlanId | null = PLAN_IDS.includes(session.metadata?.plan as PlanId)
        ? (session.metadata!.plan as PlanId)
        : null;
      let status: SubscriptionStatus = session.status === 'complete' ? 'active' : 'incomplete';
      let subscriptionId: string | null = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
      if (subscriptionId) {
        const sub = await client.subscriptions.retrieve(subscriptionId);
        plan = planFromPrice(sub.items.data[0]?.price.id) ?? plan;
        status = mapStripeStatus(sub.status);
      }
      applySubscription({ userId, customerId, subscriptionId, plan, status });
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = userIdFromStripe(sub);
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      if (!userId) break;
      applySubscription({
        userId,
        customerId,
        subscriptionId: sub.id,
        plan: planFromPrice(sub.items.data[0]?.price.id) ?? (sub.metadata?.plan as PlanId | undefined) ?? null,
        status: mapStripeStatus(sub.status),
      });
      break;
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
      const subField = invoice.subscription;
      const subId = typeof subField === 'string' ? subField : subField?.id;
      if (!subId) break;
      const sub = await client.subscriptions.retrieve(subId);
      const userId = userIdFromStripe(sub);
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      if (!userId) break;
      applySubscription({
        userId,
        customerId,
        subscriptionId: sub.id,
        plan: planFromPrice(sub.items.data[0]?.price.id) ?? null,
        status: event.type === 'invoice.payment_failed' ? 'past_due' : mapStripeStatus(sub.status),
      });
      break;
    }
    default:
      break;
  }

  return { ok: true };
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && PLAN_IDS.includes(value as PlanId);
}
