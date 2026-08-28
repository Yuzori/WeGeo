import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Lead } from '../../shared/types';
import { TIER_COLORS, potential } from '../lib/lead';
import { cx } from './ui';

/** Emprise de la France métropolitaine, Corse comprise. */
const FRANCE = L.latLngBounds([
  [41.3, -5.2],
  [51.15, 9.6],
]);

const TILE = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
};

function putTiles(map: L.Map): L.TileLayer {
  return L.tileLayer(TILE.url, {
    attribution: '',
    maxZoom: 19,
    maxNativeZoom: 19,
  }).addTo(map);
}

function isDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

function located(leads: Lead[]): Lead[] {
  return leads.filter((l) => l.lat != null && l.lng != null);
}

function fitTo(map: L.Map, leads: Lead[], pad: number): void {
  const pts = located(leads);
  if (!pts.length) {
    map.fitBounds(FRANCE, { padding: [pad, pad] });
    return;
  }
  if (pts.length === 1) {
    map.setView([pts[0].lat!, pts[0].lng!], 14);
    return;
  }
  const bounds = L.latLngBounds(pts.map((l) => [l.lat!, l.lng!] as L.LatLngTuple));
  map.fitBounds(bounds, { padding: [pad, pad], maxZoom: 15 });
}

/**
 * Carte réelle (tuiles OpenStreetMap), les points sont collés à leur GPS.
 *
 * `mini` : aperçu figé, un clic l'agrandit.
 * `full` : navigation libre, noms à partir d'un certain zoom. Les points ne sont pas cliquables.
 * `embed` : carte réelle dans une vitrine (landing), molette laissée à la page.
 */
export function GeoMap({
  leads,
  mode,
  onExpand,
  className,
  center,
}: {
  leads: Lead[];
  mode: 'mini' | 'full' | 'embed';
  onExpand?: () => void;
  className?: string;
  center?: { lat: number; lng: number };
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef(new Map<number, L.Marker>());
  const leadsRef = useRef(leads);
  leadsRef.current = leads;
  const centerRef = useRef(center);
  centerRef.current = center;

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const mini = mode === 'mini';
    const embed = mode === 'embed';
    const map = L.map(el, {
      zoomControl: false,
      attributionControl: false,
      dragging: !mini,
      scrollWheelZoom: !mini && !embed,
      doubleClickZoom: !mini,
      boxZoom: false,
      keyboard: !mini,
      zoomSnap: 0.25,
      maxZoom: 19,
    });
    mapRef.current = map;

    if (!mini) L.control.zoom({ position: 'topright' }).addTo(map);

    const dark = isDark();
    tilesRef.current = putTiles(map);
    el.classList.toggle('is-dark', dark);

    const group = L.layerGroup().addTo(map);
    layerRef.current = group;

    syncMarkers(map, group, markersRef.current, leadsRef.current, mode);
    if (embed) {
      const here = centerRef.current ?? { lat: 45.764, lng: 4.8357 };
      map.setView([here.lat, here.lng], 12);
    } else fitTo(map, leadsRef.current, mini ? 12 : 40);

    const onZoomStart = () => el.classList.add('is-zooming');
    const onZoomEnd = () => {
      el.classList.remove('is-zooming');
      syncTooltips(markersRef.current, leadsRef.current, mode, map.getZoom());
    };
    map.on('zoomstart', onZoomStart);
    map.on('zoomend', onZoomEnd);

    const onTheme = () => {
      el.classList.toggle('is-dark', isDark());
    };
    const themeWatch = new MutationObserver(onTheme);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const size = window.setTimeout(() => map.invalidateSize(), 80);
    const size2 = embed ? window.setTimeout(() => map.invalidateSize(), 400) : 0;

    return () => {
      window.clearTimeout(size);
      if (size2) window.clearTimeout(size2);
      themeWatch.disconnect();
      map.off('zoomstart', onZoomStart);
      map.off('zoomend', onZoomEnd);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      tilesRef.current = null;
      markersRef.current.clear();
    };
  }, [mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== 'embed' || !center) return;
    map.setView([center.lat, center.lng], 12);
  }, [center, mode]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;
    syncMarkers(map, group, markersRef.current, leads, mode);
    if (mode !== 'embed') fitTo(map, leads, mode === 'mini' ? 12 : 40);
    else map.invalidateSize();
  }, [leads, mode]);

  return (
    <div className={cx('relative overflow-hidden', className)}>
      <div ref={host} className="geo-map absolute inset-0" />
      {mode === 'mini' && onExpand && (
        <button
          type="button"
          onClick={onExpand}
          className="absolute inset-0 z-10 cursor-pointer"
          title="Agrandir la carte"
        >
          <span className="sr-only">Agrandir la carte</span>
        </button>
      )}
    </div>
  );
}

function blipIcon(color: string, mini: boolean): L.DivIcon {
  return L.divIcon({
    className: 'geo-blip-wrap',
    iconSize: mini ? [14, 14] : [18, 18],
    iconAnchor: mini ? [7, 7] : [9, 9],
    html: `<span class="geo-blip ${mini ? 'is-mini' : ''}" style="--blip:${color}"><span class="geo-blip-ring"></span><span class="geo-blip-core"></span></span>`,
  });
}

function syncMarkers(
  map: L.Map,
  group: L.LayerGroup,
  markers: Map<number, L.Marker>,
  leads: Lead[],
  mode: 'mini' | 'full' | 'embed',
): void {
  const pts = located(leads);
  const live = new Set(pts.map((lead) => lead.id));
  for (const [id, marker] of markers) {
    if (live.has(id)) continue;
    group.removeLayer(marker);
    markers.delete(id);
  }

  const mini = mode === 'mini';
  for (const lead of pts) {
    const { tier } = potential(lead);
    const color = TIER_COLORS[tier].css;
    let marker = markers.get(lead.id);
    if (!marker) {
      marker = L.marker([lead.lat!, lead.lng!], {
        icon: blipIcon(color, mini),
        interactive: false,
        keyboard: false,
      });
      marker.addTo(group);
      markers.set(lead.id, marker);
    } else {
      marker.setLatLng([lead.lat!, lead.lng!]);
    }
  }

  syncTooltips(markers, leads, mode, map.getZoom());
}

function syncTooltips(
  markers: Map<number, L.Marker>,
  leads: Lead[],
  mode: 'mini' | 'full' | 'embed',
  zoom: number,
): void {
  const showNames = mode === 'full' && zoom >= 13;
  const byId = new Map(leads.map((lead) => [lead.id, lead]));
  for (const [id, marker] of markers) {
    const lead = byId.get(id);
    const tip = marker.getTooltip();
    if (showNames && lead) {
      const { score } = potential(lead);
      const html = `<span class="geo-name">${escapeHtml(lead.name)}</span><span class="geo-score">${score}</span>`;
      if (tip) tip.setContent(html);
      else {
        marker.bindTooltip(html, {
          permanent: true,
          direction: 'right',
          offset: [12, 0],
          className: 'geo-label',
          opacity: 1,
        });
      }
    } else if (tip) {
      marker.unbindTooltip();
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
