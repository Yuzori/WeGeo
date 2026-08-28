import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { WorkspaceInvite } from '../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';
import { sessionPath } from '../workspace';
import { Button, useToast } from './ui';

const POLL_MS = 8000;

export function InviteInbox() {
  const { user } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const seen = useRef<Set<number> | null>(null);
  const onHub = location.pathname === '/app';

  const pull = useCallback(async () => {
    if (!user) {
      setInvites([]);
      seen.current = null;
      return;
    }
    try {
      const data = await api.workspaceInvites();
      const next = data.invites;
      if (seen.current) {
        for (const invite of next) {
          if (!seen.current.has(invite.id)) {
            const who = invite.fromUsername || invite.fromEmail;
            notify(`${who} vous invite dans « ${invite.workspaceName} »`, 'info');
            window.dispatchEvent(new Event('prospy:invites-changed'));
          }
        }
      }
      seen.current = new Set(next.map((invite) => invite.id));
      setInvites(next);
    } catch {
      /* session expirée ou réseau : on réessaiera */
    }
  }, [user, notify]);

  useEffect(() => {
    void pull();
    const timer = window.setInterval(() => void pull(), POLL_MS);
    const onFocus = () => void pull();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [pull]);

  if (!user || onHub || invites.length === 0) return null;

  return (
    <div className="pointer-events-none fixed top-[max(1rem,env(safe-area-inset-top))] right-3 z-[55] flex w-[min(100%-1.5rem,22rem)] flex-col gap-2 lg:right-4">
      {invites.map((invite) => (
        <article
          key={invite.id}
          className="pointer-events-auto sheet flex flex-col gap-2 px-3 py-2.5 shadow-[var(--shadow-float)]"
        >
          <p className="text-sm font-semibold leading-snug">{invite.workspaceName}</p>
          <p className="text-[11px] text-muted">
            {invite.fromUsername || invite.fromEmail} vous invite dans cette session.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void api.declineInvite(invite.id).then(() => {
                  seen.current?.delete(invite.id);
                  setInvites((list) => list.filter((item) => item.id !== invite.id));
                  window.dispatchEvent(new Event('prospy:invites-changed'));
                });
              }}
            >
              Refuser
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                void api.acceptInvite(invite.id).then(({ workspace }) => {
                  seen.current?.delete(invite.id);
                  setInvites((list) => list.filter((item) => item.id !== invite.id));
                  window.dispatchEvent(new Event('prospy:invites-changed'));
                  navigate(sessionPath(workspace.id));
                });
              }}
            >
              Rejoindre
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}
