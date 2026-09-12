const VID_KEY = 'prospy.vid';
const GEO_KEY = 'prospy.analytics.geo';

type ClientGeo = {
  city: string;
  lat: number;
  lng: number;
  region?: string;
  country?: string;
};

function visitorId(): string {
  try {
    let id = localStorage.getItem(VID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VID_KEY, id);
    }
    return id;
  } catch {
    return 'anon';
  }
}

function readCachedGeo(): ClientGeo | null {
  try {
    const raw = sessionStorage.getItem(GEO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClientGeo;
    if (!parsed || !Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedGeo(geo: ClientGeo | null): void {
  try {
    if (geo) sessionStorage.setItem(GEO_KEY, JSON.stringify(geo));
  } catch {
    /* ignore */
  }
}

let geoPromise: Promise<ClientGeo | null> | null = null;

async function sessionGeo(): Promise<ClientGeo | null> {
  const cached = readCachedGeo();
  if (cached) return cached;
  if (!geoPromise) {
    geoPromise = import('../api')
      .then(({ api }) => api.locate())
      .then((place) => {
        if (!place) return null;
        const geo: ClientGeo = {
          city: place.city,
          lat: place.lat,
          lng: place.lng,
          region: place.region,
          country: place.country,
        };
        writeCachedGeo(geo);
        return geo;
      })
      .catch(() => null);
  }
  return geoPromise;
}

function trackingEnabled(pathname: string): boolean {
  if (pathname === '/prospy/stats') return false;
  return true;
}

export function trackEvent(event: string, meta?: Record<string, string>): void {
  if (!trackingEnabled(window.location.pathname)) return;
  void sessionGeo().then((geo) => {
    void fetch('/api/analytics/event', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitorId: visitorId(),
        event,
        path: window.location.pathname,
        meta,
        geo,
      }),
    }).catch(() => {});
  });
}

export function funnelForPath(pathname: string): string | null {
  if (pathname === '/') return 'landing';
  if (pathname === '/inscription') return 'signup';
  if (pathname === '/connexion') return 'login';
  if (pathname === '/abonnement') return 'checkout';
  if (pathname === '/app' || pathname.startsWith('/app/')) return 'app';
  return null;
}

export function trackPage(pathname: string): void {
  if (!trackingEnabled(pathname)) return;
  trackEvent('pageview');
  const funnel = funnelForPath(pathname);
  if (funnel) trackEvent(`funnel:${funnel}`);
}

export function trackPricingView(): void {
  trackEvent('funnel:pricing');
}
