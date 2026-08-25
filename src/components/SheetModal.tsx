import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ClipboardCopy, Download, FileSpreadsheet, Table2 } from 'lucide-react';
import { api, type LeadQuery } from '../api';
import { useAuth } from '../auth';
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
  const { user } = useAuth();
  const location = useLocation();
  const [data, setData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [pushing, setPushing] = useState(false);

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

  const openInSheets = async () => {
    if (!user?.canExportSheets) {
      window.location.href = api.googleUrl(location.pathname + location.search, true);
      return;
    }
    setPushing(true);
    try {
      const sheet = await api.exportSheets(query);
      window.open(sheet.url, '_blank', 'noopener,noreferrer');
      notify('Tableur ouvert dans Google Sheets');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Export Google Sheets impossible', 'error');
    } finally {
      setPushing(false);
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
          <p className="legend">
            {user?.canExportSheets
              ? 'Google Sheets s’ouvre dans un nouvel onglet'
              : 'connectez Google une fois, ensuite le tableur part tout seul'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              icon={<FileSpreadsheet className="size-4" />}
              loading={pushing}
              disabled={!count}
              onClick={() => void openInSheets()}
            >
              {user?.canExportSheets ? 'Ouvrir dans Google Sheets' : 'Connecter Google Sheets'}
            </Button>
            <Button
              size="sm"
              icon={<ClipboardCopy className="size-4" />}
              loading={copying}
              onClick={copyForSheets}
              disabled={!count}
            >
              Copier
            </Button>
            <Button
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
              variant="outline"
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
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-faint">
          <Spinner /> Chargement du tableau…
        </div>
      ) : !count ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <Table2 className="size-8 text-faint" />
          <p className="text-sm text-faint">Aucune ligne à exporter pour ce filtre.</p>
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="legend border-b border-rule bg-card-2 px-2 py-2.5">#</th>
                {data!.headers.map((header) => (
                  <th
                    key={header}
                    className="border-b border-rule bg-card-2 px-3 py-2.5 font-mono text-[10px] font-semibold tracking-wider whitespace-nowrap uppercase"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data!.rows.map((row, index) => (
                <tr key={index} className="transition-colors even:bg-card-2/60 hover:bg-lime-soft">
                  <td className="tnum border-b border-rule px-2 py-2 text-right text-faint">{index + 1}</td>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="max-w-[280px] truncate border-b border-rule px-3 py-2 text-muted"
                      title={cell}
                    >
                      {cell.startsWith('http') ? (
                        <a href={cell} target="_blank" rel="noreferrer" className="text-lime-deep hover:underline">

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
