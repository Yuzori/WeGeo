import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import type { Workspace } from '../../shared/types';
import { api } from '../api';
import { Button, Modal, cx } from './ui';
import { resizeAvatar } from '../lib/avatar';

const COVER_PRESETS = [
  { id: 'lime', label: 'Lime', hex: '#b7e133' },
  { id: 'forest', label: 'Forêt', hex: '#2a4a32' },
  { id: 'ember', label: 'Braise', hex: '#c45c26' },
  { id: 'violet', label: 'Violet', hex: '#7b5cff' },
  { id: 'night', label: 'Nuit', hex: '#2a3340' },
] as const;

const LIGHT_MIN = 18;
const LIGHT_MAX = 62;

export function sessionCoverGradient(accent: string): string {
  return `linear-gradient(145deg, color-mix(in oklab, ${accent} 58%, var(--session-cover-mix)), var(--session-cover-mix) 82%)`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return { h: 120, s: 70, l: 45 };
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s: s * 100, l: l * 100 };
}

type LogoMode = Workspace['logoMode'];

function logoPreviewForMode(
  mode: LogoMode,
  workspace: Workspace,
  pickedLogo: string | null | undefined,
): string | null {
  if (mode === 'default') return null;
  if (pickedLogo && mode === 'custom') return pickedLogo;
  if (mode === 'previous') return workspace.previousLogoUrl;
  return workspace.customLogoUrl ?? pickedLogo ?? null;
}

