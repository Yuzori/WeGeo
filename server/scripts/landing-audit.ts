/**
 * Relevé de la page d'accueil : position réelle de chaque section, coutures
 * entre blocs, et capture pleine page. Sert à situer les repères dessinés sur
 * une maquette annotée.
 *
 *   npx tsx server/scripts/landing-audit.ts
 *   npx tsx server/scripts/landing-audit.ts 0.0996 0.211 0.398 0.975
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.WEB_URL ?? 'http://localhost:5173';
const OUT = 'tmp/audit';
/** Valeurs attendues par applyStoredTheme : `nuit` ou `jour`. */
const THEME = process.env.THEME ?? 'nuit';
const marks = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));

type Block = { tag: string; id: string; cls: string; top: number; height: number; bg: string; borderTop: string; borderBottom: string };

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(`localStorage.setItem('wegeo.theme', '${THEME}')`);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  // Une ressource refusée par la politique de contenu apparaît ici.
  page.on('requestfailed', (r) => errors.push(`requête échouée ${r.url().slice(0, 120)} (${r.failure()?.errorText})`));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  // Laisser les révélations au défilement se déclencher sur toute la hauteur.
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 400));
  });
  await page.waitForTimeout(600);

  const data = await page.evaluate(() => {
    const total = document.documentElement.scrollHeight;
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('main > section, main > div > section, section, footer, .lp-mapband, .lp-cta-band'),
    );
    const seen = new Set<HTMLElement>();
    const blocks = nodes
      .filter((el) => {
        if (seen.has(el)) return false;
        seen.add(el);
        return el.getBoundingClientRect().height > 60;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          cls: el.className.toString().slice(0, 90),
          top: Math.round(r.top + window.scrollY),
          height: Math.round(r.height),
          bg: cs.backgroundColor,
          borderTop: cs.borderTopWidth === '0px' ? '' : `${cs.borderTopWidth} ${cs.borderTopColor}`,
          borderBottom: cs.borderBottomWidth === '0px' ? '' : `${cs.borderBottomWidth} ${cs.borderBottomColor}`,
        };
      })
      .sort((a, b) => a.top - b.top);
    return { total, blocks };
  });

  console.log(`hauteur totale : ${data.total} px\n`);
  console.log('sections :');
  for (const b of data.blocks as Block[]) {
    const pct = ((b.top / data.total) * 100).toFixed(1).padStart(5);
    console.log(
      `  ${pct}%  y=${String(b.top).padStart(6)}  h=${String(b.height).padStart(5)}  ${b.tag}${b.id ? '#' + b.id : ''}\n` +
        `           fond ${b.bg}${b.borderTop ? `  haut ${b.borderTop}` : ''}${b.borderBottom ? `  bas ${b.borderBottom}` : ''}\n` +
        `           ${b.cls}`,
    );
  }

  if (marks.length) {
    console.log('\nrepères de la maquette :');
    for (const frac of marks) {
      const y = Math.round(frac * data.total);
      let before: Block | null = null;
      let after: Block | null = null;
      for (const b of data.blocks as Block[]) {
        if (b.top <= y) before = b;
        if (b.top > y && !after) after = b;
      }
      const label = (b: Block | null) => (b ? `${b.tag}${b.id ? '#' + b.id : ''} (y=${b.top}, h=${b.height})` : 'rien');
      console.log(`  ${(frac * 100).toFixed(1)}%  y≈${y}`);
      console.log(`     dans   ${label(before)}`);
      console.log(`     suivi de ${label(after)}`);
    }
  }

  await page.screenshot({ path: `${OUT}/landing-${THEME}.png`, fullPage: true });
  console.log(`\ncapture : ${OUT}/landing-${THEME}.png`);
  console.log(errors.length ? `\nerreurs console :\n${errors.join('\n')}` : '\naucune erreur console.');
  await browser.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
