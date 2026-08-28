import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { CallMode } from '../components/CallMode';
import { Button, EmptyState, LeadSkeleton } from '../components/ui';
import { useLeadCollection, useMeta } from '../hooks';
import { sortLeads } from '../lib/lead';
import { sessionPath } from '../workspace';

/**
 * File d’appels dédiée : favoris d’abord, puis les fiches encore à trier.
 */
export function CallsPage() {
  const navigate = useNavigate();
  const { workspaceId } = useParams();
  const { refreshMeta } = useMeta();
  const starred = useLeadCollection({ status: 'favori' }, refreshMeta);
  const inbox = useLeadCollection({ status: 'nouveau' }, refreshMeta);

  const queue = useMemo(
    () => [...sortLeads(starred.leads, 'potentiel'), ...sortLeads(inbox.leads, 'potentiel')],
    [starred.leads, inbox.leads],
  );

  const loading = starred.loading || inbox.loading;
  const persist = starred.leads.length ? starred : inbox;
  const leave = () => navigate(sessionPath(workspaceId ?? '', '/favoris'));

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <LeadSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!queue.length) {
    return (
      <EmptyState
        title="Personne à appeler"
        description="Mettez des entreprises en favori, ou lancez un relevé : elles arriveront ici, une fiche à la fois."
        action={
          <Button icon={<Search className="size-4" />} onClick={() => navigate(sessionPath(workspaceId ?? ''))}>
            Lancer un relevé
          </Button>
        }
      />
    );
  }

  return (
    <CallMode
      leads={queue}
      onStatus={persist.setStatus}
      onNotes={persist.setNotes}
      onClose={leave}
    />
  );
}
