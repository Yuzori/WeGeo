import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { ArrowLeft, Lock, ShieldCheck } from 'lucide-react';
import type { BillingPlan, PlanId, PublicUser } from '../../shared/types';
import { BrandMark } from '../components/BrandMark';
import { cx } from '../components/ui';
import { api } from '../api';
import { useAuth } from '../auth';
import { trackEvent } from '../lib/analytics';

type CheckoutIntent = {
  clientSecret: string;
  returnUrl: string;
  planName: string;
  amountLabel: string;
  interval: 'month' | 'year';
};

const stripeAppearance = {
  theme: 'night' as const,
  variables: {
    colorPrimary: '#b7e133',
    colorBackground: '#121612',
    colorText: '#f3f0e6',
    colorTextSecondary: '#a8a89a',
    colorTextPlaceholder: '#6b6f66',
    colorDanger: '#f87171',
    iconColor: '#ffffff',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSizeBase: '15px',
    spacingUnit: '4px',
    borderRadius: '12px',
  },
  rules: {
    '.Input': {
      border: '1px solid color-mix(in oklab, #b7e133 18%, transparent)',
      boxShadow: 'none',
      backgroundColor: '#0c0f0a',
    },
    '.Input:focus': {
      border: '1px solid color-mix(in oklab, #b7e133 48%, transparent)',
      boxShadow: '0 0 0 3px color-mix(in oklab, #b7e133 14%, transparent)',
    },
    '.Label': {
      fontWeight: '500',
      letterSpacing: '0.02em',
    },
    '.Tab': {
      border: '1px solid color-mix(in oklab, #b7e133 12%, transparent)',
      backgroundColor: '#0c0f0a',
    },
    '.Tab--selected': {
      border: '1px solid color-mix(in oklab, #b7e133 38%, transparent)',
      backgroundColor: 'color-mix(in oklab, #b7e133 10%, #0c0f0a)',
    },
    '.TabIcon': {
      color: '#ffffff',
    },
    '.TabIcon--card': {
      color: '#ffffff',
      filter: 'brightness(0) invert(1)',
    },
    '.TabLabel': {
      color: '#d8d8cc',
    },
    '.Tab--selected .TabLabel': {
      color: '#f3f0e6',
    },
  },
};

const paymentElementOptions = {
  layout: 'tabs' as const,
  paymentMethodOrder: ['card', 'apple_pay', 'google_pay', 'link', 'paypal'],
  wallets: {
    applePay: 'auto' as const,
    googlePay: 'auto' as const,
    link: 'auto' as const,
  },
};

function CheckoutPaymentForm({
  intent,
  onIntervalChange,
  onPaid,
}: {
  intent: CheckoutIntent;
  onIntervalChange: (interval: 'month' | 'year') => void;
  onPaid: (user: PublicUser) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: intent.returnUrl },
        redirect: 'if_required',
      });
      if (stripeError) {
        setError(stripeError.message ?? 'Le paiement a échoué.');
        return;
      }
      const status = paymentIntent?.status;
      if (
        paymentIntent?.id &&
        (status === 'succeeded' || status === 'processing' || status === 'requires_capture')
      ) {
        const { user } = await api.confirmPayment(paymentIntent.id);
        onPaid(user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de valider le paiement.');
    } finally {
      setBusy(false);
    }
  };

  const cadence = intent.interval === 'year' ? 'an' : 'mois';

  return (
    <form className="checkout-pay" onSubmit={onSubmit}>
      <div className="checkout-billing-toggle" role="group" aria-label="Facturation">
        <button
          type="button"
          className={cx('checkout-billing-btn', intent.interval === 'month' && 'is-on')}
          onClick={() => onIntervalChange('month')}
        >
          Mensuel
        </button>
        <button
          type="button"
          className={cx('checkout-billing-btn', intent.interval === 'year' && 'is-on')}
          onClick={() => onIntervalChange('year')}
        >
          Annuel
          <span className="checkout-billing-save">2 mois offerts</span>
        </button>
      </div>

      <div className="checkout-element-wrap">
        <PaymentElement options={paymentElementOptions} />
      </div>

      {error && <p className="checkout-error">{error}</p>}

      <button type="submit" className="checkout-submit" disabled={!stripe || !elements || busy}>
        {busy ? 'Traitement…' : `Payer ${intent.amountLabel} / ${cadence}`}
      </button>

      <p className="checkout-secure">
        <Lock className="size-3.5 shrink-0" aria-hidden />
        Paiement chiffré par Stripe. Prospy ne voit jamais votre numéro de carte.
      </p>
    </form>
  );
}

