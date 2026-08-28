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

function envPrice(plan: PlanId): string | undefined {
  const map: Record<PlanId, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    pro: process.env.STRIPE_PRICE_PRO,
    agence: process.env.STRIPE_PRICE_AGENCE,
  };
  const value = map[plan]?.trim();
  return value || undefined;
}

function amountLabel(plan: PlanId): string {
  const centsRaw = process.env[`PLAN_${plan.toUpperCase()}_CENTS`];
  const parsed = centsRaw ? Number(centsRaw) : NaN;
  const cents = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_CENTS[plan];
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

const DEFAULT_CENTS: Record<PlanId, number> = {
  starter: 1900,
  pro: 4900,
  agence: 8900,
};

const CATALOG: Array<Omit<BillingPlan, 'amountLabel' | 'priceConfigured'>> = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Pour lancer les premières tournées.',
    interval: 'month',
    cta: 'Choisir Starter',
    features: [
      'Relevé Google Maps des commerces sans site',
      'Pipeline d’appels : trier, appeler, classer',
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
    tagline: 'Pour enchaîner les villes et les métiers.',
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
    priceConfigured: Boolean(envPrice(plan.id)),
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
    if (envPrice(id) === priceId) return id;
  }
  return null;
}

export function upsertSubscription(params: {
  userId: number;
  customerId: string;
  subscriptionId: string | null;
  plan: PlanId | null;
  status: SubscriptionStatus;
}): void {
  const ts = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM subscriptions WHERE user_id = ?').get(params.userId) as Row | undefined;
  if (existing) {
    db.prepare(
      `UPDATE subscriptions
       SET stripe_customer_id = ?, stripe_subscription_id = ?, plan = ?, status = ?, updated_at = ?
       WHERE user_id = ?`,
    ).run(params.customerId, params.subscriptionId, params.plan, params.status, ts, params.userId);
    return;
  }
  db.prepare(
    `INSERT INTO subscriptions
      (user_id, stripe_customer_id, stripe_subscription_id, plan, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(params.userId, params.customerId, params.subscriptionId, params.plan, params.status, ts, ts);
}

function userIdFromStripe(obj: { client_reference_id?: string | null; metadata?: Stripe.Metadata | null }): number | null {
  const raw = obj.metadata?.userId ?? obj.client_reference_id;
  const id = raw ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function createEmbeddedCheckout(user: AuthUser, planId: string, req: Request): Promise<{ clientSecret: string } | { error: string; status: number }> {
  const client = stripe();
  const publishable = process.env.STRIPE_PUBLISHABLE_KEY?.trim();
  if (!client || !publishable) {
    return { error: 'Les paiements ne sont pas encore configurés sur ce serveur.', status: 503 };
  }
  if (!isPlanId(planId)) {
    return { error: 'Offre inconnue.', status: 400 };
  }
  const plan = planId;
  const price = envPrice(plan);
  if (!price) {
    return { error: 'Cette offre n’a pas de tarif Stripe configuré.', status: 503 };
  }

  const existing = db
    .prepare('SELECT stripe_customer_id FROM subscriptions WHERE user_id = ?')
    .get(user.id) as Row | undefined;

  const session = await client.checkout.sessions.create({
    ui_mode: 'embedded',
    mode: 'subscription',
    customer: typeof existing?.stripe_customer_id === 'string' ? existing.stripe_customer_id : undefined,
    customer_email: existing?.stripe_customer_id ? undefined : user.email,
    client_reference_id: String(user.id),
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    return_url: `${publicBaseUrl(req)}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    metadata: { userId: String(user.id), plan },
    subscription_data: {
      metadata: { userId: String(user.id), plan },
    },
  });

  if (!session.client_secret) {
    return { error: 'Stripe n’a pas renvoyé de session embarquée.', status: 502 };
  }
  return { clientSecret: session.client_secret };
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

  upsertSubscription({
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
      upsertSubscription({ userId, customerId, subscriptionId, plan, status });
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = userIdFromStripe(sub);
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      if (!userId) break;
      upsertSubscription({
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
      upsertSubscription({
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
