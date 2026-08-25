import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { Check, Info, Loader2, Moon, Sun, TriangleAlert, X } from 'lucide-react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ boutons */

type Variant = 'primary' | 'outline' | 'ghost' | 'soft' | 'onInk';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-lime text-on-lime border border-lime-line font-semibold hover:brightness-105 hover:-translate-y-px active:translate-y-0',
  outline: 'bg-card text-ink border border-rule-strong hover:border-ink-faint hover:bg-card-2',
  soft: 'bg-lime-soft text-lime-deep border border-lime-line hover:brightness-105',
  ghost: 'text-muted hover:bg-card-2 hover:text-ink border border-transparent',
  onInk: 'bg-white/10 text-white border border-white/15 hover:bg-white/20',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5 rounded-full',
  md: 'h-10 px-4 text-sm gap-2 rounded-full',
  lg: 'h-12 px-6 text-[15px] gap-2 rounded-full',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'outline',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center whitespace-nowrap font-medium',
        'transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/**
 * Chaque action a sa couleur de survol et son mouvement : la corbeille rougit
 * et tremble, l'étoile dore et tourne, l'export s'envole. Le geste renseigne
 * autant que l'icône.
 */
type Tone = 'neutral' | 'lime' | 'danger' | 'gold' | 'green';
type Motion = 'pop' | 'tilt' | 'spin' | 'shake' | 'fly' | 'ring';

const TONES: Record<Tone, { on: string; off: string }> = {
  neutral: {
    on: 'bg-ink text-paper border-ink',
    off: 'text-faint hover:bg-card-2 hover:text-ink border-transparent',
  },
  lime: {
    on: 'bg-lime text-on-lime border-lime-line',
    off: 'text-faint hover:bg-lime-soft hover:text-lime-deep border-transparent',
  },
  danger: {
    on: 'bg-score-low text-white border-score-low',
    off: 'text-faint hover:bg-score-low/12 hover:text-score-low border-transparent hover:border-score-low/30',
  },
  gold: {
    on: 'bg-score-good text-white border-score-good',
    off: 'text-faint hover:bg-score-good/12 hover:text-score-good border-transparent hover:border-score-good/30',
  },
  green: {
    on: 'bg-score-high text-white border-score-high',
    off: 'text-faint hover:bg-score-high/12 hover:text-score-high border-transparent hover:border-score-high/30',
  },
};

const MOTIONS: Record<Motion, string> = {
  pop: '',
  tilt: '',
  spin: '',
  shake: '',
  fly: '',
  ring: '',
};

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  tone?: Tone;
  motion?: Motion;
}

export function IconButton({
  label,
  active,
  tone = 'neutral',
  motion = 'pop',
  className,
  ...rest
}: IconButtonProps) {
  const t = TONES[tone];
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cx(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-md border',
        'transition-colors duration-150',
        MOTIONS[motion],
        active ? t.on : t.off,
        className,
      )}
    />
  );
}

/* ------------------------------------------------------------------ badges */

export function Tag({
  children,
  tone = 'plain',
  className,
}: {
  children: ReactNode;
  tone?: 'plain' | 'lime' | 'outline' | 'ink' | 'ember';
  className?: string;
}) {
  const tones = {
    plain: 'bg-card-2 text-muted border-transparent',
    lime: 'bg-lime-soft text-lime-deep border-lime-line',
    outline: 'border-rule-strong text-muted',
    ink: 'bg-ink text-paper border-ink',
    ember: 'bg-ember-soft text-ember border-transparent',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded border px-1.5 py-px',
        'font-mono text-[10px] font-medium tracking-wide uppercase',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- switches */

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="group flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-card-2/70">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors duration-200',
          checked ? 'border-lime-line bg-lime' : 'border-rule-strong bg-card-3',
        )}
      >
        <span
          className={cx(
            'absolute top-[3px] size-3 rounded-full transition-all duration-200',
            checked ? 'left-[19px] bg-on-lime' : 'left-[3px] bg-faint',
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-snug text-faint">{hint}</span>}
      </span>
    </label>
  );
}

/* -------------------------------------------------------------------- thème */

