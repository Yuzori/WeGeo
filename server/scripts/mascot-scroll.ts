/** Vérifie que la mascotte ne rentre pas à la barre pendant un scroll. */
import { chromium } from 'playwright';

const BASE = process.env.WEB_URL ?? 'http://localhost:5173';

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(`localStorage.setItem('wegeo.theme', 'nuit')`);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('requestfailed', (r) => errors.push(`fail: ${r.url()} ${r.failure()?.errorText}`));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  console.log('boot', await page.evaluate(() => ({
    root: document.getElementById('root')?.childElementCount ?? -1,
    title: document.title,
  })));
  console.log('errors so far', errors);

  const sample = async () =>
    page.evaluate(() => {
      const c = document.querySelector<HTMLElement>('.lp-logo-canvas');
      const t = c?.style.transform ?? '';
      const m = t.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/);
      const y = m ? Number(m[2]) : null;
      return {
        sy: Math.round(window.scrollY),
        layer: c?.dataset.layer ?? null,
        departed: c?.dataset.departed ?? null,
        y: y == null ? null : Math.round(y),
        onScreen: y != null && y > -90 && y < window.innerHeight + 40,
        hasRoot: Boolean(document.getElementById('root')?.childElementCount),
      };
    });

  const start = await sample();
  const rows: Awaited<ReturnType<typeof sample>>[] = [start];

  for (let i = 1; i <= 16; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * 220);
    await page.waitForTimeout(180);
    rows.push(await sample());
  }
  await page.waitForTimeout(400);
  rows.push(await sample());

  const backNav = rows.filter((r) => (r.sy ?? 0) > 220 && r.layer === 'nav').length;
  const off = rows.filter((r) => r.departed === 'true' && !r.onScreen).length;
  console.log(`mascotte : backNav=${backNav} horsEcran=${off} erreurs=${errors.length}`);
  for (const r of rows) console.log(`  sy=${r.sy} y=${r.y} layer=${r.layer} vis=${r.onScreen}`);
  await browser.close();
  if (errors.length || !start.hasRoot || backNav > 0) process.exit(1);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
