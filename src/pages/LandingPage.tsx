import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Globe,
  Lock,
  Map,
  MapPin,
  Menu,
  Phone,
  Radar,
  Shield,
  Star,
  Table2,
  UserRound,
  X,
} from 'lucide-react';
import type { BillingPlan, Lead } from '../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';
import { GeoMap } from '../components/GeoMap';
import { LangSwitch } from '../components/LangSwitch';
import { LogoFlight } from '../components/LogoFlight';
import { SettingsLink } from '../components/SettingsLink';
import { UserAvatar } from '../components/UserAvatar';
import { ThemeToggle, cx } from '../components/ui';
import { useI18n, type Locale } from '../i18n';
import { TIER_COLORS, hueOf, initials, potential } from '../lib/lead';
import { relocateLeads, useVisitorPlace } from '../lib/place';

const FALLBACK_PLANS: BillingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Pour lancer les premières tournées.',
    amountLabel: '19 €',
    interval: 'month',
    cta: 'Choisir Starter',
    priceConfigured: false,
    features: [
      'Relevé Google Maps des commerces sans site',
      'Pipeline d’appels : trier, appeler, classer',
      'Export CSV / Excel',
      '1 compte, 1 session personnelle',
      '2 métiers et 50 entreprises par relevé',
    ],
    locked: [
      'Nom du dirigeant',
      'Invitations d’équipe',
      'Quadrillage des grandes villes',
      'Tous les réglages de recherche',
      'Carte, score et session d’appels clavier',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Pour appeler et conclure au quotidien.',
    amountLabel: '49 €',
    interval: 'month',
    highlighted: true,
    cta: 'Choisir Pro',
    priceConfigured: false,
    features: [
      'Tout Starter',
      'Nom du dirigeant (SIRENE) et lien source',
      '8 métiers et 250 entreprises par relevé',
      'Quadrillage 2 × 2',
      'Inviter 2 personnes',
      'Carte, score, session d’appels, Google Sheets',
      'Réglages de recherche étendus',
    ],
    locked: [
      'Quadrillage large (jusqu’à 5 × 5)',
      'Volume de relevé illimité',
      'Plus de 3 personnes par session',
    ],
  },
  {
    id: 'agence',
    name: 'Agence',
    tagline: 'Pour enchaîner les villes et les métiers.',
    amountLabel: '89 €',
    interval: 'month',
    cta: 'Choisir Agence',
    priceConfigured: false,
    features: [
      'Tout Pro',
      '15 métiers et 1 000 entreprises par relevé',
      'Tous les réglages, quadrillage jusqu’à 5 × 5',
      'Jusqu’à 10 personnes par session',
      'Historique complet et actions groupées',
    ],
  },
];

const SWEEP_PERIOD = 10;

const HERO_PINGS = [
  { a: 22, r: 0.28 },
  { a: 48, r: 0.52 },
  { a: 76, r: 0.36 },
  { a: 108, r: 0.61 },
  { a: 142, r: 0.33 },
  { a: 174, r: 0.48 },
  { a: 208, r: 0.27 },
  { a: 244, r: 0.58 },
  { a: 278, r: 0.4 },
  { a: 312, r: 0.24 },
  { a: 338, r: 0.55 },
];

const CTA_PINGS = [
  { a: 32, r: 0.34 },
  { a: 88, r: 0.5 },
  { a: 148, r: 0.3 },
  { a: 206, r: 0.46 },
  { a: 268, r: 0.28 },
  { a: 328, r: 0.52 },
];

const RADAR_RINGS = [
  { r: 12, o: 0.5 },
  { r: 24, o: 0.42 },
  { r: 36, o: 0.34 },
  { r: 48, o: 0.26 },
  { r: 60, o: 0.19 },
  { r: 72, o: 0.13 },
  { r: 84, o: 0.08 },
  { r: 96, o: 0.04 },
];

