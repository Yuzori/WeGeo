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
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · CARTO',
};

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
 * `full` : navigation libre, noms à partir d'un certain zoom, clic → fiche Maps.
 * `embed` : carte réelle dans une vitrine (landing), molette laissée à la page.
 */
export function GeoMap({
  leads,
  mode,
  onExpand,
  className,
}: {
  leads: Lead[];
  mode: 'mini' | 'full' | 'embed';
  onExpand?: () => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const mini = mode === 'mini';
    const embed = mode === 'embed';
    const map = L.map(el, {
      zoomControl: false,
      attributionControl: !mini,
      dragging: !mini,
      scrollWheelZoom: !mini && !embed,
      doubleClickZoom: !mini,
      boxZoom: false,
      keyboard: !mini,
      zoomSnap: 0.25,
    });
    mapRef.current = map;

    if (!mini) L.control.zoom({ position: 'topright' }).addTo(map);

    const tiles = L.tileLayer(isDark() ? TILE.dark : TILE.light, {
      attribution: TILE.attr,
      maxZoom: 19,
    }).addTo(map);
    tilesRef.current = tiles;

    const group = L.layerGroup().addTo(map);
    layerRef.current = group;

    const paint = () => paintMarkers(map, group, leadsRef.current, mini);
    paint();
    if (embed) map.setView([45.764, 4.8357], 12);
    else fitTo(map, leadsRef.current, mini ? 12 : 40);

    const onZoom = () => paint();
    map.on('zoomend', onZoom);

    const onTheme = () => {
      const next = L.tileLayer(isDark() ? TILE.dark : TILE.light, {
        attribution: TILE.attr,
        maxZoom: 19,
      });
      tilesRef.current?.remove();
      next.addTo(map);
      tilesRef.current = next;
    };
    const themeWatch = new MutationObserver(onTheme);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const size = window.setTimeout(() => map.invalidateSize(), 80);
    const size2 = embed ? window.setTimeout(() => map.invalidateSize(), 400) : 0;

    return () => {
      window.clearTimeout(size);
      if (size2) window.clearTimeout(size2);
      themeWatch.disconnect();
      map.off('zoomend', onZoom);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      tilesRef.current = null;
    };
  }, [mode]);

  // Mise à jour des points sans recréer la carte (recherche en direct).
  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;
    paintMarkers(map, group, leads, mode === 'mini');
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
          className="absolute inset-0 z-[400] cursor-pointer"
          title="Agrandir la carte"
        >
          <span className="sr-only">Agrandir la carte</span>
        </button>
      )}
    </div>
  );
}

function paintMarkers(map: L.Map, group: L.LayerGroup, leads: Lead[], mini: boolean): void {
  group.clearLayers();
  const zoom = map.getZoom();
  const showNames = !mini && zoom >= 13;

  for (const lead of located(leads)) {
    const { score, tier } = potential(lead);
    const marker = L.circleMarker([lead.lat!, lead.lng!], {
      radius: mini ? 4 : showNames ? 6 : 7,
      color: 'var(--card)',
      weight: 1.5,
      fillColor: TIER_COLORS[tier].css,
      fillOpacity: 1,
      interactive: !mini,
    });

    if (!mini) {
      marker.on('click', () => window.open(lead.mapsUrl, '_blank', 'noopener'));
      if (showNames) {
        marker.bindTooltip(
          `<span class="geo-name">${escapeHtml(lead.name)}</span><span class="geo-score">${score}</span>`,
          {
            permanent: true,
            direction: 'right',
            offset: [8, 0],
            className: 'geo-label',
            opacity: 1,
          },
        );
      }
    }

    marker.addTo(group);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
