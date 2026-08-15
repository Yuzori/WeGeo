/** Génération des exports tableur (CSV Excel-FR et XLSX). */

import ExcelJS from 'exceljs';
import type { Lead } from '../shared/types.ts';

export const COLUMNS = [
  { key: 'name', label: 'Entreprise', width: 32 },
  { key: 'category', label: 'Activité', width: 22 },
  { key: 'phone', label: 'Téléphone', width: 16 },
  { key: 'address', label: 'Adresse', width: 42 },
  { key: 'city', label: 'Ville', width: 18 },
  { key: 'domain', label: 'Métier recherché', width: 20 },
  { key: 'website', label: 'Site / réseau', width: 28 },
  { key: 'rating', label: 'Note', width: 8 },
  { key: 'reviewCount', label: 'Avis', width: 8 },
  { key: 'status', label: 'Statut', width: 12 },
  { key: 'notes', label: 'Notes', width: 30 },
  { key: 'mapsUrl', label: 'Lien Google Maps', width: 44 },
] as const;

const STATUS_LABEL: Record<Lead['status'], string> = {
  nouveau: 'Nouveau',
  favori: 'Favori',
  termine: 'Terminé',
  perdu: 'Non conclu',
};

function cell(lead: Lead, key: (typeof COLUMNS)[number]['key']): string {
  switch (key) {
    case 'status':
      return STATUS_LABEL[lead.status];
    case 'website':
      return lead.websiteKind === 'aucun' ? 'Aucun site' : (lead.website ?? '');
    case 'rating':
      return lead.rating != null ? String(lead.rating).replace('.', ',') : '';
    case 'reviewCount':
      return lead.reviewCount != null ? String(lead.reviewCount) : '';
    default:
      return (lead[key] as string | null) ?? '';
  }
}

/** Lignes prêtes à afficher dans l'aperçu tableur de l'interface. */
export function toRows(leads: Lead[]): { headers: string[]; rows: string[][] } {
  return {
    headers: COLUMNS.map((c) => c.label),
    rows: leads.map((lead) => COLUMNS.map((c) => cell(lead, c.key))),
  };
}

/**
 * CSV compatible Excel français : séparateur point-virgule et BOM UTF-8
 * pour que les accents s'affichent correctement.
 */
export function toCsv(leads: Lead[]): string {
  const { headers, rows } = toRows(leads);
  const escape = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [headers.map(escape).join(';'), ...rows.map((r) => r.map(escape).join(';'))];
  return `\uFEFF${lines.join('\r\n')}`;
}

/** TSV : format idéal pour un collage direct dans Google Sheets. */
export function toTsv(leads: Lead[]): string {
  const { headers, rows } = toRows(leads);
  const clean = (v: string) => v.replace(/[\t\n\r]+/g, ' ').trim();
  return [headers.join('\t'), ...rows.map((r) => r.map(clean).join('\t'))].join('\n');
}

export async function toXlsx(leads: Lead[], sheetName = 'Prospection'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'WeGeo';
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetName.slice(0, 30), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = COLUMNS.map((c) => ({ header: c.label, key: c.key, width: c.width }));

  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  ws.getRow(1).height = 22;
  ws.getRow(1).alignment = { vertical: 'middle' };

  for (const lead of leads) {
    const row = ws.addRow(Object.fromEntries(COLUMNS.map((c) => [c.key, cell(lead, c.key)])));
    const link = row.getCell('mapsUrl');
    if (lead.mapsUrl) {
      link.value = { text: 'Voir sur Maps', hyperlink: lead.mapsUrl };
      link.font = { color: { argb: 'FF0F766E' }, underline: true };
    }
    if (lead.phone) row.getCell('phone').alignment = { horizontal: 'left' };
  }

  ws.autoFilter = { from: 'A1', to: { row: 1, column: COLUMNS.length } };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Nom de fichier sûr, sans accents ni caractères interdits. */
export function safeFileName(parts: (string | undefined | null)[], ext: string): string {
  const base = parts
    .filter(Boolean)
    .join('-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `${base || 'wegeo'}.${ext}`;
}
