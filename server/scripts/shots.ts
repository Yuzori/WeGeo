/**
 * Capture d'écran des pages de l'interface, en thème clair et sombre.
 * Sert à contrôler le rendu : `npx tsx server/scripts/shots.ts`
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.WEB_URL ?? 'http://localhost:5173';
const OUT = 'tmp/shots';

/** `full` : page entière, sinon seulement la fenêtre (listes très longues). */
const PAGES: Array<{ path: string; name: string; full?: boolean }> = [
  { path: '/', name: 'recherche', full: true },
  { path: '/a-trier', name: 'a-trier' },
  { path: '/favoris', name: 'favoris' },
  { path: '/historique', name: 'historique' },
];

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors: string[] = [];

  for (const theme of ['clair', 'sombre'] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 940 } });
    await ctx.addInitScript(`localStorage.setItem('wegeo.theme', '${theme}')`);
    const page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && errors.push(`[${theme}] ${m.text()}`));
    page.on('pageerror', (e) => errors.push(`[${theme}] ${e.message}`));

    for (const { path, name, full } of PAGES) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/${name}-${theme}.png`, fullPage: full });
      console.log(`${name}-${theme}.png`);
    }

    // Barre d'actions groupées.
    await page.goto(`${BASE}/a-trier`, { waitUntil: 'networkidle' });
    const boxes = page.locator('input[type="checkbox"][aria-label^="Sélectionner"]');
    if (await boxes.first().isVisible().catch(() => false)) {
      await boxes.nth(0).check();
      await boxes.nth(1).check();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/selection-${theme}.png` });
      console.log(`selection-${theme}.png`);
    }

    // Formulaire déplié, avec des métiers saisis.
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.fill('#ville', 'Annecy');
    for (const domain of ['coiffeur', 'plombier']) {
      await page.fill('#metier', domain);
      await page.keyboard.press('Enter');
    }
    await page.getByText('Options de recherche').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/options-${theme}.png`, fullPage: true });
    console.log(`options-${theme}.png`);

    // Recherche réelle : panneau de scan, résultats puis tableur.
    if (process.env.SCAN) {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.fill('#ville', 'Rumilly');
      await page.fill('#metier', 'boulangerie');
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Rechercher' }).click();

      await page.waitForTimeout(6000);
      await page.screenshot({ path: `${OUT}/scan-${theme}.png` });
      console.log(`scan-${theme}.png`);

      await page.getByText('Voir le tableur').waitFor({ timeout: 120_000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/resultats-${theme}.png` });
      console.log(`resultats-${theme}.png`);

      await page.getByText('Voir le tableur').click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/tableur-${theme}.png` });
      console.log(`tableur-${theme}.png`);
    }

    await ctx.close();
  }

  // Rendu sur téléphone.
  const mobile = await browser.newContext({ viewport: { width: 414, height: 896 }, isMobile: true });
  const small = await mobile.newPage();
  for (const { path, name } of PAGES.slice(0, 2)) {
    await small.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await small.waitForTimeout(700);
    await small.screenshot({ path: `${OUT}/mobile-${name}.png` });
    console.log(`mobile-${name}.png`);
  }
  await small.getByLabel('Ouvrir le menu').click();
  await small.waitForTimeout(600);
  await small.screenshot({ path: `${OUT}/mobile-menu.png` });
  console.log('mobile-menu.png');
  await mobile.close();

  await browser.close();
  console.log(errors.length ? `\nErreurs console :\n${errors.join('\n')}` : '\nAucune erreur console.');
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
