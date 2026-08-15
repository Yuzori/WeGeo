/**
 * Diagnostic d'une fiche détaillée précise.
 *
 *   npm run probe:place -- "https://www.google.com/maps/place/..."
 */

import { closeBrowser, fetchPlaceDetails } from '../scraper/maps.ts';

const url = process.argv[2];
if (!url) {
  console.error('Indiquez une URL de fiche Google Maps.');
  process.exit(1);
}

console.log(await fetchPlaceDetails(url));
await closeBrowser();
