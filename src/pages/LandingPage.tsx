import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookText,
  Check,
  CircleSlash,
  Facebook,
  Globe,
  Link2Off,
  Lock,
  Map,
  MapPin,
  Menu,
  Phone,
  Radar,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Table2,
  Target,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import type { BillingPlan, Lead } from '../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';
import { trackPricingView } from '../lib/analytics';
import { GeoMap } from '../components/GeoMap';
import { LangSwitch } from '../components/LangSwitch';
import { LogoFlight } from '../components/LogoFlight';
import { SettingsLink } from '../components/SettingsLink';
import { UserAvatar } from '../components/UserAvatar';
import { ThemeToggle, cx } from '../components/ui';
import { useI18n, type Locale } from '../i18n';
import { TIER_COLORS } from '../lib/lead';
import { relocateLeads, useVisitorPlace } from '../lib/place';

const FALLBACK_PLANS: BillingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Pour lancer les premières tournées.',
    amountLabel: '29 €',
    annualAmountLabel: '290 €',
    annualWasLabel: '348 €',
    annualBadge: '-17 % · 2 mois offerts',
    interval: 'month',
    cta: 'Choisir Starter',
    priceConfigured: false,
    features: [
      'Relevé Google Maps des commerces sans site',
      'Pipeline d’appels. Trier, appeler, classer',
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
    amountLabel: '59 €',
    annualAmountLabel: '590 €',
    annualWasLabel: '708 €',
    annualBadge: '-17 % · 2 mois offerts',
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
    tagline: 'Pour les équipes qui enchaînent villes et métiers.',
    amountLabel: '119 €',
    annualAmountLabel: '1 119 €',
    annualWasLabel: '1 428 €',
    annualBadge: '-17 % · 2 mois offerts',
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

const LANDING_PHOTOS_ENABLED = true;

function photoSets(name: string): Array<{ webp: string; img: string }> {
  const folders = ['', 'landing/'];
  const sets: Array<{ webp: string; img: string }> = [];
  for (const folder of folders) {
    for (const ext of ['jpg', 'jpeg', 'png'] as const) {
      sets.push({ webp: `/${folder}${name}.webp`, img: `/${folder}${name}.${ext}` });
    }
  }
  return sets;
}

function PhotoSlot({
  name,
  className = 'lp-feature-photo',
  delay = '0.12s',
}: {
  name: string;
  className?: string;
  delay?: string;
}) {
  const sets = useMemo(() => photoSets(name), [name]);
  const [setIndex, setSetIndex] = useState(0);
  const current = sets[setIndex] ?? null;
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSetIndex(0);
    setLoaded(false);
    setInView(false);
    setReady(false);
  }, [name]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setInView(true);
          io.unobserve(entry.target);
        }
      },
      { threshold: [0, 0.06, 0.12], rootMargin: '60px 0px 100px 0px' },
    );

    io.observe(node);
    return () => io.disconnect();
  }, [name]);

  useEffect(() => {
    if (!loaded || !inView || ready) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setReady(true));
    });
  }, [loaded, inView, ready]);

  useEffect(() => {
    const img = ref.current?.querySelector('img');
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, [current?.img, setIndex]);

  if (!LANDING_PHOTOS_ENABLED) return null;

  return (
    <div
      ref={ref}
      className={className}
      style={{ '--photo-d': delay } as CSSProperties}
      aria-hidden
    >
      {current ? (
        <picture>
          <source srcSet={current.webp} type="image/webp" />
          <img
            src={current.img}
            alt=""
            width={1200}
            height={800}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            className={ready ? 'is-ready' : undefined}
            onLoad={() => setLoaded(true)}
            onError={() => {
              setSetIndex((index) => {
                const next = index + 1;
                if (next < sets.length) {
                  setLoaded(false);
                  setReady(false);
                  return next;
                }
                return index;
              });
            }}
          />
        </picture>
      ) : null}
    </div>
  );
}

