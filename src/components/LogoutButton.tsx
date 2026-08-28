import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { Button, Modal, cx } from './ui';

export function LogoutButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const { m } = useI18n();

  const confirm = async () => {
    setBusy(true);
    await api.logout().catch(() => {});
    setUser(null);
    setBusy(false);
    setOpen(false);
    navigate('/', { replace: true });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx('text-[11px] font-medium text-muted hover:text-ink', className)}
      >
        {m.chrome.logout}
      </button>
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={m.chrome.logoutAsk}
        subtitle={m.chrome.logoutHint}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              {m.chrome.cancel}
            </Button>
            <Button type="button" variant="primary" loading={busy} onClick={() => void confirm()}>
              {m.chrome.logoutConfirm}
            </Button>
          </div>
        }
      >
        <p className="px-5 py-4 text-sm leading-relaxed text-muted">
          {m.chrome.logoutBody}
        </p>
      </Modal>
    </>
  );
}