function PhotoSlot({ name, className = 'lp-feature-photo' }: { name: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setSrc(`/landing/${name}.jpg`);
        io.disconnect();
      },
      { rootMargin: '140px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [name]);

  return (
    <div ref={host} className={cx(className, !ready && 'is-empty')} aria-hidden>
      {src ? (
        <img
          src={src}
          alt=""
          width={1200}
          height={800}
          loading="lazy"
          decoding="async"
          onLoad={() => setReady(true)}
          onError={() => {
            setSrc(null);
            setReady(false);
          }}
        />
      ) : null}
      {ready ? null : (
        <span className="lp-photo-wait">
          <span className="lp-photo-x" />
          <span className="lp-photo-file">{name}.jpg</span>
        </span>
      )}
    </div>
  );
}

function useReveal(locale: Locale) {
  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>('.lp-reveal:not(.is-in)');
    if (!nodes.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.14, rootMargin: '0px 0px -6% 0px' },
    );
    nodes.forEach((node) => io.observe(node));
    return () => io.disconnect();
  }, [locale]);
}

function RadarField({ variant = 'hero' }: { variant?: 'hero' | 'cta' }) {
  const pings = variant === 'cta' ? CTA_PINGS : HERO_PINGS;
  return (
    <div className={cx('lp-radar', variant === 'cta' && 'lp-radar-cta')} aria-hidden>
      <div className="lp-radar-plane">
        <svg className="lp-radar-svg" viewBox="0 0 200 200">
          <line x1="100" y1="2" x2="100" y2="198" opacity="0.28" />
          <line x1="2" y1="100" x2="198" y2="100" opacity="0.28" />
          {RADAR_RINGS.map((ring) => (
            <circle key={ring.r} cx="100" cy="100" r={ring.r} opacity={ring.o} />
          ))}
        </svg>
        <div className="lp-radar-sweep" />
        {pings.map((ping) => (
          <span
            key={`${ping.a}-${ping.r}`}
            className="lp-ping"
            style={{
              ['--a' as string]: `${ping.a}deg`,
              ['--r' as string]: ping.r,
              ['--lp-delay' as string]: `${(ping.a / 360) * SWEEP_PERIOD}s`,
            }}
          >
            <span className="lp-ping-dot" />
          </span>
        ))}
      </div>
    </div>
  );
}

function WindowFrame({
  label,
  children,
  className,
  mascot = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  mascot?: boolean | 'hero' | 'product';
}) {
  return (
    <div
      className={cx('lp-frame', className)}
      {...(mascot ? { 'data-mascot': mascot === true ? 'window' : mascot } : {})}
    >
      <p className="legend px-4 pt-3.5">{label}</p>
      {children}
    </div>
  );
}

function GlyphLine({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\s+)/);
  return (
    <span className={cx('lp-split', className)}>
      {parts.map((part, i) =>
        /^\s+$/.test(part) ? (
          <span key={i}>{' '}</span>
        ) : (
          <span key={i} className="lp-split-word">
            {[...part].map((ch, j) => (
              <span key={j} className="lp-glyph" style={{ '--d': `${Math.min(i, 8) * 0.03 + j * 0.016}s` } as CSSProperties}>
                {ch}
              </span>
            ))}
          </span>
        ),
      )}
    </span>
  );
}

function demoLead(
  id: number,
  name: string,
  category: string,
  city: string,
  domain: string,
  phone: string,
  lat: number,
  lng: number,
  rating: number,
  reviewCount: number,
  dirigeant?: string,
): Lead {
  return {
    id,
    placeKey: `demo-${id}`,
    name,
    category,
    address: `${city}`,
    phone,
    website: null,
    websiteKind: 'aucun',
    rating,
    reviewCount,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    lat,
    lng,
    city,
    domain,
    status: 'nouveau',
    dirigeant: dirigeant ?? null,
    dirigeantSource: dirigeant
      ? `https://annuaire-entreprises.data.gouv.fr/rechercher?terme=${encodeURIComponent(name)}`
      : null,
    dirigeantStatus: dirigeant ? 'found' : null,
    notes: null,
    createdAt: '',
    updatedAt: '',
    seenCount: 1,
  };
}