function useReveal(locale: Locale) {
  useEffect(() => {
    const pending = () =>
      document.querySelectorAll<HTMLElement>('.lp-reveal:not(.is-in), .lp-reveal-head:not(.is-in)');

    const reveal = (node: HTMLElement) => {
      if (node.classList.contains('is-in')) return;
      node.classList.add('is-in');
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      pending().forEach(reveal);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal(entry.target as HTMLElement);
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.06, rootMargin: '0px 0px -4% 0px' },
    );

    const vh = window.innerHeight;
    pending().forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.top < vh * 0.94 && rect.bottom > 0) reveal(node);
      else io.observe(node);
    });

    return () => io.disconnect();
  }, [locale]);
}

const TRAIT_ICONS = {
  zap: Zap,
  shield: ShieldCheck,
  target: Target,
  spark: Sparkles,
} as const;

function HeroTopoLines() {
  return (
    <svg className="lp-hero-topo" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <path d="M-20 310 C140 170, 310 260, 470 190 S740 70, 910 210 S1080 360, 1240 250" />
      <path d="M40 430 C180 320, 280 490, 430 410 S680 250, 830 430 S1020 560, 1200 420" />
      <path d="M-40 540 C90 470, 230 610, 390 530 S620 390, 790 560 S1010 680, 1220 540" />
    </svg>
  );
}

function HeroMapDecor() {
  return (
    <div className="lp-hero-map" aria-hidden>
      <svg viewBox="0 0 960 280" preserveAspectRatio="xMidYMax slice">
        <path className="lp-hero-map-road" d="M-20 250 C70 238, 110 190, 168 205 S250 248, 318 214 S410 168, 498 206 S590 252, 672 198 S780 132, 890 176 S940 214, 980 198" />
        <path className="lp-hero-map-road" d="M214 280 C208 232, 246 176, 198 138 S176 74, 228 28" />
        <path className="lp-hero-map-road" d="M586 280 C562 224, 618 178, 574 128 S612 64, 668 22" />
        <path className="lp-hero-map-road is-soft" d="M0 188 C90 172, 150 214, 236 178 S360 142, 448 186 S560 228, 650 164 S760 108, 960 148" />
      </svg>
    </div>
  );
}

