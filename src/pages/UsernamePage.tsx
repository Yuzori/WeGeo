import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { BrandMark } from '../components/BrandMark';
import { Button } from '../components/ui';
import { markAppEnter } from '../lib/nav';

export function UsernamePage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return <Navigate to="/connexion" replace />;
  if (!user.needsUsername) return <Navigate to="/app" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.claimUsername(username);
      setUser(result.user);
      markAppEnter();
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer ce pseudo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-3 py-10 sm:px-4 sm:py-12">
        <BrandMark alt="Prospy" className="mb-8 h-10 w-10 self-start" />
        <p className="legend mb-2">dernier détail</p>
        <h1 className="text-2xl font-semibold tracking-tight">Choisissez votre pseudo</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Google n’a pas fourni un nom utilisable, ou il était déjà pris. Ce pseudo vous identifie dans les sessions
          partagées.
        </p>
        <form onSubmit={(event) => void submit(event)} className="sheet mt-8 space-y-3 p-5">
          <label className="block">
            <span className="legend mb-1.5 block">pseudo</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              minLength={3}
              maxLength={24}
              required
              autoComplete="username"
              className="field h-11"
              placeholder="achraf"
            />
          </label>
          {error && <p className="text-sm text-score-low">{error}</p>}
          <Button type="submit" variant="primary" loading={busy} className="w-full">
            Continuer
          </Button>
        </form>
      </div>
    </div>
  );
}
