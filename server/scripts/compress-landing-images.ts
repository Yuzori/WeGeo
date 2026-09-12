/**
 * Compresse les visuels de la landing en WebP + JPEG optimisé.
 * Usage : npm run images:landing
 */
import { readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(import.meta.dirname, '..', '..', 'public');
const MAX_WIDTH = 1600;
const WEBP_QUALITY = 84;
const JPEG_QUALITY = 85;

const LANDING_NAMES = new Set([
  'maps',
  'pipeline',
  'calls',
  'export',
  'trust-1',
  'trust-2',
  'trust-3',
  'trust-4',
  'trust-google',
  'search',
  'plan-starter',
  'plan-pro',
  'plan-agence',
]);

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
  return `${Math.round(bytes / 1024)} Ko`;
}

function collectSources(): string[] {
  const dirs = [ROOT, join(ROOT, 'landing')];
  const files: string[] = [];
  for (const dir of dirs) {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const ext = extname(entry).toLowerCase();
      if (!['.jpg', '.jpeg', '.png'].includes(ext)) continue;
      const name = basename(entry, ext);
      if (!LANDING_NAMES.has(name)) continue;
      files.push(join(dir, entry));
    }
  }
  return [...new Set(files)].sort();
}

async function optimize(file: string): Promise<void> {
  const before = statSync(file).size;
  const ext = extname(file).toLowerCase();
  const base = file.slice(0, -ext.length);
  const webpOut = `${base}.webp`;

  const input = sharp(file, { failOn: 'none' }).rotate();
  const meta = await input.metadata();
  const pipeline = meta.width && meta.width > MAX_WIDTH ? input.resize({ width: MAX_WIDTH, withoutEnlargement: true }) : input;

  await pipeline.clone().webp({ quality: WEBP_QUALITY, effort: 6, smartSubsample: true }).toFile(webpOut);

  const tempOut = `${file}.opt.tmp`;
  if (ext === '.png') {
    await pipeline
      .clone()
      .png({ quality: JPEG_QUALITY, compressionLevel: 9, palette: meta.hasAlpha })
      .toFile(tempOut);
  } else {
    await pipeline.clone().jpeg({ quality: JPEG_QUALITY, mozjpeg: true, progressive: true }).toFile(tempOut);
  }
  try {
    unlinkSync(file);
  } catch {
    /* ignore */
  }
  renameSync(tempOut, file);

  const afterJpg = statSync(file).size;
  const afterWebp = statSync(webpOut).size;
  const rel = file.replace(`${ROOT}\\`, '').replace(`${ROOT}/`, '');
  console.log(
    `${rel}\n  JPEG/PNG ${formatBytes(before)} → ${formatBytes(afterJpg)} · WebP ${formatBytes(afterWebp)}`,
  );
}

const files = collectSources();
if (!files.length) {
  console.log('Aucune image landing trouvée dans public/.');
  process.exit(0);
}

console.log(`Optimisation de ${files.length} visuel(s) landing…\n`);
for (const file of files) {
  await optimize(file);
}
console.log('\nTerminé. Les navigateurs modernes chargeront le WebP via <picture>.');