const DEMO_MAP_LEADS: Lead[] = [
  demoLead(1, 'Atelier Moreau', 'Menuisier', 'Lyon 3e', 'menuisier', '04 78 12 40 18', 45.7518, 4.8426, 4.7, 186, 'Claire Moreau'),
  demoLead(2, 'Chez Paulette', 'Fleuriste', 'Villeurbanne', 'fleuriste', '04 72 04 91 33', 45.7662, 4.8798, 4.5, 92, 'Paulette Marin'),
  demoLead(3, 'Garage du Parc', 'Automobile', 'Lyon 6e', 'garage', '04 78 89 21 07', 45.7694, 4.8504, 4.3, 54, 'Henri Favier'),
  demoLead(4, 'Boulangerie Lamy', 'Boulangerie', 'Lyon 7e', 'boulangerie', '04 78 61 02 44', 45.7489, 4.8411, 4.6, 74, 'Antoine Lamy'),
  demoLead(5, 'Toiture Martin', 'Couvreur', 'Caluire', 'couvreur', '04 72 98 15 60', 45.7856, 4.8472, 4.8, 41, 'Luc Martin'),
  demoLead(6, 'Salon Rive Gauche', 'Coiffeur', 'Lyon 2e', 'coiffeur', '04 78 42 11 09', 45.7576, 4.8317, 4.4, 128, 'Nadia Besse'),
  demoLead(7, 'Plomberie Roux', 'Plombier', 'Lyon 8e', 'plombier', '04 78 74 33 20', 45.7348, 4.8691, 4.2, 38, 'Michel Roux'),
  demoLead(8, 'Garage Guillotière', 'Automobile', 'Lyon 7e', 'garage', '04 78 72 18 44', 45.7534, 4.8429, 4.1, 29, 'Karim Haddad'),
  demoLead(9, 'Coiffure Bellecour', 'Coiffeur', 'Lyon 2e', 'coiffeur', '04 78 37 55 12', 45.7571, 4.8322, 4.6, 210, 'Sophie Rey'),
  demoLead(10, 'Fleurs des pentes', 'Fleuriste', 'Lyon 1er', 'fleuriste', '04 78 28 90 17', 45.7698, 4.8274, 4.5, 67, 'Élise Garnier'),
];

function MockMark({ name }: { name: string }) {
  const hue = hueOf(name);
  return (
    <span
      className="lp-mark"
      style={{
        background: `linear-gradient(150deg, oklch(0.88 0.09 ${hue}), oklch(0.79 0.11 ${hue + 24}))`,
        borderColor: `oklch(0.66 0.11 ${hue})`,
        color: `oklch(0.28 0.07 ${hue})`,
      }}
      aria-hidden
    >
      {initials(name)}
      <span
        className="lp-mark-pin"
        style={{
          background: `oklch(0.79 0.11 ${hue + 24})`,
          borderColor: `oklch(0.66 0.11 ${hue})`,
        }}
      />
    </span>
  );
}

function MockDeal({ lead, starred }: { lead: Lead; starred?: boolean }) {
  const { score, tier } = potential(lead);
  const filled = { excellent: 4, bon: 3, moyen: 2, faible: 1 }[tier];
  const color = TIER_COLORS[tier];
  return (
    <article className="lp-deal">
      <MockMark name={lead.name} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-[15px] leading-tight font-semibold">{lead.name}</p>
          {starred ? <Star className="size-3.5 fill-[var(--lp-lime)] text-[var(--lp-lime)]" /> : null}
          <span className="lp-deal-tag">
            <Globe className="size-3" />
            {lead.websiteKind === 'aucun' ? 'aucun site' : 'site'}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {lead.category} · {lead.city}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {lead.phone ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-[color:var(--lp-accent-text)]">
              <Phone className="size-3.5" />
              {lead.phone}
            </span>
          ) : null}
          {lead.dirigeant ? (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-ink">
              <UserRound className="size-3.5 shrink-0 text-ember" />
              <span className="truncate">{lead.dirigeant}</span>
            </span>
          ) : null}
        </div>
      </div>
      <span className="lp-gauge">
        <span className="flex items-end gap-[2px]" aria-hidden>
          {[3, 5.5, 8, 10.5].map((h, i) => (
            <span
              key={h}
              className={cx('w-[3px] rounded-full', i < filled ? color.bg : 'bg-rule-strong')}
              style={{ height: h }}
            />
          ))}
        </span>
        <span className={cx('tnum text-[11px] font-semibold', color.text)}>{score}</span>
      </span>
    </article>
  );
}

function MockSearch({ leads }: { leads: Lead[] }) {
  const rows = leads.slice(0, 3);
  return (
    <div className="lp-mock px-3 pb-3 pt-1">
      {rows.map((lead, index) => (
        <MockDeal key={lead.id} lead={lead} starred={index === 1} />
      ))}
    </div>
  );
}

