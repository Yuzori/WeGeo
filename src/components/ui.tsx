import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { Check, Info, Loader2, Moon, Sun, TriangleAlert, X } from 'lucide-react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ boutons */

type Variant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'onDark';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'brand-gradient text-white shadow-[var(--shadow-soft)] hover:shadow-[0_8px_24px_-6px_var(--glow-strong)] hover:brightness-108 active:scale-[0.98]',
  secondary: 'bg-surface text-text border border-line-strong hover:bg-surface-3 hover:border-line-strong',
  soft: 'bg-accent-soft text-accent-text border border-accent-line hover:brightness-105',
  ghost: 'text-muted hover:bg-surface-3 hover:text-text',
  onDark: 'bg-white/10 text-white border border-white/15 hover:bg-white/20',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2 rounded-xl',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
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
        'inline-flex items-center justify-center font-medium whitespace-nowrap',
        'transition-all duration-150 disabled:pointer-events-none disabled:opacity-45',
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

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  tone?: 'brand' | 'neutral' | 'armed';
}

const TONES: Record<NonNullable<IconButtonProps['tone']>, { on: string; off: string }> = {
  brand: {
    on: 'bg-accent text-accent-contrast border-transparent shadow-[var(--shadow-soft)]',
    off: 'text-subtle hover:text-accent-text hover:bg-accent-soft',
  },
  neutral: {
    on: 'bg-surface-inverse text-inverse border-transparent',
    off: 'text-subtle hover:text-text hover:bg-surface-3',
  },
  /** Action destructive en attente de confirmation. */
  armed: {
    on: 'bg-surface-inverse text-inverse border-transparent animate-pulse',
    off: 'text-subtle hover:text-text hover:bg-surface-3',
  },
};

export function IconButton({ label, active, tone = 'neutral', className, ...rest }: IconButtonProps) {
  const t = TONES[tone];
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cx(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-transparent',
        'transition-all duration-150 active:scale-95',
        active ? t.on : t.off,
        className,
      )}
    />
  );
}

/* ------------------------------------------------------------------ badges */

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brand' | 'outline' | 'solid';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-surface-3 text-muted',
    brand: 'bg-accent-soft text-accent-text',
    outline: 'border border-line-strong text-muted',
    solid: 'bg-accent text-accent-contrast',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-tight font-semibold',
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
    <label className="group flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-3/70">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-accent' : 'bg-line-strong',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-all duration-200',
            checked ? 'left-4.5' : 'left-0.5',
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-snug text-subtle">{hint}</span>}
      </span>
    </label>
  );
}

/* -------------------------------------------------------------------- thème */

const THEME_KEY = 'wegeo.theme';

export function applyStoredTheme(): void {
  const stored = localStorage.getItem(THEME_KEY);
  const dark = stored ? stored === 'sombre' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', dark);
}

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem(THEME_KEY, next ? 'sombre' : 'clair');
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? 'Passer en thème clair' : 'Passer en thème sombre'}
      aria-label={dark ? 'Passer en thème clair' : 'Passer en thème sombre'}
      className="relative inline-flex h-8 w-[3.75rem] items-center rounded-full border border-line bg-surface-3 px-1 transition-colors"
    >
      <span
        className={cx(
          'absolute size-6 rounded-full bg-surface shadow-[var(--shadow-soft)] transition-transform duration-300',
          dark ? 'translate-x-[1.75rem]' : 'translate-x-0',
        )}
      />
      <Sun className={cx('relative z-10 size-3.5 transition-colors', dark ? 'text-subtle' : 'text-accent-text')} />
      <Moon
        className={cx('relative z-10 ml-auto size-3.5 transition-colors', dark ? 'text-accent-text' : 'text-subtle')}
      />
    </button>
  );
}

/* ------------------------------------------------------------------- divers */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-4 animate-spin', className)} aria-hidden />;
}

/** Bloc gris animé affiché pendant un chargement. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('shimmer rounded-lg', className)} />;
}

export function LeadSkeleton() {
  return (
    <div className="card flex items-center gap-4 px-4 py-4">
      <Skeleton className="size-11 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-48" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-64" />
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="animate-in flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="relative mb-5">
        <span className="absolute inset-0 rounded-3xl bg-accent-soft blur-xl" aria-hidden />
        <span className="relative flex size-16 items-center justify-center rounded-3xl border border-accent-line bg-surface text-accent-text shadow-[var(--shadow-soft)]">
          {icon}
        </span>
      </div>
      <h3 className="text-lg font-semibold text-text">{title}</h3>
      {description && (
        <p className="text-balance mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p>
      )}
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
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-[hsl(var(--shadow-color)/0.45)] backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'animate-pop relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-line',
          'bg-surface shadow-[var(--shadow-float)] sm:rounded-3xl',
          wide ? 'max-w-6xl' : 'max-w-xl',
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-text">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          <IconButton label="Fermer" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </header>
        <div className="scroll-slim min-h-0 flex-1 overflow-auto">{children}</div>
        {footer && <footer className="border-t border-line bg-surface-2 px-5 py-3">{footer}</footer>}
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
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4200);
  }, []);

  const icons = useMemo(
    () => ({
      success: <Check className="size-3.5" />,
      error: <TriangleAlert className="size-3.5" />,
      info: <Info className="size-3.5" />,
    }),
    [],
  );

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="animate-pop pointer-events-auto flex items-center gap-2.5 rounded-full border border-line bg-surface py-2 pr-4 pl-2 shadow-[var(--shadow-float)]"
          >
            <span
              className={cx(
                'flex size-6 items-center justify-center rounded-full',
                toast.tone === 'error' ? 'bg-surface-inverse text-inverse' : 'bg-accent text-accent-contrast',
              )}
            >
              {icons[toast.tone]}
            </span>
            <span className="text-sm font-medium text-text">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
