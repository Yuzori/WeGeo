/**
 * Outil de diagnostic du scraping, hors interface.
 *
 *   npm run probe -- "boulangerie" "Annecy" [nombre]
 *
 * Affiche ce que Prospy lit réellement sur Google Maps : utile si Google
 * modifie sa page et que les résultats deviennent incomplets.
 */

import { closeBrowser, fetchPlaceDetails, scrapeList } from '../scraper/maps.ts';
import { classifyWebsite, findPhone, parseCardLines, placeKeyFrom, stripLabel } from '../scraper/parse.ts';

const [domain = 'boulangerie', city = 'Annecy', maxRaw = '12'] = process.argv.slice(2);
const max = Number(maxRaw) || 12;

console.log(`\nRecherche « ${domain} » à ${city } (max ${max} fiches)\n${'-'.repeat(60)}`);

const started = Date.now();
const cards = await scrapeList(`${domain} ${city}`, null, {
  max,
  onProgress: (n) => process.stdout.write(`\r  ${n} fiches chargées…`),
});

console.log(`\r  ${cards.length} fiches lues en ${((Date.now() - started) / 1000).toFixed(1)}s\n`);

let withoutSite = 0;
for (const card of cards) {
  const lines = card.text.split('\n').map((l) => l.trim()).filter(Boolean);
  const { category, address } = parseCardLines(lines, card.name);
  const { kind } = classifyWebsite(card.websiteUrl);
  if (kind !== 'site') withoutSite++;

  if (process.env.RAW === '1') console.log(`\n     [brut] ${JSON.stringify(lines)}`);

  console.log(`${kind === 'site' ? '   ' : ' ★ '}${card.name}`);
  console.log(`     clé      : ${placeKeyFrom(card.mapsUrl, card.name, address)}`);
  console.log(`     activité : ${category ?? '—'}`);
  console.log(`     adresse  : ${address ?? '—'}`);
  console.log(`     tél      : ${findPhone(card.text) ?? '—'}`);
  console.log(`     site     : ${kind} ${card.websiteUrl ?? ''}`);
}

console.log(`\n${'-'.repeat(60)}\n★ = cible potentielle : ${withoutSite}/${cards.length}\n`);

const target = cards.find((c) => classifyWebsite(c.websiteUrl).kind !== 'site');
if (target) {
  console.log(`Vérification approfondie de « ${target.name} »…`);
  const details = await fetchPlaceDetails(target.mapsUrl);
  console.log({
    nom: details?.name,
    activité: details?.category,
    adresse: stripLabel(details?.address),
    téléphone: stripLabel(details?.phone),
    site: details?.website,
    note: details?.ratingText,
  });
}

await closeBrowser();