function ProductMap({ leads, center }: { leads: Lead[]; center: { lat: number; lng: number } }) {
  const [shown, setShown] = useState<Lead[]>([]);

  useEffect(() => {
    let index = 0;
    let timer = 0;
    let cancelled = false;
    const later = (ms: number, fn: () => void) => {
      timer = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };
    const step = () => {
      index += 1;
      if (index > leads.length) {
        later(3200, () => {
          index = 0;
          setShown([]);
          later(700, step);
        });
        return;
      }
      setShown(leads.slice(0, index));
      later(520, step);
    };
    setShown([]);
    later(600, step);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [leads]);

  return (
    <div className="lp-product-map">
      <GeoMap leads={shown} mode="embed" center={center} className="h-full min-h-[280px]" />
    </div>
  );
}

function smoothScrollTo(hash: string) {
  const el = document.querySelector(hash);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 58;
  window.scrollTo({ top, behavior: 'smooth' });
}

export function LandingPage() {
  const { locale, m } = useI18n();
  const { user, loading } = useAuth();
  const place = useVisitorPlace();
  const demoLeads = useMemo(() => relocateLeads(DEMO_MAP_LEADS, place), [place]);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [configured, setConfigured] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoAway, setLogoAway] = useState(false);
  const logoRef = useRef<HTMLAnchorElement>(null);
  useReveal(locale);

  const onNavClick = (e: ReactMouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith('#')) return;
    e.preventDefault();
    setMenuOpen(false);
    smoothScrollTo(href);
    history.pushState(null, '', href);
  };

  const onLogoProgress = useCallback((_: number, gone: boolean) => {
    setLogoAway((prev) => {
      if (window.scrollY < 80) return false;
      return prev === gone ? prev : gone;
    });
  }, []);

  useEffect(() => {
    const close = () => setMenuOpen(false);
    window.addEventListener('resize', close);
    window.addEventListener('hashchange', close);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('hashchange', close);
    };
  }, []);

  useEffect(() => {
    document.title = m.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', m.hero.lead);
    document.querySelector('meta[property="og:locale"]')?.setAttribute('content', locale === 'en' ? 'en_US' : 'fr_FR');
  }, [locale, m]);

  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains('is-boot')) return;
    window.setTimeout(() => root.classList.remove('is-boot'), 2200);
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    api
      .billingConfig()
      .then((config) => {
        if (ac.signal.aborted) return;
        setPlans(config.plans);
        setConfigured(config.configured);
      })
      .catch(() => {});
    return () => ac.abort();
  }, []);

  const shownPlans = plans.length ? plans : FALLBACK_PLANS;
  const featureIcons = [Radar, Star, Phone, Map];
  const featurePhotos = ['maps', 'pipeline', 'calls', 'export'] as const;
  const navLinks = [
    { href: '#produit', label: m.nav.product },
    { href: '#fonctionnalites', label: m.nav.features },
    { href: '#confiance', label: m.nav.trust },
    { href: '#tarifs', label: m.nav.pricing },
  ];

  return (
    <div className="landing">
      <LogoFlight sourceRef={logoRef} onProgress={onLogoProgress} />
      <div className="lp-nav-veil" aria-hidden />
      <div className={cx('lp-nav-wrap', menuOpen && 'is-open')}>
        <header className={cx('lp-nav', logoAway && 'is-logo-away')}>
          <a
            href="#top"
            className="lp-nav-logo is-3d-wait shrink-0"
            ref={logoRef}
            onClick={(e) => {
              setMenuOpen(false);
              if (window.scrollY < 80) {
                e.preventDefault();
              }
            }}
            aria-label="Prospy"
          />
          <div className="lp-nav-tools">
            <span className="lp-nav-lang">
              <LangSwitch compact />
            </span>
            <ThemeToggle compact />
          </div>
          <nav className="lp-nav-links" aria-label="Sections">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} onClick={(e) => onNavClick(e, link.href)}>
                {link.label}
              </a>
            ))}
          </nav>
          <div className="lp-nav-actions">
            {user ? (
              <>
                <SettingsLink
                  className="lp-nav-profile"
                  title={m.nav.account}
                >
                  <UserAvatar username={user.username || user.email} avatarUrl={user.avatarUrl} size={22} />
                  <span className="lp-nav-profile-name">{user.username || user.email}</span>
                </SettingsLink>
                <Link to="/app" className="lp-btn lp-btn-primary lp-nav-cta lp-nav-twin uppercase">
                  <span className="lp-nav-cta-text">{m.nav.app}</span>
                  <ArrowRight className="lp-nav-cta-icon size-3.5 shrink-0" />
                </Link>
              </>
            ) : loading ? null : (
              <>
                <Link to="/connexion" className="lp-btn lp-btn-ghost lp-nav-login lp-nav-twin uppercase">
                  {m.nav.login}
                </Link>
                <Link to="/inscription" className="lp-btn lp-btn-primary lp-nav-cta lp-nav-twin uppercase">
                  <span className="lp-nav-cta-text">{m.nav.start}</span>
                  <ArrowRight className="lp-nav-cta-icon size-3.5 shrink-0" />
                </Link>
              </>
            )}
            <button
              type="button"
              className="lp-nav-burger"
              aria-expanded={menuOpen}
              aria-controls="lp-nav-panel"
              aria-label={menuOpen ? m.nav.close : m.nav.menu}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </header>
        <div
          id="lp-nav-panel"
          className="lp-nav-panel"
          aria-hidden={!menuOpen}
          inert={!menuOpen || undefined}
        >
          <div className="lp-nav-panel-inner">
            <nav className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="lp-nav-panel-link"
                  onClick={(e) => onNavClick(e, link.href)}
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="lp-nav-panel-row">
              <LangSwitch />
              <ThemeToggle compact />
              {user ? (
                <>
                  <SettingsLink className="lp-nav-profile is-panel" title={m.nav.account} onClick={() => setMenuOpen(false)}>
                    <UserAvatar username={user.username || user.email} avatarUrl={user.avatarUrl} size={22} />
                    <span className="lp-nav-profile-name">{user.username || user.email}</span>
                  </SettingsLink>
                  <Link to="/app" className="lp-btn lp-btn-primary uppercase" onClick={() => setMenuOpen(false)}>
                    {m.nav.app}
                  </Link>
                </>
              ) : loading ? null : (
                <Link to="/connexion" className="lp-btn lp-btn-ghost uppercase" onClick={() => setMenuOpen(false)}>
                  {m.nav.login}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <main id="top">
        <section className="lp-glow">
          <div className="lp-hero-stage">
            <RadarField />
            <div className="lp-hero-copy">
              <p className="lp-chip">{m.hero.chip}</p>
              <h1 className="lp-hero-title mt-5 sm:mt-6">
                <GlyphLine text={m.hero.h1a} />
                <br />
                <GlyphLine text={m.hero.h1b} className="text-[color:var(--lp-accent-text)]" />
              </h1>
              <p className="lp-hero-lead lp-hero-lead-full">{m.hero.lead}</p>
              <p className="lp-hero-lead lp-hero-lead-short">{m.hero.leadShort}</p>
              <div className="lp-hero-ctas">
                <Link to={user ? '/app' : '/inscription'} className="lp-btn lp-btn-primary">
                  {user ? m.nav.app : m.hero.cta} <ArrowRight className="size-4" />
                </Link>
                <a href="#apercu" className="lp-btn lp-btn-ghost">
                  {m.hero.see}
                </a>
              </div>
            </div>
            <div id="apercu" className="lp-hero-mocks">
              <div className="lp-reveal is-in" style={{ '--d': '0.05s' } as CSSProperties}>
                <WindowFrame mascot="hero" label={m.mock.noSite}>
                  <MockSearch leads={demoLeads} />
                </WindowFrame>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-cv border-y border-[var(--lp-line)]">
          <div className="lp-steps lp-page">
            {m.steps.map((item, i) => (
              <div key={item.k} className="lp-reveal lp-interactive" style={{ '--d': `${i * 0.08}s` } as CSSProperties}>
                <p className="font-mono text-[11px] tracking-widest text-[color:var(--lp-accent-text)]">{item.k}</p>
                <h2 className="lp-h2 mt-2">
                  <GlyphLine text={item.t} />
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="produit" className="lp-cv relative">
          <PhotoSlot name="search" className="lp-section-photo" />
          <div className="lp-section-inner lp-page scroll-mt-24">
            <p className="lp-chip">{m.product.chip}</p>
            <h2 className="lp-h2 mt-4 max-w-2xl">
              <GlyphLine text={m.product.h2} />
            </h2>
            <p className="mt-4 max-w-xl text-muted">{m.product.lead}</p>

            <div className="lp-product-grid mt-12">
              <WindowFrame mascot="product" label={m.mock.noSite} className="min-h-[280px]">
                <MockSearch leads={demoLeads} />
              </WindowFrame>
              <WindowFrame label={m.mock.mapHint.replace('{city}', place.city)} className="lp-frame-map">
                <ProductMap leads={demoLeads} center={place} />
              </WindowFrame>
            </div>
          </div>
        </section>

        <section id="fonctionnalites" className="lp-cv border-y border-[var(--lp-line)] bg-[var(--lp-surface)]">
          <div className="lp-page scroll-mt-24">
            <p className="lp-chip">{m.features.chip}</p>
            <h2 className="lp-h2 mt-4">
              <GlyphLine text={m.features.h2} />
            </h2>
            <div className="lp-features-grid mt-10">
              {m.features.items.map((item, index) => {
                const Icon = featureIcons[index];
                return (
                  <article
                    key={item.title}
                    className="lp-feature lp-interactive lp-reveal rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg)] p-5 sm:p-7"
                    {...(index === 0 ? { 'data-mascot': 'feature' } : {})}
                  >
                    <PhotoSlot name={featurePhotos[index]} />
                    <span className="inline-flex size-11 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--lp-lime)_18%,transparent)] text-[color:var(--lp-accent-text)]">
                      <Icon className="size-5" />
                    </span>
                    <h3 className="mt-5 text-xl">
                      <GlyphLine text={item.title} />
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{item.text}</p>
                    <p className="mt-4 text-sm font-medium">
                      {m.features.why} <span className="font-normal text-muted">{item.why}</span>
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="lp-cv lp-page text-center" data-mascot="launch">
          <p className="lp-chip">{m.launch.chip}</p>
          <h2 className="lp-h2 mx-auto mt-4 max-w-2xl">
            <GlyphLine text={m.launch.h2} />
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted">{m.launch.lead}</p>
          <div className="lp-command mt-10 text-left">
            <MapPin className="size-4 shrink-0 text-[color:var(--lp-accent-text)]" />
            <p className="min-w-0 flex-1 font-mono text-[13px] tracking-tight">
              <span className="text-ink">{place.city}</span>
              <span className="text-faint"> · </span>
              <span className="text-muted">coiffeur, plombier, garage</span>
              <span className="text-faint"> · </span>
              <span className="text-[color:var(--lp-accent-text)]">{m.mock.noSiteTag}</span>
            </p>
            <Link to="/inscription" className="lp-btn lp-btn-primary h-10 px-4 text-sm">
              {m.launch.run}
            </Link>
          </div>
        </section>

        <section id="confiance" className="lp-cv border-t border-[var(--lp-line)] bg-[var(--lp-surface)]">
          <div className="lp-page scroll-mt-24">
            <p className="lp-chip">{m.trust.chip}</p>
            <h2 className="lp-h2 mt-4 max-w-2xl">
              <GlyphLine text={m.trust.h2} />
            </h2>
            <p className="mt-4 max-w-xl text-muted">{m.trust.lead}</p>
            <ul className="lp-features-grid mt-10">
              {m.trust.items.map((item, index) => {
                const Icon = [Lock, Shield, Table2, Check][index];
                return (
                    <li
                      key={item.title}
                      className="lp-reveal lp-interactive flex gap-4 rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg)] p-5"
                      {...(index === 0 ? { 'data-mascot': 'trust' } : {})}
                    >
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--lp-lime)_16%,transparent)] text-[color:var(--lp-accent-text)]">
                      <Icon className="size-4" />
                    </span>
                    <div>
                      <h3 className="text-lg">{item.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.text}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <aside className="lp-reveal mt-8 rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg)] p-5 sm:p-6">
              <h3 className="text-lg">{m.trust.googleTitle}</h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{m.trust.googleText}</p>
              <Link to="/confidentialite" className="mt-3 inline-block text-sm font-medium text-lime-deep">
                {m.trust.googlePrivacy}
              </Link>
            </aside>
          </div>
        </section>

        <section id="tarifs" className="lp-cv relative border-t border-[var(--lp-line)]">
          <PhotoSlot name="plans" className="lp-section-photo" />
          <div className="lp-section-inner lp-page scroll-mt-24">
            <p className="lp-chip">{m.pricing.chip}</p>
            <h2 className="lp-h2 mt-4">
              <GlyphLine text={m.pricing.h2} />
            </h2>
            <p className="mt-4 max-w-xl text-muted">{m.pricing.lead}</p>
            <div className="lp-plans mt-10">
              {shownPlans.map((plan) => (
                <article
                  key={plan.id}
                  className={cx(
                    'lp-reveal lp-interactive lp-plan flex flex-col rounded-2xl border p-7',
                    plan.highlighted
                      ? 'border-[color:var(--lp-lime)] bg-[color-mix(in_oklab,var(--lp-lime)_10%,var(--lp-surface))]'
                      : 'border-[var(--lp-line)] bg-[color-mix(in_oklab,var(--lp-surface)_88%,transparent)]',
                  )}
                  {...(plan.highlighted ? { 'data-mascot': 'plan' } : {})}
                >
                  <h3 className="text-2xl">{plan.name}</h3>
                  <p className="mt-1 text-sm text-muted">{plan.tagline}</p>
                  <p className="mt-6 font-[family-name:var(--font-display)] text-4xl tracking-tight">{plan.amountLabel}</p>
                  <p className="legend mt-1">{m.pricing.month}</p>
                  <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-[color:var(--lp-accent-text)]" />
                        <span>{feature}</span>
                      </li>
                    ))}
                    {(plan.locked ?? []).map((feature) => (
                      <li key={feature} className="flex gap-2 text-faint">
                        <X className="mt-0.5 size-4 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={configured && plan.priceConfigured ? `/abonnement?plan=${plan.id}` : '/inscription'}
                    className={cx('lp-btn mt-8 w-full', plan.highlighted ? 'lp-btn-primary' : 'lp-btn-ghost')}
                  >
                    {plan.cta}
                  </Link>
                </article>
              ))}
            </div>
            {!configured && <p className="mt-6 text-sm text-faint">{m.pricing.stripeOff}</p>}
          </div>
        </section>
      </main>

      <div className="lp-end">
          <RadarField variant="cta" />
          <section className="lp-cta-band relative border-t border-[var(--lp-line)] text-center" data-mascot="cta">
            <div className="lp-page relative">
              <h2 className="lp-h2 mx-auto max-w-3xl">
                <GlyphLine text={m.cta.h2} />
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-muted">{m.cta.lead}</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link to="/inscription" className="lp-btn lp-btn-primary">
                  {m.cta.create} <ArrowRight className="size-4" />
                </Link>
                <Link to="/connexion" className="lp-btn lp-btn-ghost">
                  {m.cta.open}
                </Link>
              </div>
            </div>
          </section>

          <footer className="border-t border-[var(--lp-line)] bg-[var(--lp-surface)]">
            <div className="mx-auto flex max-w-6xl flex-col gap-12 px-[clamp(1rem,4vw,1.5rem)] py-14 sm:flex-row sm:justify-between">
              <div>
                <a href="#top" className="lp-footer-logo" data-mascot="dock" aria-label="Prospy" />
                <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">{m.footer.blurb}</p>
              </div>
          <div className="grid grid-cols-2 gap-10 text-sm sm:grid-cols-4">
            <div>
              <p className="legend mb-3">{m.footer.product}</p>
              <ul className="space-y-2 text-muted">
                <li>
                  <a href="#fonctionnalites" className="hover:text-ink">
                    {m.nav.features}
                  </a>
                </li>
                <li>
                  <a href="#tarifs" className="hover:text-ink">
                    {m.nav.pricing}
                  </a>
                </li>
                <li>
                  <Link to="/app" className="hover:text-ink">
                    {m.cta.open}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="legend mb-3">{m.footer.account}</p>
              <ul className="space-y-2 text-muted">
                <li>
                  <Link to="/inscription" className="hover:text-ink">
                    {m.cta.create}
                  </Link>
                </li>
                <li>
                  <Link to="/connexion" className="hover:text-ink">
                    {m.nav.login}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="legend mb-3">{m.footer.legal}</p>
              <ul className="space-y-2 text-muted">
                <li>
                  <Link to="/cgu" className="hover:text-ink">
                    {m.footer.terms}
                  </Link>
                </li>
                <li>
                  <Link to="/confidentialite" className="hover:text-ink">
                    {m.footer.privacy}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="legend mb-3">{m.footer.look}</p>
              <ThemeToggle />
            </div>
          </div>
        </div>
        <div className="border-t border-[var(--lp-line)]">
          <p className="mx-auto max-w-6xl px-4 py-5 font-mono text-[11px] tracking-wide text-faint sm:px-6">{m.footer.copy}</p>
        </div>
      </footer>
      </div>
    </div>
  );
}