const THEME_KEY = 'wegeo.theme';

export function applyStoredTheme(): void {
  const stored = localStorage.getItem(THEME_KEY);
  const dark = stored ? stored === 'nuit' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', dark);
}

export function ThemeToggle({ compact, className }: { compact?: boolean; className?: string }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const sync = () => setDark(document.documentElement.classList.contains('dark'));
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('storage', sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('storage', sync);
    };
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem(THEME_KEY, next ? 'nuit' : 'jour');
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        title={dark ? 'Passer en mode jour' : 'Passer en mode nuit'}
        aria-label={dark ? 'Passer en mode jour' : 'Passer en mode nuit'}
        className={cx(
          'inline-flex size-[1.85rem] items-center justify-center rounded-full border border-[var(--lp-line)] bg-[color-mix(in_oklab,var(--lp-surface)_70%,transparent)] text-ink',
          className,
        )}
      >
        {dark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? 'Passer en mode jour' : 'Passer en mode nuit'}
      aria-label={dark ? 'Passer en mode jour' : 'Passer en mode nuit'}
      className={cx(
        'group relative inline-flex h-7 items-center gap-1 rounded-md border border-rule px-1 font-mono text-[10px] tracking-widest uppercase',
        className,
      )}
    >
      <span
        className={cx(
          'inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors',
          dark ? 'text-faint' : 'bg-lime text-on-lime',
        )}
      >
        <Sun className="size-3" /> jour
      </span>
      <span
        className={cx(
          'inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors',
          dark ? 'bg-lime text-on-lime' : 'text-faint',
        )}
      >
        <Moon className="size-3" /> nuit
      </span>
    </button>
  );
}

/* ------------------------------------------------------- chiffre qui défile */

/** Compteur qui roule jusqu'à sa valeur, pour rendre la progression sensible. */
export function Counter({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    if (start === value) return;

    const t0 = performance.now();
    const duration = Math.min(700, 180 + Math.abs(value - start) * 45);
    let raf = 0;

    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(start + (value - start) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={cx('tnum', className)}>{shown}</span>;
}

/* ------------------------------------------------------------------- divers */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-4 animate-spin', className)} aria-hidden />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('shimmer rounded', className)} />;
}

export function LeadSkeleton() {
  return (
    <div className="sheet flex items-center gap-4 px-4 py-4">
      <Skeleton className="size-10 rounded" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-52" />
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-3 w-72" />
      </div>
    </div>
  );
}

/** Boussole dessinée, utilisée dans les écrans vides. */
export function Compass({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden fill="none">
      <circle cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <circle cx="48" cy="48" r="32" stroke="currentColor" strokeWidth="1" strokeDasharray="2 5" opacity="0.5" />
      <path d="M48 12v8M48 76v8M12 48h8M76 48h8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M48 22 58 58 48 50 38 58Z" fill="currentColor" />
    </svg>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rise-in flex flex-col items-center justify-center px-6 py-20 text-center">
      <Compass className="mb-6 size-20 text-lime-deep" />
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-[hsl(var(--shade)/0.5)] backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'pop-in relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl border border-rule',
          'bg-card shadow-[var(--shadow-float)] sm:rounded-lg',
          wide ? 'max-w-6xl' : 'max-w-xl',
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold">{title}</h2>
            {subtitle && <p className="legend mt-1">{subtitle}</p>}
          </div>
          <IconButton label="Fermer" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        {footer && <footer className="border-t border-rule bg-card-2 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ notifications */

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'info';
}

const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4000);
  }, []);

  const icons = {
    success: <Check className="size-3.5" />,
    error: <TriangleAlert className="size-3.5" />,
    info: <Info className="size-3.5" />,
  };

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[70] flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pop-in pointer-events-auto flex items-center gap-2.5 rounded-md border border-rule bg-card py-2 pr-4 pl-2 shadow-[var(--shadow-float)]"
          >
            <span
              className={cx(
                'flex size-6 items-center justify-center rounded',
                toast.tone === 'error' ? 'bg-ember text-white' : 'bg-lime text-on-lime',
              )}
            >
              {icons[toast.tone]}
            </span>
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
