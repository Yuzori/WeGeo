import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import type { BillingPlan, PlanId } from '../../shared/types';
import { BrandMark } from '../components/BrandMark';
import { api } from '../api';
import { useAuth } from '../auth';

/**
 * Checkout Stripe embarqué. Les données bancaires ne transitent jamais
 * par nos serveurs : Stripe les collecte dans cette iframe.
 */
export function CheckoutPage() {
  const { user, refresh } = useAuth();
  const [params] = useSearchParams();
  const requested = params.get('plan');
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [plan, setPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const checkoutRef = useRef<{ destroy: () => void } | null>(null);

  useEffect(() => {
    api
      .billingConfig()
      .then((config) => {
        setPlans(config.plans);
        setPublishableKey(config.publishableKey);
        setConfigured(config.configured);
        const match = config.plans.find((p) => p.id === requested && p.priceConfigured);
        setPlan((match?.id ?? config.plans.find((p) => p.highlighted)?.id ?? config.plans[0]?.id) ?? null);
      })
      .catch(() => setError('Impossible de charger les offres.'));
  }, [requested]);

  useEffect(() => {
    if (!plan || !publishableKey || !host.current) return;
    let cancelled = false;

    const mount = async () => {
      setError(null);
      checkoutRef.current?.destroy();
      checkoutRef.current = null;
      try {
        const stripe = await loadStripe(publishableKey);
        if (!stripe || cancelled) return;
        const checkout = await stripe.createEmbeddedCheckoutPage({
          fetchClientSecret: async () => {
            const { clientSecret } = await api.checkout(plan);
            return clientSecret;
          },
        });
        if (cancelled) {
          checkout.destroy();
          return;
        }
        checkout.mount(host.current!);
        checkoutRef.current = checkout;
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Le paiement n’a pas pu démarrer.');
      }
    };

    void mount();
    return () => {
      cancelled = true;
      checkoutRef.current?.destroy();
      checkoutRef.current = null;
    };
  }, [plan, publishableKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-3 py-8 sm:px-4 sm:py-10">
      <Link to="/" className="mb-8 inline-flex">
        <BrandMark alt="Prospy" className="h-10 w-10" />
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Abonnement</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Le paiement est traité par Stripe, dans cette page. Prospy ne stocke pas de numéro de carte.
        {user?.email && (
          <>
            {' '}
            Compte : <span className="text-ink">{user.email}</span>
          </>
        )}
      </p>

      {!configured && (
        <p className="mt-6 rounded-md border border-rule bg-card px-4 py-3 text-sm text-muted">
          Stripe n’est pas encore configuré sur ce serveur. Ajoutez les clés et Price IDs dans les variables
          d’environnement pour activer le paiement.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {plans.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPlan(item.id)}
            className={
              plan === item.id
                ? 'rounded-md border border-lime-line bg-lime-soft px-3 py-1.5 text-sm font-semibold'
                : 'rounded-md border border-rule px-3 py-1.5 text-sm text-muted hover:border-rule-strong'
            }
          >
            {item.name}
            <span className="ml-2 font-mono text-[11px] text-faint">{item.amountLabel}</span>
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-score-low">{error}</p>}

      {/* Conteneur officiel Stripe Embedded Checkout */}
      <div ref={host} className="mt-6 min-h-[480px] overflow-hidden rounded-lg border border-rule bg-card" />

      <p className="mt-4 text-xs text-faint">
        Après paiement, Stripe confirme l’abonnement par webhook. L’écran de succès ne suffit pas à débloquer
        l’accès.
      </p>
    </div>
  );
}
