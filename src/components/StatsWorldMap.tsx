import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GlobePoint } from '../api';
import { cx } from './ui';

type Props = {
  points: GlobePoint[];
  live?: boolean;
  fitKey?: string;
};

function visitIcon(live: boolean): L.DivIcon {
  return L.divIcon({
    className: 'stats-map-pin-wrap',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<span class="stats-map-pin ${live ? 'is-live' : ''}"><span class="stats-map-pin-ring"></span><span class="stats-map-pin-core"></span></span>`,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fitPoints(map: L.Map, points: GlobePoint[]): void {
  if (!points.length) {
    map.setView([46.6, 2.4], 5);
    return;
  }
  if (points.length === 1) {
    map.setView([points[0].lat, points[0].lng], 8);
    return;
  }
  const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng] as L.LatLngTuple));
  map.fitBounds(bounds, { padding: [48, 48], maxZoom: 10 });
}

export function StatsWorldMap({ points, live = false, fitKey = 'all' }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef(new Map<string, L.Marker>());
  const fitKeyRef = useRef(fitKey);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const map = L.map(el, {
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      boxZoom: true,
      keyboard: true,
      zoomSnap: 0.25,
      minZoom: 2,
      maxZoom: 18,
    });
    mapRef.current = map;

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      maxNativeZoom: 19,
    }).addTo(map);

    el.classList.add('is-dark');

    const group = L.layerGroup().addTo(map);
    layerRef.current = group;

    map.setView([46.6, 2.4], 5);

    const size = window.setTimeout(() => map.invalidateSize(), 80);

    return () => {
      window.clearTimeout(size);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;

    const markers = markersRef.current;
    const liveKeys = new Set(points.map((point) => `${point.lat}:${point.lng}:${point.at}`));

    for (const [key, marker] of markers) {
      if (liveKeys.has(key)) continue;
      group.removeLayer(marker);
      markers.delete(key);
    }

    for (const point of points) {
      const key = `${point.lat}:${point.lng}:${point.at}`;
      let marker = markers.get(key);
      if (!marker) {
        marker = L.marker([point.lat, point.lng], {
          icon: visitIcon(live || point.live),
          zIndexOffset: 1000,
          interactive: true,
          keyboard: false,
        });
        marker.bindTooltip(
          `<strong>${escapeHtml(point.label || 'Visiteur')}</strong><br /><span>${escapeHtml(new Date(point.at).toLocaleString('fr-FR'))}</span>`,
          {
            direction: 'top',
            offset: [0, -12],
            className: 'stats-map-tooltip',
            opacity: 1,
          },
        );
        marker.addTo(group);
        markers.set(key, marker);
      } else {
        marker.setIcon(visitIcon(live || point.live));
      }
    }

    if (fitKeyRef.current !== fitKey) {
      fitKeyRef.current = fitKey;
      fitPoints(map, points);
    }
    window.setTimeout(() => map.invalidateSize(), 60);
  }, [points, live, fitKey]);

  return (
    <div className={cx('stats-map-shell relative overflow-hidden')}>
      <div ref={host} className="stats-map geo-map absolute inset-0" />
      <p className="stats-map-hint">Molette ou pinch pour zoomer · glissez pour naviguer</p>
    </div>
  );
}
