/**
 * Vérifie la robustesse de plusieurs explorations simultanées.
 * Usage : npx tsx server/scripts/probe-parallel.ts [nb_de_metiers]
 */
import { closeBrowser, scrapeList } from '../scraper/maps.ts';

const DOMAINS = ['coiffeur', 'plombier', 'boulangerie', 'restaurant', 'électricien'];
const CITY = process.env.CITY ?? 'Rumilly';
const count = Number(process.argv[2] ?? 3);

const run = async () => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const started = Date.now();
    const results = await Promise.all(
      DOMAINS.slice(0, count).map(async (domain) => {
        const t0 = Date.now();
        try {
          const cards = await scrapeList(`${domain} ${CITY}`, null, { max: 30 });
          return `${domain}: ${cards.length} fiches en ${((Date.now() - t0) / 1000).toFixed(1)}s`;
        } catch (err) {
          return `${domain}: ÉCHEC (${err instanceof Error ? err.message.split('\n')[0] : err})`;
        }
      }),
    );
    console.log(`\n--- essai ${attempt} — ${((Date.now() - started) / 1000).toFixed(1)}s total`);
    for (const line of results) console.log('   ', line);
  }
  await closeBrowser();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
