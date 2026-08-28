import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FolderKanban, Mail, Plus, Users } from 'lucide-react';
import type { Workspace, WorkspaceInvite } from '../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';
import { LogoutButton } from '../components/LogoutButton';
import { BrandMark } from '../components/BrandMark';
import { SettingsLink } from '../components/SettingsLink';
import { UserAvatar } from '../components/UserAvatar';
import { Button } from '../components/ui';
import { sessionPath } from '../workspace';

export function SessionsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [google, setGoogle] = useState(true);
  const [mail, setMail] = useState(true);

  const refresh = () => {
    api
      .workspaces()
      .then((data) => {
        setWorkspaces(data.workspaces);
        setInvites(data.invites);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    document.title = 'Sessions — Prospy';
    refresh();
    api
      .authMethods()
      .then((methods) => {
        setGoogle(methods.google);
        setMail(methods.mail);
      })
      .catch(() => {});
    const onInvites = () => refresh();
    window.addEventListener('prospy:invites-changed', onInvites);
    return () => window.removeEventListener('prospy:invites-changed', onInvites);
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const { workspace } = await api.createWorkspace(name);
      setName('');
      navigate(sessionPath(workspace.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de créer la session.');
    } finally {
      setCreating(false);
    }
  };

  const accept = async (invite: WorkspaceInvite) => {
    try {
      const { workspace } = await api.acceptInvite(invite.id);
      navigate(sessionPath(workspace.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invitation refusée par le serveur.');
    }
  };

  return (
    <div className="app-shell min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-8">
        <header className="mb-10 flex items-start justify-between gap-4">
          <div>
            <Link to="/" className="mb-6 inline-flex">
              <BrandMark alt="Prospy" className="h-10 w-10" />
            </Link>
            <p className="legend mb-2">vos sessions</p>
            <h1 className="text-[1.45rem] leading-tight font-semibold tracking-tight text-balance sm:text-[2rem]">Où travaillez-vous aujourd’hui ?</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              Une session isole les recherches et les favoris. Seul, avec un associé, ou pour un client : vous changez
              d’espace sans mélanger les fiches.
            </p>
          </div>
          {user && (
            <div className="flex flex-col items-end gap-2">
              <SettingsLink
                className="flex max-w-[14rem] items-center gap-2 rounded-lg px-1 py-0.5 text-right hover:bg-card-2"
                title="Réglages du compte"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-semibold text-ink">{user.username || user.email}</span>
                  <span className="block truncate text-[10px] text-faint">{user.email}</span>
                </span>
                <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={32} />
              </SettingsLink>
              <LogoutButton />
            </div>
          )}
        </header>

        {invites.length > 0 && (
          <section className="mb-8 space-y-2">
            <h2 className="legend">invitations reçues</h2>
            {invites.map((invite) => (
              <article key={invite.id} className="sheet flex flex-wrap items-center gap-3 px-4 py-3">
                <Mail className="size-4 text-lime-deep" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{invite.workspaceName}</p>
                  <p className="legend">
                    {invite.fromUsername || invite.fromEmail} vous attend
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void api.declineInvite(invite.id).then(refresh)}>
                  Refuser
                </Button>
                <Button size="sm" variant="primary" onClick={() => void accept(invite)}>
                  Rejoindre
                </Button>
              </article>
            ))}
          </section>
        )}

        <form onSubmit={(event) => void create(event)} className="sheet mb-8 flex flex-wrap items-end gap-3 p-4">
          <label className="min-w-0 w-full flex-1 sm:min-w-[16rem] sm:w-auto">
            <span className="legend mb-1.5 block">nouvelle session</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Agence Lyon, Client Dupont…"
              minLength={2}
              required
              className="field h-11"
            />
          </label>
          <Button type="submit" variant="primary" icon={<Plus className="size-4" />} loading={creating}>
            Créer
          </Button>
        </form>

        {error && <p className="mb-4 text-sm text-score-low">{error}</p>}

        {loading ? (
          <p className="text-sm text-faint">Chargement des sessions…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {workspaces.map((workspace) => (
              <Link
                key={workspace.id}
                to={sessionPath(workspace.id)}
                className="sheet group flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:border-lime-line"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex size-9 items-center justify-center rounded-full border border-rule bg-card-2 text-lime-deep">
                    {workspace.personal ? <FolderKanban className="size-4" /> : <Users className="size-4" />}
                  </span>
                  <span className="legend">
                    {workspace.personal ? 'personnel' : `${workspace.memberCount} personne${workspace.memberCount > 1 ? 's' : ''}`}
                  </span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight group-hover:text-lime-deep">{workspace.name}</h2>
                  <p className="legend mt-1">
                    {workspace.leadCount} fiche{workspace.leadCount > 1 ? 's' : ''} · {workspace.searchCount} relevé
                    {workspace.searchCount > 1 ? 's' : ''}
                  </p>
                </div>
                {!workspace.personal && (
                  <button
                    type="button"
                    className="self-start text-[11px] font-medium text-muted hover:text-score-low"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const run =
                        workspace.role === 'owner'
                          ? api.deleteWorkspace(workspace.id)
                          : api.leaveWorkspace(workspace.id);
                      void run.then(refresh).catch((err: Error) => setError(err.message));
                    }}
                  >
                    {workspace.role === 'owner' ? 'Supprimer' : 'Quitter'}
                  </button>
                )}
              </Link>
            ))}
          </div>
        )}

        {(!google || !mail) && (
          <p className="mt-10 max-w-xl text-xs leading-relaxed text-faint">
            {!google && (
              <>
                Google n’est pas branché : ajoutez <code className="text-muted">GOOGLE_CLIENT_ID</code> et{' '}
                <code className="text-muted">GOOGLE_CLIENT_SECRET</code> dans <code className="text-muted">.env</code>,
                avec l’URI <code className="text-muted">http://localhost:5173/api/auth/google/callback</code>.{' '}
              </>
            )}
            {!mail && (
              <>
                Les e-mails de code et d’invitation demandent <code className="text-muted">RESEND_API_KEY</code> ou un
                SMTP. Sans ça, les invitations restent visibles ici, et les codes s’affichent dans le terminal API.
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