export function CheckoutPage() {
  const { user, refresh, setUser } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = params.get('plan');
  const requestedInterval = params.get('interval') === 'year' ? 'year' : 'month';
  const isStripeReturn = params.get('checkout') === 'success';
  const confirmingRef = useRef(false);
  const [confirmingPayment, setConfirmingPayment] = useState(isStripeReturn);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [planId, setPlanId] = useState<PlanId | null>(null);
  const [interval, setInterval] = useState<'month' | 'year'>(requestedInterval);
  const [intent, setIntent] = useState<CheckoutIntent | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey],
  );

  const selectedPlan = plans.find((p) => p.id === planId) ?? null;

  useEffect(() => {
    if (!isStripeReturn || confirmingRef.current) return;
    const paymentIntentId = params.get('payment_intent');
    const redirectStatus = params.get('redirect_status');

    if (redirectStatus === 'failed') {
      setError('Le paiement a été refusé. Réessayez avec une autre carte.');
      setConfirmingPayment(false);
      setParams(new URLSearchParams({ plan: requested ?? '', interval: requestedInterval }), { replace: true });
      return;
    }

    if (!paymentIntentId) {
      setConfirmingPayment(false);
      return;
    }

    confirmingRef.current = true;
    setConfirmingPayment(true);
    setError(null);

    api
      .confirmPayment(paymentIntentId)
      .then((data) => finishPaid(data.user))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Impossible de valider le paiement.');
        setConfirmingPayment(false);
        void refresh();
      });
  }, [isStripeReturn, navigate, params, refresh, requested, requestedInterval, setParams, setUser]);

  useEffect(() => {
    setInterval(requestedInterval);
  }, [requestedInterval]);

  useEffect(() => {
    api
      .billingConfig()
      .then((config) => {
        setPlans(config.plans);
        setPublishableKey(config.publishableKey);
        setConfigured(config.configured);
        const match = config.plans.find(
          (p) =>
            p.id === requested &&
            (requestedInterval === 'year' ? p.annualPriceConfigured : p.priceConfigured),
        );
        setPlanId((match?.id ?? config.plans.find((p) => p.highlighted)?.id ?? config.plans[0]?.id) ?? null);
      })
      .catch(() => setError('Impossible de charger les offres.'));
  }, [requested, requestedInterval]);

  useEffect(() => {
    if (!planId || !configured || isStripeReturn || confirmingPayment) {
      if (!isStripeReturn && !confirmingPayment) setIntent(null);
      return;
    }
    let cancelled = false;
    setLoadingIntent(true);
    setError(null);
    setIntent(null);

    api
      .checkout(planId, interval)
      .then((payload) => {
        if (!cancelled) setIntent(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Impossible de préparer le paiement.');
      })
      .finally(() => {
        if (!cancelled) setLoadingIntent(false);
      });

    return () => {
      cancelled = true;
    };
  }, [planId, interval, configured, isStripeReturn, confirmingPayment]);

  const pickPlan = (id: PlanId) => {
    setPlanId(id);
    const next = new URLSearchParams(params);
    next.set('plan', id);
    setParams(next, { replace: true });
  };

  const pickInterval = (next: 'month' | 'year') => {
    setInterval(next);
    const qs = new URLSearchParams(params);
    qs.set('interval', next);
    setParams(qs, { replace: true });
  };

  const finishPaid = (nextUser: NonNullable<typeof user>) => {
    setUser(nextUser);
    trackEvent('funnel:paid', { plan: nextUser.plan ?? 'unknown' });
    navigate('/app', { replace: true });
  };

  return (
    <div className="checkout-page">
      <div className="checkout-grid">
        <aside className="checkout-summary">
          <Link to="/" className="checkout-back">
            <ArrowLeft className="size-4" aria-hidden />
            Retour
          </Link>
          <BrandMark alt="Prospy" className="checkout-logo" />
          <p className="checkout-kicker">Abonnement Prospy</p>
          <h1 className="checkout-title">Activez votre accès</h1>
          <p className="checkout-lead">
            Relevés Maps, pipeline d&apos;appels, export. Tout se débloque dès le paiement validé.
          </p>

          {user?.email && (
            <p className="checkout-account">
              Compte <span>{user.email}</span>
            </p>
          )}

          <div className="checkout-plan-pick">
            {plans.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => pickPlan(item.id)}
                className={cx('checkout-plan-btn', planId === item.id && 'is-on', item.highlighted && 'is-hot')}
              >
                <span className="checkout-plan-name">{item.name}</span>
                <span className="checkout-plan-price">
                  {interval === 'month' ? item.amountLabel : item.annualAmountLabel}
                  <span className="checkout-plan-cadence">/{interval === 'month' ? 'mois' : 'an'}</span>
                </span>
                <span className="checkout-plan-tag">{item.tagline}</span>
              </button>
            ))}
          </div>

          {selectedPlan && (
            <ul className="checkout-features">
              {selectedPlan.features.slice(0, 4).map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          )}

          <p className="checkout-trust">
            <ShieldCheck className="size-4 shrink-0 text-lime-deep" aria-hidden />
            Facturation récurrente. Résiliable depuis les paramètres.
          </p>
        </aside>

        <section className="checkout-panel" aria-label="Paiement">
          {confirmingPayment && (
            <div className="checkout-panel-loading">
              <p>Validation du paiement…</p>
            </div>
          )}

          {!confirmingPayment && !configured && (
            <p className="checkout-panel-msg">
              Stripe n&apos;est pas configuré sur ce serveur. Ajoutez les clés dans <code>.env</code>.
            </p>
          )}

          {!confirmingPayment && configured && loadingIntent && (
            <div className="checkout-panel-loading">
              <p>Préparation du paiement sécurisé…</p>
            </div>
          )}

          {!confirmingPayment && configured && !loadingIntent && error && !intent && (
            <p className="checkout-error">{error}</p>
          )}

          {!confirmingPayment && configured && intent && stripePromise && selectedPlan && (
            <Elements
              key={intent.clientSecret}
              stripe={stripePromise}
              options={{
                clientSecret: intent.clientSecret,
                appearance: stripeAppearance,
              }}
            >
              <div className="checkout-panel-head">
                <p className="legend">Paiement</p>
                <h2 className="checkout-panel-title">
                  {intent.planName} · {intent.amountLabel}
                  <span className="text-muted"> / {intent.interval === 'year' ? 'an' : 'mois'}</span>
                </h2>
              </div>
              <CheckoutPaymentForm intent={intent} onIntervalChange={pickInterval} onPaid={finishPaid} />
            </Elements>
          )}
        </section>
      </div>
    </div>
  );
}