function RadarField({ variant = 'hero' }: { variant?: 'hero' | 'cta' }) {
  const pings = variant === 'cta' ? CTA_PINGS : HERO_PINGS;
  return (
    <div className={cx('lp-radar', variant === 'cta' && 'lp-radar-cta')} aria-hidden>
      <div className="lp-radar-plane">
        <svg className="lp-radar-svg" viewBox="0 0 200 200">
          {RADAR_RINGS.map((ring) => (
            <circle key={ring.r} cx="100" cy="100" r={ring.r} opacity={ring.o} />
          ))}
        </svg>
        <div className="lp-radar-smoke" />
        <div className="lp-radar-glow" />
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

type SieveKind = 'site' | 'social' | 'directory' | 'parked' | 'none';

const SIEVE_ICONS: Record<SieveKind, typeof Globe> = {
  site: Globe,
  social: Facebook,
  directory: BookText,
  parked: CircleSlash,
  none: Link2Off,
};

const SIEVE_ROWS: { host?: string; kind: SieveKind; keep: boolean }[] = [
  { host: 'atelier-moreau.fr', kind: 'site', keep: false },
  { kind: 'none', keep: true },
  { host: 'facebook.com/chezpaulette', kind: 'social', keep: true },
  { host: 'garage-du-parc.com', kind: 'site', keep: false },
  { host: 'pagesjaunes.fr/toiture-martin', kind: 'directory', keep: true },
  { host: 'lamy-boulangerie.fr', kind: 'parked', keep: true },
];

const SIEVE_TOTAL = { opened: 128, dropped: 81 };

function WebSieve() {
  const { m } = useI18n();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStep((prev) => (prev > SIEVE_ROWS.length + 2 ? 0 : prev + 1));
    }, 880);
    return () => window.clearInterval(id);
  }, []);

  const visible = Math.min(step, SIEVE_ROWS.length);
  const ramp = visible / SIEVE_ROWS.length;
  const opened = Math.round(SIEVE_TOTAL.opened * ramp);
  const dropped = Math.round(SIEVE_TOTAL.dropped * ramp);
  const kept = opened - dropped;

  return (
    <div className="lp-sieve lp-reveal" data-mascot="product" style={{ '--d': '0.2s' } as CSSProperties}>
      <div className="lp-sieve-head">
        <p className="legend">{m.sieve.label}</p>
        <span className="lp-sieve-live" aria-hidden />
      </div>

      <div className="lp-sieve-meters">
        <span className="lp-sieve-meter">
          <span className="lp-sieve-num tnum">{opened}</span>
          <span className="lp-sieve-cap">{m.sieve.opened}</span>
        </span>
        <ArrowRight className="lp-sieve-arrow size-4" aria-hidden />
        <span className="lp-sieve-meter is-drop">
          <span className="lp-sieve-num tnum">{dropped}</span>
          <span className="lp-sieve-cap">{m.sieve.dropped}</span>
        </span>
        <ArrowRight className="lp-sieve-arrow size-4" aria-hidden />
        <span className="lp-sieve-meter is-keep">
          <span className="lp-sieve-num tnum">{kept}</span>
          <span className="lp-sieve-cap">{m.sieve.kept}</span>
        </span>
      </div>

      <div className="lp-sieve-bar" aria-hidden>
        <span className="lp-sieve-bar-drop" style={{ width: `${(dropped / SIEVE_TOTAL.opened) * 100}%` }} />
        <span className="lp-sieve-bar-keep" style={{ width: `${(kept / SIEVE_TOTAL.opened) * 100}%` }} />
      </div>

      <ul className="lp-sieve-list">
        {SIEVE_ROWS.map((row, index) => {
          const Icon = SIEVE_ICONS[row.kind];
          const kind = m.sieve.kinds[row.kind];
          return (
            <li
              key={row.host ?? row.kind}
              className={cx('lp-sieve-row', row.keep ? 'is-keep' : 'is-drop', index < visible && 'is-on')}
            >
              <span className="lp-sieve-icon">
                <Icon className="size-4" />
              </span>
              <span className="lp-sieve-signal">
                <span className="lp-sieve-host">{row.host ?? kind}</span>
                {row.host ? <span className="lp-sieve-kind">{kind}</span> : null}
              </span>
              <span className="lp-sieve-verdict">
                {row.keep ? <Check className="size-3" /> : <X className="size-3" />}
                {row.keep ? m.sieve.keep : m.sieve.drop}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="lp-sieve-note">{m.sieve.note}</p>
    </div>
  );
}

const BAND_TIERS: { tier: keyof typeof TIER_COLORS; key: 'hot' | 'warm' | 'cold' }[] = [
  { tier: 'excellent', key: 'hot' },
  { tier: 'bon', key: 'warm' },
  { tier: 'moyen', key: 'cold' },
];

function MapBand({ leads, center, city }: { leads: Lead[]; center: { lat: number; lng: number }; city: string }) {
  const { m } = useI18n();
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
    <div className="lp-mapband lp-reveal" style={{ '--d': '0.16s' } as CSSProperties}>
      <div className="lp-mapband-canvas">
        <GeoMap leads={shown} mode="embed" center={center} className="h-full w-full" />
      </div>
      <div className="lp-mapband-veil" aria-hidden />
      <div className="lp-mapband-panel" data-mascot="band">
        <p className="legend">
          {m.band.label} · {city}
        </p>
        <p className="lp-mapband-title">{m.band.title}</p>
        <ul className="lp-mapband-legend">
          {BAND_TIERS.map((item) => (
            <li key={item.key}>
              <span className="lp-mapband-dot" style={{ background: TIER_COLORS[item.tier].css }} aria-hidden />
              {m.band[item.key]}
            </li>
          ))}
        </ul>
        <p className="lp-mapband-note">{m.band.note}</p>
      </div>
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
  const { user } = useAuth();
  const place = useVisitorPlace();
  const demoLeads = useMemo(() => relocateLeads(DEMO_MAP_LEADS, place), [place]);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [configured, setConfigured] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoAway, setLogoAway] = useState(false);
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');
  const [priceTick, setPriceTick] = useState(0);
  const logoRef = useRef<HTMLAnchorElement>(null);
  const pricingSeen = useRef(false);
  useReveal(locale);

  useEffect(() => {
    const el = document.getElementById('tarifs');
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !pricingSeen.current) {
          pricingSeen.current = true;
          trackPricingView();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
    if (!LANDING_PHOTOS_ENABLED) return;

    const preload = [
      'search',
      'maps',
      'pipeline',
      'calls',
      'export',
      'trust-1',
      'trust-2',
      'trust-3',
      'trust-4',
      'trust-google',
      'plan-starter',
      'plan-pro',
      'plan-agence',
    ];
    for (const name of preload) {
      const set = photoSets(name)[0];
      if (!set) continue;
      const img = new Image();
      img.src = set.webp;
    }
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
    const root = document.documentElement;
    let raf = 0;
    const syncScroll = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      root.style.setProperty('--lp-scroll', (window.scrollY / max).toFixed(4));
      raf = 0;
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(syncScroll);
    };
    syncScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
      root.style.removeProperty('--lp-scroll');
    };
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

  const pickBillingInterval = (interval: 'month' | 'year') => {
    if (interval === billingInterval) return;
    setBillingInterval(interval);
    setPriceTick((tick) => tick + 1);
  };

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
      <div className="lp-head-atmo" aria-hidden>
        <div className="lp-aura lp-aura-head" />
      </div>
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
            ) : (
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
              ) : (
                <Link to="/connexion" className="lp-btn lp-btn-ghost uppercase" onClick={() => setMenuOpen(false)}>
                  {m.nav.login}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="lp-frame lp-frame-head">
        <section className="lp-glow lp-atmo">
          <div className="lp-aura lp-aura-hero" aria-hidden />
          <div className="lp-hero-stage">
            <HeroTopoLines />
            <RadarField />
            <HeroMapDecor />
            <div className="lp-hero-copy">
              <p className="lp-chip lp-chip-hero">
                <TrendingUp className="lp-chip-hero-icon" aria-hidden />
                <span>{m.hero.chip}</span>
              </p>
              <h1 className="lp-hero-title mt-4 sm:mt-5">
                <span className="lp-hero-title-stack">
                  <span className="lp-hero-title-anchor">
                    <GlyphLine text={m.hero.h1a} />
                    <span className="lp-hero-title-line2">
                      <GlyphLine text={m.hero.h1b} className="text-[color:var(--lp-accent-text)]" />
                    </span>
                  </span>
                </span>
              </h1>
              <p className="lp-hero-lead lp-hero-lead-full">{m.hero.lead}</p>
              <p className="lp-hero-lead lp-hero-lead-short">{m.hero.leadShort}</p>
              <div className="lp-hero-ctas">
                <Link to={user ? '/app' : '/inscription'} className="lp-btn lp-btn-primary">
                  {user ? m.nav.app : m.hero.cta} <ArrowRight className="size-4" />
                </Link>
                <a href="#produit" className="lp-btn lp-btn-ghost" onClick={(e) => onNavClick(e, '#produit')}>
                  {m.hero.see}
                </a>
              </div>
            </div>
            <div className="lp-hero-traits">
              {m.hero.traits.map((item, index) => {
                const Icon = TRAIT_ICONS[item.k as keyof typeof TRAIT_ICONS];
                return (
                  <div key={item.title} className="lp-hero-traits-item">
                    <span className="lp-hero-traits-icon" aria-hidden>
                      <Icon className="size-3" />
                    </span>
                    <span className="lp-hero-traits-title">{item.title}</span>
                    {index < m.hero.traits.length - 1 && <span className="lp-hero-traits-sep" aria-hidden />}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
        <div className="lp-frame-seam lp-frame-seam-bottom" aria-hidden />
      </div>

      <main id="top" className="lp-body">
        <section className="lp-cv lp-atmo">
          <div className="lp-aura lp-aura-steps" aria-hidden />
          <ol className="lp-journey lp-page">
            {m.steps.map((item, i) => (
              <li
                key={item.k}
                className="lp-journey-step lp-reveal"
                style={{ '--d': `${i * 0.08}s` } as CSSProperties}
                data-mascot="step"
              >
                <span className="lp-journey-num" aria-hidden>
                  {item.k}
                </span>
                <h2 className="lp-h2">
                  <GlyphLine text={item.t} />
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="produit" className="lp-cv lp-atmo relative">
          <div className="lp-aura lp-aura-product" aria-hidden />
          <PhotoSlot name="search" className="lp-section-photo" delay="0.18s" />
          <div className="lp-section-inner lp-page lp-product-top scroll-mt-24">
            <div className="lp-product-copy">
              <p className="lp-chip lp-reveal lp-reveal-head">{m.product.chip}</p>
              <h2 className="lp-h2 lp-reveal lp-reveal-head mt-4" style={{ '--d': '0.07s' } as CSSProperties}>
                <GlyphLine text={m.product.h2} />
              </h2>
              <p className="lp-reveal mt-4 text-muted" style={{ '--d': '0.14s' } as CSSProperties}>{m.product.lead}</p>
            </div>
            <WebSieve />
          </div>
          <MapBand leads={demoLeads} center={place} city={place.city} />
        </section>

        <section id="fonctionnalites" className="lp-cv lp-atmo">
          <div className="lp-aura lp-aura-features" aria-hidden />
          <div className="lp-page scroll-mt-24">
            <p className="lp-chip lp-reveal lp-reveal-head">{m.features.chip}</p>
            <h2 className="lp-h2 lp-reveal lp-reveal-head mt-4" style={{ '--d': '0.07s' } as CSSProperties}>
              <GlyphLine text={m.features.h2} />
            </h2>
            <div className="lp-features-grid mt-10">
              {m.features.items.map((item, index) => {
                const Icon = featureIcons[index];
                return (
                  <article
                    key={item.title}
                    className="lp-feature lp-reveal overflow-hidden rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg)] p-5 sm:p-7"
                    style={{ '--d': `${0.1 + index * 0.08}s` } as CSSProperties}
                    {...(index === 0 ? { 'data-mascot': 'feature' } : {})}
                  >
                    <PhotoSlot name={featurePhotos[index]} delay={`${0.14 + index * 0.08}s`} />
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

        <section className="lp-cv lp-atmo lp-launch text-center" data-mascot="launch">
          <div className="lp-aura lp-aura-launch" aria-hidden />
          <div className="lp-page scroll-mt-24">
            <p className="lp-chip lp-reveal lp-reveal-head">{m.launch.chip}</p>
            <h2 className="lp-h2 lp-reveal lp-reveal-head mx-auto mt-4 max-w-2xl" style={{ '--d': '0.07s' } as CSSProperties}>
              <GlyphLine text={m.launch.h2} />
            </h2>
            <p className="lp-reveal mx-auto mt-4 max-w-lg text-muted" style={{ '--d': '0.14s' } as CSSProperties}>{m.launch.lead}</p>
            <div className="lp-command lp-command-live lp-reveal mt-10 text-left" style={{ '--d': '0.22s' } as CSSProperties}>
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
          </div>
        </section>

        <section id="confiance" className="lp-cv lp-atmo">
          <div className="lp-aura lp-aura-trust" aria-hidden />
          <div className="lp-page scroll-mt-24">
            <p className="lp-chip lp-reveal lp-reveal-head">{m.trust.chip}</p>
            <h2 className="lp-h2 lp-reveal lp-reveal-head mt-4 max-w-2xl" style={{ '--d': '0.07s' } as CSSProperties}>
              <GlyphLine text={m.trust.h2} />
            </h2>
            <p className="lp-reveal mt-4 max-w-xl text-muted" style={{ '--d': '0.14s' } as CSSProperties}>{m.trust.lead}</p>
            <ul className="lp-trust-grid mt-10">
              {m.trust.items.map((item, index) => {
                const Icon = [Lock, Shield, Table2, Check][index];
                return (
                  <li
                    key={item.title}
                    className="lp-trust-card lp-reveal flex gap-4 rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg)] p-5"
                    style={{ '--d': `${0.1 + index * 0.07}s` } as CSSProperties}
                    {...(index === 0 ? { 'data-mascot': 'trust' } : {})}
                  >
                    <PhotoSlot name={`trust-${index + 1}`} className="lp-trust-photo" delay={`${0.14 + index * 0.07}s`} />
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
            <aside className="lp-trust-card lp-trust-wide lp-reveal mt-5 rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-bg)] p-5 sm:p-6" style={{ '--d': '0.38s' } as CSSProperties}>
              <PhotoSlot name="trust-google" className="lp-trust-photo" delay="0.42s" />
              <h3 className="text-lg">{m.trust.googleTitle}</h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{m.trust.googleText}</p>
              <Link to="/confidentialite" className="mt-3 inline-block text-sm font-medium text-lime-deep">
                {m.trust.googlePrivacy}
              </Link>
            </aside>
          </div>
        </section>

        <section id="tarifs" className="lp-cv lp-atmo">
          <div className="lp-aura lp-aura-pricing" aria-hidden />
          <div className="lp-page scroll-mt-24">
            <p className="lp-chip lp-reveal lp-reveal-head">{m.pricing.chip}</p>
            <h2 className="lp-h2 lp-reveal lp-reveal-head mt-4" style={{ '--d': '0.07s' } as CSSProperties}>
              <GlyphLine text={m.pricing.h2} />
            </h2>
            <p className="lp-reveal mt-4 max-w-xl text-muted" style={{ '--d': '0.14s' } as CSSProperties}>{m.pricing.lead}</p>
            <div className="lp-billing-toggle lp-reveal mt-8" style={{ '--d': '0.2s' } as CSSProperties} role="group" aria-label={m.pricing.chip}>
              <button
                type="button"
                className={cx('lp-billing-btn', billingInterval === 'month' && 'is-on')}
                onClick={() => pickBillingInterval('month')}
              >
                {m.pricing.monthly}
              </button>
              <button
                type="button"
                className={cx('lp-billing-btn', billingInterval === 'year' && 'is-on')}
                onClick={() => pickBillingInterval('year')}
              >
                {m.pricing.yearly}
                <span className="lp-billing-save">{m.pricing.yearlyHint}</span>
              </button>
            </div>
            <div className="lp-plans mt-8">
              {shownPlans.map((plan) => (
                <article
                  key={plan.id}
                  className={cx(
                    'lp-reveal lp-plan-card lp-plan-card-full overflow-hidden rounded-2xl border',
                    plan.highlighted ? 'is-hot border-[color:var(--lp-lime)]' : 'border-[var(--lp-line)]',
                  )}
                  style={{ '--d': `${0.12 + shownPlans.indexOf(plan) * 0.1}s` } as CSSProperties}
                  {...(plan.highlighted ? { 'data-mascot': 'plan' } : {})}
                >
                  <PhotoSlot name={`plan-${plan.id}`} className="lp-plan-photo-full" delay={`${0.2 + shownPlans.indexOf(plan) * 0.1}s`} />
                  <div className="lp-plan-overlay">
                    <h3 className="text-2xl">{plan.name}</h3>
                    <p className="mt-1 text-sm text-muted">{plan.tagline}</p>
                    <p
                      key={`${plan.id}-${billingInterval}-${priceTick}`}
                      className="lp-plan-price lp-price-swap mt-5 font-[family-name:var(--font-display)] text-4xl tracking-tight"
                    >
                      {billingInterval === 'month' ? plan.amountLabel : plan.annualAmountLabel}
                    </p>
                    <p className="legend mt-1">{billingInterval === 'month' ? m.pricing.month : m.pricing.year}</p>
                    {billingInterval === 'year' && (
                      <div key={`${plan.id}-meta-${priceTick}`} className="lp-plan-annual-meta lp-price-swap mt-2">
                        <p className="text-sm text-muted">
                          <span className="line-through">{plan.annualWasLabel}</span>
                          <span className="ml-2 text-lime-deep">{plan.annualBadge}</span>
                        </p>
                      </div>
                    )}
                    <ul className="mt-5 flex-1 space-y-2 text-sm">
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
                      to={
                        configured &&
                        (billingInterval === 'month' ? plan.priceConfigured : plan.annualPriceConfigured)
                          ? `/abonnement?plan=${plan.id}&interval=${billingInterval}`
                          : '/inscription'
                      }
                      className={cx('lp-btn mt-6 w-full', plan.highlighted ? 'lp-btn-primary' : 'lp-btn-ghost')}
                    >
                      {plan.cta}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <div className="lp-frame lp-frame-foot">
        <div className="lp-frame-seam lp-frame-seam-top" aria-hidden />

        <section className="lp-glow lp-atmo">
          <div className="lp-aura lp-aura-hero" aria-hidden />
          <div className="lp-foot-cap" data-mascot="cta">
            <RadarField />
            <div className="lp-page lp-foot-cta">
              <h2 className="lp-h2 lp-reveal lp-reveal-head mx-auto max-w-3xl">
                <GlyphLine text={m.cta.h2} />
              </h2>
              <p className="lp-reveal mx-auto mt-4 max-w-lg text-muted" style={{ '--d': '0.1s' } as CSSProperties}>
                {m.cta.lead}
              </p>
              <div
                className="lp-reveal lp-cta-actions mt-8 flex flex-wrap justify-center gap-3"
                style={{ '--d': '0.18s' } as CSSProperties}
              >
                <Link to="/inscription" className="lp-btn lp-btn-primary">
                  {m.cta.create} <ArrowRight className="size-4" />
                </Link>
                <Link to="/connexion" className="lp-btn lp-btn-ghost">
                  {m.cta.open}
                </Link>
              </div>
            </div>
          </div>
        </section>

        <footer className="lp-foot">
          <div className="lp-foot-rail" aria-hidden />
          <div className="lp-page lp-foot-inner lp-reveal">
            <div className="lp-foot-grid">
              <div className="lp-foot-brand">
                <a href="#top" className="lp-footer-logo" data-mascot="dock" aria-label="Prospy" />
                <p className="lp-foot-blurb">{m.footer.blurb}</p>
                <div className="lp-foot-theme">
                  <span className="legend">{m.footer.look}</span>
                  <ThemeToggle />
                </div>
              </div>
              <nav className="lp-foot-links" aria-label={m.footer.product}>
                <div className="lp-foot-col">
                  <p className="legend">{m.footer.product}</p>
                  <ul>
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
                <div className="lp-foot-col">
                  <p className="legend">{m.footer.account}</p>
                  <ul>
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
                <div className="lp-foot-col">
                  <p className="legend">{m.footer.legal}</p>
                  <ul>
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
              </nav>
            </div>
          </div>
          <p
            className="lp-foot-copy lp-reveal mx-auto max-w-6xl px-4 text-center font-mono text-[11px] tracking-wide text-faint sm:px-6"
            style={{ '--d': '0.12s' } as CSSProperties}
          >
            {m.footer.copy}
          </p>
        </footer>
      </div>
    </div>
  );
}