function coverToHex(coverStyle: string | null | undefined): string {
  if (!coverStyle) return '#b7e133';
  const preset = COVER_PRESETS.find((p) => p.id === coverStyle);
  if (preset) return preset.hex;
  if (/^#[0-9a-fA-F]{6}$/.test(coverStyle)) return coverStyle.toLowerCase();
  return '#b7e133';
}

export function sessionCoverBackground(coverStyle: string | null | undefined): string | undefined {
  if (!coverStyle) return undefined;
  const preset = COVER_PRESETS.find((p) => p.id === coverStyle);
  if (preset) return sessionCoverGradient(preset.hex);
  if (/^#[0-9a-fA-F]{6}$/.test(coverStyle)) return sessionCoverGradient(coverStyle);
  return undefined;
}

function ColorPicker({
  hue,
  saturation,
  lightness,
  hex,
  onChange,
}: {
  hue: number;
  saturation: number;
  lightness: number;
  hex: string;
  onChange: (next: { h: number; s: number; l: number }) => void;
}) {
  const planeRef = useRef<HTMLDivElement>(null);

  const pickPlane = useCallback(
    (clientX: number, clientY: number) => {
      const node = planeRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const s = clamp(((clientX - rect.left) / rect.width) * 100, 10, 100);
      const y = clamp((clientY - rect.top) / rect.height, 0, 1);
      const l = clamp(LIGHT_MAX - y * (LIGHT_MAX - LIGHT_MIN), LIGHT_MIN, LIGHT_MAX);
      onChange({ h: hue, s: Math.round(s), l: Math.round(l) });
    },
    [hue, onChange],
  );

  const onPlanePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    pickPlane(event.clientX, event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const thumbX = `${saturation}%`;
  const thumbY = `${100 - ((lightness - LIGHT_MIN) / (LIGHT_MAX - LIGHT_MIN)) * 100}%`;

  return (
    <div className="session-pick-color">
      <div
        ref={planeRef}
        className="session-pick-plane"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue} 100% 50%))`,
        }}
        onPointerDown={onPlanePointer}
        onPointerMove={(event) => {
          if (event.buttons !== 1) return;
          pickPlane(event.clientX, event.clientY);
        }}
        role="presentation"
      >
        <span className="session-pick-thumb" style={{ left: thumbX, top: thumbY }} aria-hidden />
      </div>
      <div className="session-pick-side">
        <input
          type="range"
          min={0}
          max={360}
          value={hue}
          aria-label="Teinte"
          className="session-pick-hue"
          style={{
            background: `linear-gradient(90deg, ${[0, 60, 120, 180, 240, 300, 360]
              .map((step) => hslToHex(step, 92, 52))
              .join(', ')})`,
          }}
          onChange={(e) => onChange({ h: Number(e.target.value), s: saturation, l: lightness })}
        />
        <label className="session-pick-hex">
          <input
            type="color"
            value={hex}
            aria-label="Couleur"
            onChange={(e) => {
              const hsl = hexToHsl(e.target.value);
              onChange({
                h: Math.round(hsl.h),
                s: Math.round(hsl.s || 70),
                l: Math.round(hsl.l || 45),
              });
            }}
          />
          <span>{hex.toUpperCase()}</span>
        </label>
      </div>
    </div>
  );
}

export function SessionCustomizeModal({
  workspace,
  open,
  onClose,
  onSaved,
}: {
  workspace: Workspace;
  open: boolean;
  onClose: () => void;
  onSaved: (workspace: Workspace) => void;
}) {
  const initialHex = coverToHex(workspace.coverStyle);
  const initialHsl = hexToHsl(initialHex);

  const [name, setName] = useState(workspace.name);
  const [coverStyle, setCoverStyle] = useState(workspace.coverStyle ?? 'lime');
  const [hue, setHue] = useState(Math.round(initialHsl.h));
  const [saturation, setSaturation] = useState(Math.round(initialHsl.s || 70));
  const [lightness, setLightness] = useState(Math.round(initialHsl.l || 45));
  const [logoMode, setLogoMode] = useState<LogoMode>(workspace.logoMode ?? (workspace.logoUrl ? 'custom' : 'default'));
  const [logoPreview, setLogoPreview] = useState<string | null>(
    logoPreviewForMode(workspace.logoMode ?? (workspace.logoUrl ? 'custom' : 'default'), workspace, undefined),
  );
  const [logoData, setLogoData] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const mode = workspace.logoMode ?? (workspace.logoUrl ? 'custom' : 'default');
    setName(workspace.name);
    setCoverStyle(workspace.coverStyle ?? 'lime');
    const hex = coverToHex(workspace.coverStyle);
    const hsl = hexToHsl(hex);
    setHue(Math.round(hsl.h));
    setSaturation(Math.round(hsl.s || 70));
    setLightness(Math.round(hsl.l || 45));
    setLogoMode(mode);
    setLogoPreview(logoPreviewForMode(mode, workspace, undefined));
    setLogoData(undefined);
    setError(null);
  }, [open, workspace]);

  const customHex = useMemo(() => hslToHex(hue, saturation, lightness), [hue, saturation, lightness]);
  const previewCover = useMemo(() => sessionCoverGradient(customHex), [customHex]);
  const isPreset = COVER_PRESETS.some((p) => p.id === coverStyle);

  const applyColor = (next: { h: number; s: number; l: number }) => {
    setHue(next.h);
    setSaturation(next.s);
    setLightness(next.l);
    setCoverStyle(hslToHex(next.h, next.s, next.l));
  };

  const pickPreset = (presetId: (typeof COVER_PRESETS)[number]['id']) => {
    const preset = COVER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const hsl = hexToHsl(preset.hex);
    setHue(Math.round(hsl.h));
    setSaturation(Math.round(hsl.s || 70));
    setLightness(Math.round(hsl.l || 45));
    setCoverStyle(presetId);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const patch: {
        name: string;
        coverStyle: string | null;
        logo?: string | null;
        logoMode?: LogoMode;
      } = {
        name,
        coverStyle: coverStyle || null,
      };
      if (logoData !== undefined) {
        patch.logo = logoData;
        patch.logoMode = logoData ? 'custom' : 'default';
      } else if (logoMode !== workspace.logoMode) {
        patch.logoMode = logoMode;
      }
      const { workspace: next } = await api.updateWorkspace(workspace.id, patch);
      onSaved(next);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = await resizeAvatar(file);
      setLogoMode('custom');
      setLogoPreview(data);
      setLogoData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logo illisible.');
    }
  };

  const displayName = name.trim() || 'Ma session';
  const showLogoSources = Boolean(workspace.customLogoUrl || workspace.previousLogoUrl || logoData);

  const pickLogoMode = (mode: LogoMode) => {
    setLogoMode(mode);
    setLogoPreview(logoPreviewForMode(mode, workspace, logoData && mode === 'custom' ? logoData : undefined));
    if (mode === 'default') setLogoData(null);
    else if (logoData === null) setLogoData(undefined);
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title="Personnaliser la session"
      subtitle={
        workspace.personal
          ? 'Espace personnel, visible uniquement par vous.'
          : 'Visible par toute l’équipe sur cette session.'
      }
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="session-customize" variant="primary" loading={busy}>
            Enregistrer
          </Button>
        </div>
      }
    >
      <form id="session-customize" onSubmit={(event) => void save(event)} className="session-customize">
        <div className="session-customize-preview sheet overflow-hidden p-0">
          <div className="session-customize-preview-cover" style={{ background: previewCover }} aria-hidden />
          <div className="session-customize-preview-body">
            <div className="session-customize-preview-top">
              <button
                type="button"
                className="session-customize-logo"
                onClick={() => fileRef.current?.click()}
                title="Changer le logo"
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="" className="size-full object-cover" />
                ) : (
                  <span>{displayName.slice(0, 1).toUpperCase()}</span>
                )}
              </button>
              <span className="session-customize-badge">
                {workspace.personal ? 'Personnel' : `${workspace.memberCount} personne${workspace.memberCount > 1 ? 's' : ''}`}
              </span>
            </div>
            <p className="session-customize-preview-name">{displayName}</p>
            <p className="session-customize-preview-meta">
              {workspace.leadCount} fiche{workspace.leadCount > 1 ? 's' : ''} · {workspace.searchCount} relevé
              {workspace.searchCount > 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="session-customize-row">
          <label className="session-customize-field flex-1">
            <span>Nom de la session</span>
            <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} required className="field h-11" />
          </label>
          <div className="session-customize-logo-actions">
            <Button type="button" size="sm" variant="outline" icon={<ImagePlus className="size-3.5" />} onClick={() => fileRef.current?.click()}>
              Logo
            </Button>
            {showLogoSources && logoMode !== 'default' && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                icon={<Trash2 className="size-3.5" />}
                onClick={() => pickLogoMode('default')}
              >
                Initiale
              </Button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => void pickLogo(e.target.files?.[0])} />
        </div>

        {showLogoSources && (
          <div className="session-customize-section">
            <div className="session-customize-section-head">
              <span>Logo affiché</span>
            </div>
            <div className="session-customize-logo-sources">
              <button
                type="button"
                className={cx('session-customize-logo-source', logoMode === 'default' && 'is-on')}
                aria-pressed={logoMode === 'default'}
                onClick={() => pickLogoMode('default')}
              >
                <span className="session-customize-logo-source-thumb is-initial">{displayName.slice(0, 1).toUpperCase()}</span>
                <span>Initiale</span>
              </button>
              {workspace.previousLogoUrl && (
                <button
                  type="button"
                  className={cx('session-customize-logo-source', logoMode === 'previous' && 'is-on')}
                  aria-pressed={logoMode === 'previous'}
                  onClick={() => pickLogoMode('previous')}
                >
                  <span className="session-customize-logo-source-thumb">
                    <img src={workspace.previousLogoUrl} alt="" className="size-full object-cover" />
                  </span>
                  <span>Ancien</span>
                </button>
              )}
              {(workspace.customLogoUrl || logoData) && (
                <button
                  type="button"
                  className={cx('session-customize-logo-source', logoMode === 'custom' && 'is-on')}
                  aria-pressed={logoMode === 'custom'}
                  onClick={() => pickLogoMode('custom')}
                >
                  <span className="session-customize-logo-source-thumb">
                    <img
                      src={logoData && logoMode === 'custom' ? logoData : workspace.customLogoUrl ?? ''}
                      alt=""
                      className="size-full object-cover"
                    />
                  </span>
                  <span>Actuel</span>
                </button>
              )}
            </div>
          </div>
        )}

        <div className="session-customize-section">
          <div className="session-customize-section-head">
            <span>Couleur de fond</span>
            {!isPreset && <span className="session-customize-chip">Personnalisée</span>}
          </div>
          <ColorPicker hue={hue} saturation={saturation} lightness={lightness} hex={customHex} onChange={applyColor} />
          <div className="session-customize-presets">
            {COVER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                title={preset.label}
                aria-label={preset.label}
                aria-pressed={coverStyle === preset.id}
                onClick={() => pickPreset(preset.id)}
                className={cx('session-customize-preset', coverStyle === preset.id && 'is-on')}
                style={{ background: sessionCoverGradient(preset.hex) }}
              />
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-score-low">{error}</p>}
      </form>
    </Modal>
  );
}
