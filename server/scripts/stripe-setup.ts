/**
 * Crée (ou retrouve) les produits et prix Prospy dans Stripe Test/Live
 * selon STRIPE_SECRET_KEY. Affiche les lignes à mettre dans `.env`.
 */
import '../env.ts';
import Stripe from 'stripe';

const PLANS = [
  { id: 'starter', name: 'Prospy Starter', month: 2900, year: 29000 },
  { id: 'pro', name: 'Prospy Pro', month: 5900, year: 59000 },
  { id: 'agence', name: 'Prospy Agence', month: 11900, year: 111900 },
] as const;

async function main() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.error('STRIPE_SECRET_KEY manquant dans .env');
    process.exit(1);
  }

  const stripe = new Stripe(key);
  const products = await stripe.products.list({ limit: 100, active: true });
  const prices = await stripe.prices.list({ limit: 100, active: true });

  const out: Record<string, string> = {};

  for (const plan of PLANS) {
    let product = products.data.find((p) => p.metadata?.prospy_plan === plan.id);
    if (!product) {
      product = await stripe.products.create({
        name: plan.name,
        metadata: { prospy_plan: plan.id },
      });
      console.log(`Produit créé : ${plan.name} (${product.id})`);
    } else {
      console.log(`Produit existant : ${plan.name} (${product.id})`);
    }

    for (const interval of ['month', 'year'] as const) {
      const amount = interval === 'month' ? plan.month : plan.year;
      const envKey =
        interval === 'month'
          ? `STRIPE_PRICE_${plan.id.toUpperCase()}`
          : `STRIPE_PRICE_${plan.id.toUpperCase()}_ANNUAL`;

      let price = prices.data.find(
        (p) =>
          p.product === product!.id &&
          p.recurring?.interval === interval &&
          p.unit_amount === amount &&
          p.currency === 'eur',
      );

      if (!price) {
        price = await stripe.prices.create({
          product: product.id,
          currency: 'eur',
          unit_amount: amount,
          recurring: { interval },
          metadata: { prospy_plan: plan.id, prospy_interval: interval },
        });
        console.log(`  Prix ${interval} créé : ${amount / 100} € (${price.id})`);
      } else {
        console.log(`  Prix ${interval} existant : ${price.id}`);
      }

      out[envKey] = price.id;
    }
  }

  console.log('\n# Coller dans .env :\n');
  for (const [k, v] of Object.entries(out)) {
    console.log(`${k}=${v}`);
  }
  console.log('\nPLAN_STARTER_CENTS=2900');
  console.log('PLAN_PRO_CENTS=5900');
  console.log('PLAN_AGENCE_CENTS=11900');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
