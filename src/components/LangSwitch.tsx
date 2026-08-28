import { Globe } from 'lucide-react';
import { useI18n } from '../i18n';
import { cx } from './ui';

export function LangSwitch({ compact, className }: { compact?: boolean; className?: string }) {
  const { locale, setLocale, m } = useI18n();
  return (
    <button
      type="button"
      className={cx('lp-lang', compact && 'lp-lang-compact', className)}
      aria-label={m.nav.lang}
      title={locale === 'fr' ? 'English' : 'Français'}
      onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
    >
      <Globe className="size-3.5" />
      <span className="lp-lang-flip">
        <span className={cx('lp-lang-flip-item', locale === 'fr' && 'is-on')}>FR</span>
        <span className={cx('lp-lang-flip-item', locale === 'en' && 'is-on')}>EN</span>
      </span>
    </button>
  );
}
