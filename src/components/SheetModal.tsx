import { useEffect, useState } from 'react';
import { ClipboardCopy, Download, FileSpreadsheet, Table2 } from 'lucide-react';
import { api, type LeadQuery } from '../api';
import { Button, Modal, Spinner, useToast } from './ui';

/**
 * Aperçu du tableur avant export : l'utilisateur voit exactement les
 * colonnes et les lignes qui partiront dans Excel ou Google Sheets.
 */
export function SheetModal({
  open,
  onClose,
  query,
  title,
}: {
  open: boolean;
  onClose: () => void;
  query: LeadQuery;
  title: string;
}) {
  const notify = useToast();
  const [data, setData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState(false);

  const queryKey = JSON.stringify(query);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .preview(JSON.parse(queryKey) as LeadQuery)
      .then(setData)
      .catch(() => notify("Impossible de charger l'aperçu", 'error'))
      .finally(() => setLoading(false));
  }, [open, queryKey, notify]);

  const copyForSheets = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(await api.tsv(query));
      notify('Tableau copié — collez-le dans Google Sheets (Ctrl+V)');
    } catch {
      notify('Copie impossible', 'error');
    } finally {
      setCopying(false);
    }
  };

  const count = data?.rows.length ?? 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={`Tableur — ${title}`}
      subtitle={loading ? 'Préparation…' : `${count} ligne${count > 1 ? 's' : ''} prête${count > 1 ? 's' : ''} à exporter`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-subtle">
            Le CSV s'ouvre directement dans Excel. Pour Google Sheets, utilisez « Copier ».
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<ClipboardCopy className="size-4" />}
              loading={copying}
              onClick={copyForSheets}
              disabled={!count}
            >
              Copier pour Google Sheets
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Download className="size-4" />}
              disabled={!count}
              onClick={() => {
                window.location.href = api.downloadUrl('csv', query);
              }}
            >
              CSV
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<FileSpreadsheet className="size-4" />}
              disabled={!count}
              onClick={() => {
                window.location.href = api.downloadUrl('xlsx', query);
              }}
            >
              Excel (.xlsx)
            </Button>
          </div>
        </div>
      }
    >
      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-subtle">
          <Spinner /> Chargement du tableau…
        </div>
      ) : !count ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <Table2 className="size-8 text-subtle" />
          <p className="text-sm text-subtle">Aucune ligne à exporter pour ce filtre.</p>
        </div>
      ) : (
        <div className="scroll-slim overflow-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="border-b border-line bg-surface-3 px-2 py-2.5 font-semibold text-subtle">#</th>
                {data!.headers.map((header) => (
                  <th
                    key={header}
                    className="border-b border-line bg-surface-3 px-3 py-2.5 font-semibold whitespace-nowrap text-text"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data!.rows.map((row, index) => (
                <tr key={index} className="transition-colors even:bg-surface-2 hover:bg-accent-soft">
                  <td className="tnum border-b border-line px-2 py-2 text-right text-subtle">{index + 1}</td>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="max-w-[280px] truncate border-b border-line px-3 py-2 text-muted"
                      title={cell}
                    >
                      {cell.startsWith('http') ? (
                        <a href={cell} target="_blank" rel="noreferrer" className="text-accent-text hover:underline">
                          {cell}
                        </a>
                      ) : (
                        cell
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
