import { useEffect, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  DoubleSide,
  FrontSide,
  Group,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  NoToneMapping,
  PerspectiveCamera,
  Quaternion,
  SRGBColorSpace,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { useI18n } from '../i18n';

/*
 * La mascotte se pose sur les éléments porteurs d'un attribut data-mascot.
 *
 * Deux règles tiennent tout le fichier :
 *
 * 1. Aucune lecture de mise en page pendant l'animation. Les branches sont
 *    mesurées à l'arrêt (resize, mutation, fin de scroll).
 *
 * 2. La mascotte se téléporte d'une zone à l'autre dès que le nouveau point
 *    est joignable, même pendant le scroll. Sur un point, elle y reste collée
 *    sans glisser.
 */

const GLTF_CANDIDATES = ['/model-optimized.glb', '/model.glb', '/model.gltf'];
const FBX_URL = '/prospy.fbx?full=1';

let gltfLoader: GLTFLoader | null = null;

function mascotGltfLoader(): GLTFLoader {
  if (gltfLoader) return gltfLoader;
  const draco = new DRACOLoader();
  draco.setDecoderPath('/draco/');
  draco.preload();
  gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(draco);
  return gltfLoader;
}
const LIME_DAY = 0xd2f54c;
const LIME_NIGHT = 0xd6fa58;

/** Côté du canvas de rendu, en pixels CSS. Il suit la mascotte au lieu de couvrir l'écran. */
const STAGE = 176;
const STAGE_LANDING = 208;
const CAM_FOV = 28;
const CAM_Z = 8;
const WORLD_H = 2 * Math.tan(((CAM_FOV * Math.PI) / 180) / 2) * CAM_Z;

function isMobileViewport(): boolean {
  return window.matchMedia('(max-width: 767px), (pointer: coarse)').matches;
}

/** DPR réel pour le buffer WebGL. */
function renderDpr(onLanding: boolean): number {
  const dpr = window.devicePixelRatio || 1;
  const mobile = isMobileViewport();
  if (onLanding) {
    if (mobile) return Math.min(2, Math.max(1.25, dpr));
    return Math.min(2.5, Math.max(1.5, dpr));
  }
  return Math.min(mobile ? 1.75 : 2, Math.max(1, dpr));
}

function scrollSettleMs(onLanding: boolean): number {
  if (onLanding) return isMobileViewport() ? 480 : 420;
  return isMobileViewport() ? 180 : 140;
}

/** Groupe les perchoirs d'une même section. La téléportation ne joue qu'entre zones. */
function perchZone(p: { kind: string }): string {
  switch (p.kind) {
    case 'home':
    case 'logo':
      return 'home';
    case 'hero':
    case 'window':
      return 'hero';
    case 'step':
    case 'steps':
      return 'steps';
    case 'feature':
      return 'features';
    case 'plan':
      return 'pricing';
    default:
      return p.kind;
  }
}

/** Hauteur de visée dans le viewport pour choisir une branche. */
const AIM = 0.36;
/** Temps minimum passé sur une branche avant d'en changer. */
const DWELL = 520;
/** Au-delà, la mascotte quitte la barre même si le scroll continue. */
const HOME_LEAVE = 72;
/** En dessous, et seulement là, elle a le droit de rentrer au logo. */
const HOME_RETURN = 40;
const WARP_OUT = 0.26;
const WARP_IN = 0.38;
const WARP_IN_SPAWN = 0.42;
/** Taille de référence pour calibrer l'anneau de téléportation. */
const WARP_SIZE_REF = 58;
/** Orientation repos : la boucle du logo s’ouvre vers la droite. */
const REST_YAW = Math.PI + 0.22;
/** Rotation permanente (rad/s). La mascotte ne se fige jamais au repos. */
const AMBIENT_SPIN = 0.34;
const AMBIENT_SPIN_FLYING = 0.62;

type MascotSource = 'gltf' | 'fbx' | 'fallback';
type ModelReady = { object: Object3D; source: MascotSource };

let modelShared: ModelReady | null = null;
let modelStarted = false;
const modelWaiters: Array<(ready: ModelReady) => void> = [];

function resolveModel(ready: ModelReady) {
  modelShared = ready;
  modelWaiters.splice(0).forEach((fn) => fn(ready));
}

function loadFbxFallback() {
  const loader = new FBXLoader();
  loader.load(
    FBX_URL,
    (fbx) => resolveModel({ object: fbx, source: 'fbx' }),
    undefined,
    () => resolveModel({ object: fallbackPin(), source: 'fallback' }),
  );
}

function loadGltfCandidate(index: number) {
  const url = GLTF_CANDIDATES[index];
  if (!url) {
    loadFbxFallback();
    return;
  }
  mascotGltfLoader().load(
    url,
    (gltf) => resolveModel({ object: gltf.scene, source: 'gltf' }),
    undefined,
    () => loadGltfCandidate(index + 1),
  );
}

function startModelLoad() {
  if (modelStarted || typeof window === 'undefined') return;
  modelStarted = true;
  loadGltfCandidate(0);
}

function onModelReady(cb: (ready: ModelReady) => void) {
  startModelLoad();
  if (modelShared) cb(modelShared);
  else modelWaiters.push(cb);
}

function clamp(v: number, a = 0, b = 1): number {
  return Math.min(b, Math.max(a, v));
}

function smoothTo(current: number, target: number, dt: number, tau: number): number {
  return current + (target - current) * (1 - Math.exp(-dt / Math.max(0.04, tau)));
}

function angleDelta(from: number, to: number): number {
  const tau = Math.PI * 2;
  let d = (to - from) % tau;
  if (d > Math.PI) d -= tau;
  if (d < -Math.PI) d += tau;
  return d;
}

function smoothAngle(current: number, target: number, dt: number, tau: number): number {
  return current + angleDelta(current, target) * (1 - Math.exp(-dt / Math.max(0.04, tau)));
}

/** Départ posé, arrivée posée. Le vol ne commence ni ne finit brutalement. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function brandLime(dark: boolean): number {
  return dark ? LIME_NIGHT : LIME_DAY;
}

function isMeshNode(node: Object3D): node is Mesh {
  return (node as Mesh).isMesh === true;
}

function meshCount(root: Object3D): number {
  let count = 0;
  root.traverse((node) => {
    if (isMeshNode(node)) count += 1;
  });
  return count;
}

function paintBrand(root: Object3D, dark: boolean) {
  const hex = brandLime(dark);
  root.traverse((node) => {
    if (!isMeshNode(node)) return;
    node.castShadow = false;
    node.receiveShadow = false;
    node.frustumCulled = true;
    const geo = node.geometry;
    if (geo && !geo.getAttribute('normal')) geo.computeVertexNormals();
    const current = node.material;
    if (Array.isArray(current)) current.forEach((item) => item.dispose());
    else current?.dispose();
    node.material = new MeshStandardMaterial({
      color: hex,
      roughness: 0.34,
      metalness: 0,
      emissive: new Color(hex),
      emissiveIntensity: dark ? 0.28 : 0.14,
      envMapIntensity: 0,
      side: FrontSide,
      toneMapped: false,
      flatShading: false,
    });
  });
}

function fallbackPin(): Group {
  const group = new Group();
  const pts = [
    new Vector2(0, 0.52),
    new Vector2(0.22, 0.48),
    new Vector2(0.31, 0.34),
    new Vector2(0.3, 0.16),
    new Vector2(0.14, 0.0),
    new Vector2(0.045, -0.36),
    new Vector2(0, -0.48),
  ];
  const lime = brandLime(document.documentElement.classList.contains('dark'));
  const mat = new MeshStandardMaterial({ color: lime, roughness: 0.34, metalness: 0, emissive: new Color(lime), emissiveIntensity: 0.18, toneMapped: false, side: DoubleSide });
  const body = new Mesh(new LatheGeometry(pts, 64), mat);
  const bead = new Mesh(
    new LatheGeometry([new Vector2(0, -0.58), new Vector2(0.09, -0.62), new Vector2(0, -0.7)], 24),
    mat.clone(),
  );
  bead.name = 'Curve003';
  group.add(body, bead);
  return group;
}

function extractMascotMeshes(root: Object3D): Group {
  root.updateMatrixWorld(true);
  const group = new Group();
  const pos = new Vector3();
  const quat = new Quaternion();
  const scl = new Vector3();
  const seen = new Set<string>();
  let namedCurves = false;
  root.traverse((node) => {
    if (isMeshNode(node) && /curve002|curve003/i.test(node.name)) namedCurves = true;
  });
  root.traverse((node) => {
    if (!isMeshNode(node)) return;
    if (namedCurves && !/curve002|curve003/i.test(node.name)) return;
    const key = node.name ? node.name.replace(/\.\d+$/, '').toLowerCase() : node.uuid;
    if (seen.has(key)) return;
    seen.add(key);
    const mesh = node.clone();
    mesh.geometry = node.geometry;
    node.matrixWorld.decompose(pos, quat, scl);
    mesh.position.copy(pos);
    mesh.quaternion.copy(quat);
    mesh.scale.set(1, 1, 1);
    mesh.name = node.name || key;
    group.add(mesh);
  });
  return group;
}

function refit(wrap: Group) {
  const inner = wrap.children[0];
  if (!inner) return;
  inner.position.set(0, 0, 0);
  inner.scale.set(1, 1, 1);
  inner.updateMatrixWorld(true);
  const box = new Box3().setFromObject(inner);
  const size = new Vector3();
  const center = new Vector3();
  box.getCenter(center);
  box.getSize(size);
  inner.position.sub(center);
  const k = 1 / Math.max(size.y, 1e-4);
  inner.scale.set(k, k * 0.86, k);
  inner.updateMatrixWorld(true);
  box.setFromObject(inner);
  box.getCenter(center);
  inner.position.sub(center);
}

function buildMascot(object: Object3D, source: MascotSource): Group {
  const extracted = source === 'fallback' ? object : extractMascotMeshes(object);
  const inner = new Group();
  inner.add(extracted);
  const wrap = new Group();
  wrap.add(inner);
  paintBrand(wrap, document.documentElement.classList.contains('dark'));
  refit(wrap);
  return wrap;
}

/* ------------------------------------------------------------------ branches */

type Perch = {
  id: string;
  el: HTMLElement | null;
  kind: string;
  /** Centre horizontal, en pixels page. */
  x: number;
  /** Centre vertical, en pixels page. Écran si `fixed`. */
  y: number;
  /** Taille visée de la mascotte, en pixels. */
  s: number;
  /** Vrai pour les branches ancrées au viewport (barre de navigation). */
  fixed: boolean;
};

function navSize(nav: HTMLElement | null, logo: HTMLElement | null): number {
  if (nav) {
    const h = nav.getBoundingClientRect().height || 48;
    return Math.round(Math.min(36, Math.max(30, h * 0.72)));
  }
  const h = logo?.getBoundingClientRect().height ?? 42;
  return Math.round(clamp(h * 0.88, 32, 44));
}

function perchSize(): number {
  const w = window.innerWidth;
  if (w < 640) return Math.round(clamp(w * 0.13, 46, 56));
  if (w < 1024) return 62;
  return 70;
}

/** Le logo visible le plus grand, sur la landing comme dans l'application. */
function pickVisibleLogo(source: HTMLElement | null): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>('.lp-nav-logo, .app-logo-slot');
  let best: HTMLElement | null = null;
  let bestArea = 0;
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
    const area = r.width * r.height;
    if (area > bestArea) {
      best = el;
      bestArea = area;
    }
  }
  return best ?? source;
}

/**
 * Point d'appui à l'intérieur d'un élément, en coordonnées page.
 * La mascotte se pose sur l'arête haute, comme un oiseau sur une branche.
 */
function navCeiling(): number {
  const wrap = document.querySelector<HTMLElement>('.lp-nav-wrap');
  return (wrap?.getBoundingClientRect().bottom ?? 56) + 12;
}

/** La mascotte ne doit jamais passer sous la barre de navigation. */
function clearsNav(perch: Perch, scrollY: number): boolean {
  if (perch.kind === 'home' || perch.kind === 'dock' || perch.fixed) return true;
  const y = perch.y - scrollY;
  const top = y - perch.s * 0.55;
  return top >= navCeiling();
}

function measurePerch(el: HTMLElement, size: number): Perch | null {
  const r = el.getBoundingClientRect();
  if (r.width < 16 || r.height < 16) return null;
  const kind = el.dataset.mascot ?? el.dataset.guide ?? 'spot';
  const sx = window.scrollX;
  const sy = window.scrollY;
  const vw = window.innerWidth;

  if (kind === 'dock') {
    return {
      id: `${kind}:${el.dataset.mascotId ?? 'dock'}`,
      el,
      kind,
      x: r.left + sx + r.width / 2,
      y: r.top + sy + r.height / 2,
      s: Math.round(clamp(r.height * 1.05, 34, 52)),
      fixed: false,
    };
  }

  // Assise : les pieds touchent l'arête, le corps dépasse au-dessus.
  const seat = size * 0.2;
  let x = r.left + sx + 34;
  let y = r.top + sy - seat;

  if (kind === 'plan') {
    x = r.right + sx - 34;
  } else if (kind === 'product' || kind === 'band') {
    x = r.left + sx + 44;
  } else if (kind === 'launch' || kind === 'cta') {
    const heading = el.querySelector('h2, .lp-h2');
    const hr = heading?.getBoundingClientRect();
    if (hr && hr.height > 8) {
      x = hr.left + sx + 26;
      y = hr.top + sy - seat;
    } else {
      x = r.left + sx + r.width * 0.5;
      y = r.top + sy + r.height * 0.24;
    }
  } else if (kind === 'step' || kind === 'steps') {
    const heading = el.querySelector('h2');
    const hr = heading?.getBoundingClientRect();
    if (hr && hr.height > 8) {
      x = hr.left + sx + Math.min(40, hr.width * 0.12);
      y = hr.top + sy - seat;
    }
  } else if (kind === 'search' || kind === 'results' || kind === 'pipeline' || kind === 'invite') {
    x = r.left + sx + 52;
  }

  const edge = vw < 640 ? 44 : 56;
  x = clamp(x, sx + edge, sx + vw - edge);
  return { id: `${kind}:${el.dataset.mascotId ?? ''}`, el, kind, x, y, s: size, fixed: false };
}

/* ---------------------------------------------------------- lettres remuées */

/**
 * Les centres des lettres sont mémorisés une fois en coordonnées page.
 * La boucle ne fait plus que de l'arithmétique et n'écrit que sur les lettres
 * réellement atteintes, au lieu de mesurer puis repositionner les six cents.
 */
type Field = {
  els: HTMLElement[];
  cx: Float32Array;
  cy: Float32Array;
  ox: Float32Array;
  oy: Float32Array;
  live: Set<number>;
};

function buildField(): Field {
  let els = [...document.querySelectorAll<HTMLElement>('.lp-glyph')];
  // Au-delà d'un certain volume on remue les mots, pas les lettres.
  if (els.length > 900) els = [...document.querySelectorAll<HTMLElement>('.lp-split-word')];
  for (const el of els) el.style.transform = '';
  const n = els.length;
  const field: Field = {
    els,
    cx: new Float32Array(n),
    cy: new Float32Array(n),
    ox: new Float32Array(n),
    oy: new Float32Array(n),
    live: new Set(),
  };
  const sx = window.scrollX;
  const sy = window.scrollY;
  for (let i = 0; i < n; i++) {
    const r = els[i].getBoundingClientRect();
    field.cx[i] = r.left + sx + r.width * 0.5;
    field.cy[i] = r.top + sy + r.height * 0.5;
  }
  return field;
}

function stirField(field: Field | null, px: number, py: number, radius: number, dt: number, brisk: boolean) {
  if (!field) return;
  const { els, cx, cy, ox, oy, live } = field;
  const kIn = 1 - Math.exp(-dt / (brisk ? 0.05 : 0.075));
  const kOut = 1 - Math.exp(-dt / 0.3);
  const maxForce = Math.min(46, radius * 0.2);
  const r2 = radius * radius;
  const touched = new Set<number>();

  if (radius >= 8) {
    for (let i = 0; i < cx.length; i++) {
      const dx = cx[i] - px;
      if (dx > radius || dx < -radius) continue;
      const dy = cy[i] - py;
      if (dy > radius || dy < -radius) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r2 || d2 <= 1) continue;
      const d = Math.sqrt(d2);
      const force = (1 - d / radius) * maxForce;
      const tx = (dx / d) * force;
      const ty = (dy / d) * force * 0.38;
      ox[i] += (tx - ox[i]) * kIn;
      oy[i] += (ty - oy[i]) * kIn;
      els[i].style.transform = `translate3d(${ox[i].toFixed(2)}px,${oy[i].toFixed(2)}px,0)`;
      touched.add(i);
      live.add(i);
    }
  }

  for (const i of live) {
    if (touched.has(i)) continue;
    ox[i] += (0 - ox[i]) * kOut;
    oy[i] += (0 - oy[i]) * kOut;
    if (Math.abs(ox[i]) < 0.12 && Math.abs(oy[i]) < 0.12) {
      ox[i] = 0;
      oy[i] = 0;
      els[i].style.transform = '';
      live.delete(i);
    } else {
      els[i].style.transform = `translate3d(${ox[i].toFixed(2)}px,${oy[i].toFixed(2)}px,0)`;
    }
  }
}

function clearField(field: Field | null) {
  if (!field) return;
  for (const el of field.els) el.style.transform = '';
  field.live.clear();
}

/* ------------------------------------------------------------------ composant */

export function LogoFlight({
  sourceRef,
  onProgress,
  guideTarget = null,
  guideActions = null,
}: {
  sourceRef: RefObject<HTMLAnchorElement | null>;
  onProgress?: (progress: number, departed: boolean) => void;
  guideTarget?: string | null;
  guideActions?: { onSkip: () => void; onNext: () => void; last: boolean } | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const hitRef = useRef<HTMLButtonElement>(null);
  const sayRef = useRef<HTMLDivElement>(null);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const { m } = useI18n();
  const linesRef = useRef(m.mascot);
  linesRef.current = m.mascot;
  const guideCopyRef = useRef(m.guide);
  guideCopyRef.current = m.guide;
  const guideTargetRef = useRef<string | null>(guideTarget);
  guideTargetRef.current = guideTarget;

  useEffect(() => {
    const host = hostRef.current;
    const hit = hitRef.current;
    const say = sayRef.current;
    const sayLine = say?.querySelector<HTMLElement>('.lp-mascot-say-text');
    const source =
      sourceRef.current ??
      document.querySelector<HTMLAnchorElement>('.lp-nav-logo, .app-logo-slot');
    if (!host || !hit || !say || !sayLine || !source) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onLanding = Boolean(document.querySelector('.landing:not(.auth-page)'));
    const stageSize = onLanding ? STAGE_LANDING : STAGE;
    let dead = false;
    let frame = 0;

    /* --- scène ------------------------------------------------------------ */

    const scene = new Scene();
    const camera = new PerspectiveCamera(CAM_FOV, 1, 0.5, 40);
    camera.position.set(0, 0, CAM_Z);

    const hemi = new HemisphereLight(0xf4f7ea, 0x1a2214, 1);
    const key = new DirectionalLight(0xfff6e0, 1.15);
    key.position.set(2.4, 4.2, 6);
    const fill = new AmbientLight(0xd5ddc4, 0.38);
    scene.add(hemi, key, fill);

    const renderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NoToneMapping;

    const syncRenderer = () => {
      renderer.setPixelRatio(renderDpr(onLanding));
      renderer.setSize(stageSize, stageSize, false);
    };
    syncRenderer();

    host.style.width = `${stageSize}px`;
    host.style.height = `${stageSize}px`;
    host.appendChild(renderer.domElement);

    let model: Group | null = null;
    let lastTheme = document.documentElement.classList.contains('dark');
    /** Nombre d'images à redessiner coûte que coûte, même au repos. */
    let needsRender = 3;

    const lightsForTheme = () => {
      const dark = document.documentElement.classList.contains('dark');
      lastTheme = dark;
      hemi.intensity = dark ? 1.05 : 1.15;
      key.intensity = dark ? 1.2 : 1.35;
      fill.intensity = dark ? 0.42 : 0.52;
      if (model) paintBrand(model, dark);
      needsRender = 2;
    };
    lightsForTheme();

    /* --- nœuds mis en cache ---------------------------------------------- */

    let navEl = document.querySelector<HTMLElement>('.lp-nav');
    let navWrap = document.querySelector<HTMLElement>('.lp-nav-wrap');
    let logoEl: HTMLElement | null = pickVisibleLogo(source);
    let logoSlots: HTMLElement[] = [];
    let footerSlots: HTMLElement[] = [];

    const refreshSlots = () => {
      navEl = document.querySelector<HTMLElement>('.lp-nav');
      navWrap = document.querySelector<HTMLElement>('.lp-nav-wrap');
      logoSlots = [...document.querySelectorAll<HTMLElement>('.app-logo-slot, .lp-nav-logo')];
      footerSlots = [...document.querySelectorAll<HTMLElement>('.lp-footer-logo')];
    };
    refreshSlots();

    /* --- registre des branches ------------------------------------------- */

    const registry = new Map<HTMLElement, Perch>();
    let seq = 0;
    let home: Perch = {
      id: 'home',
      el: logoEl,
      kind: 'home',
      x: 28,
      y: 24,
      s: 36,
      fixed: true,
    };

    const measureHome = () => {
      logoEl = pickVisibleLogo(source);
      const logo = logoEl?.getBoundingClientRect();
      const bar = navEl?.getBoundingClientRect();
      const s = navSize(navEl, logoEl);
      const open = Boolean(logo && logo.width > 8);
      home = {
        id: 'home',
        el: logoEl ?? source,
        kind: 'home',
        x: open && logo ? logo.left + logo.width / 2 - s * 0.06 : bar ? bar.left + 22 : 28,
        y: open && logo ? logo.top + logo.height / 2 : bar ? bar.top + bar.height / 2 : 24,
        s,
        fixed: true,
      };
    };

    const syncRegistry = () => {
      const found = new Set<HTMLElement>();
      const size = perchSize();
      document.querySelectorAll<HTMLElement>('[data-mascot]').forEach((el) => {
        found.add(el);
        if (!el.dataset.mascotId) el.dataset.mascotId = String(++seq);
        const perch = measurePerch(el, size);
        if (perch) registry.set(el, perch);
        else registry.delete(el);
      });
      for (const el of [...registry.keys()]) {
        if (found.has(el)) continue;
        registry.delete(el);
      }
      measureHome();
      pickDue = true;
    };

    /* --- état du mouvement ----------------------------------------------- */

    const pos = { x: 0, y: 0, s: 36 };
    let target: Perch = home;
    let landT = 99;
    let switchedAt = 0;
    let pickDue = true;
    let scrollAt = 0;
    let lastScrollY = window.scrollY;
    let scrollSpeed = 0;
    let pending: Perch | null = null;
    let warp: 'idle' | 'out' | 'away' | 'in' = 'idle';
    let warpT = 0;
    let spawnSpin = true;
    let spawnFx = false;
    let spawnDebut = false;

    let spinY = REST_YAW;
    let spinVel = 0;
    let lookX = 0;
    let lookY = 0;
    let life = 0;
    let fidget = 0;
    let fidgetIn = 4.8;
    let idleKind = 0;
    let idleT = 0;
    let lastT = performance.now();
    let idleFrames = 0;
    const pointer = { x: window.innerWidth * 0.5, y: 40 };

    let field: Field | null = null;
    let fieldDue = true;

    /* --- parole ----------------------------------------------------------- */

    let clickSpeech = false;
    let fadeTimer = 0;
    let introTimer = 0;
    let sayText = '';
    let sayW = 0;
    let sayH = 0;
    let sayX = 12;
    let sayY = 12;
    let sayInited = false;
    let spokenFor = '';
    let lastSayLeft = -1;
    let lastSayTop = -1;

    const hushSay = () => {
      window.clearTimeout(fadeTimer);
      clickSpeech = false;
      sayInited = false;
      sayText = '';
      say.classList.remove('is-out', 'is-on');
      sayLine.textContent = '';
    };

    const speak = (text: string, fromClick = false) => {
      if (!text || text === sayText) {
        if (text && fromClick) {
          window.clearTimeout(fadeTimer);
          fadeTimer = window.setTimeout(() => dismissClickSpeech(), 4200);
        }
        return;
      }
      window.clearTimeout(fadeTimer);
      clickSpeech = fromClick;
      sayText = text;
      say.classList.remove('is-out');
      say.classList.add('is-on');
      sayLine.textContent = text;
      // Une seule mesure par phrase, jamais dans la boucle.
      sayW = Math.max(40, say.offsetWidth);
      sayH = Math.max(24, say.offsetHeight);
      if (fromClick) fadeTimer = window.setTimeout(() => dismissClickSpeech(), 4200);
    };

    const dismissClickSpeech = () => {
      if (!clickSpeech || !sayText) return;
      clickSpeech = false;
      say.classList.add('is-out');
      fadeTimer = window.setTimeout(() => hushSay(), 280);
    };

    const lineFor = (kind: string): string => {
      const lines = linesRef.current;
      const guide = guideCopyRef.current;
      const guiding = Boolean(guideTargetRef.current);
      switch (kind) {
        case 'home':
          return lines.home;
        case 'window':
        case 'hero':
          return lines.hero;
        case 'steps':
        case 'step':
          return lines.steps;
        case 'product':
          return lines.product;
        case 'band':
          return lines.band;
        case 'feature':
          return lines.features;
        case 'trust':
          return lines.trust;
        case 'plan':
          return lines.pricing;
        case 'cta':
          return lines.cta;
        case 'dock':
          return lines.dock;
        case 'logo':
          return guide.steps.logo;
        case 'search':
          return guide.steps.search;
        case 'launch':
          return guiding ? guide.steps.launch : lines.launch;
        case 'results':
          return guide.steps.results;
        case 'pipeline':
          return guide.steps.pipeline;
        case 'invite':
          return guide.steps.invite;
        default:
          return lines.hero;
      }
    };

    /* --- décollage -------------------------------------------------------- */

    const resolve = (p: Perch) => ({
      x: p.fixed ? p.x : p.x - window.scrollX,
      y: p.fixed ? p.y : p.y - window.scrollY,
    });

    const takeOff = (to: Perch) => {
      const b = to.fixed ? resolve(to) : { x: to.x, y: to.y };
      const debut = spawnSpin;
      spawnSpin = false;
      target = to;
      switchedAt = performance.now();
      pos.x = b.x;
      pos.y = b.y;
      pos.s = to.s;
      warp = 'in';
      warpT = 0;
      landT = 0;
      spawnDebut = debut;
      spawnFx = !debut;
      if (!reduced) spinVel += debut ? 28 : 11;
      if (to.kind === 'home') {
        hushSay();
        spokenFor = to.id;
      }
      needsRender = 3;
    };

    const vanish = () => {
      if (warp === 'out' || warp === 'away') return;
      warp = 'out';
      warpT = 0;
      spawnFx = true;
      if (!reduced) spinVel += 8;
      hushSay();
      needsRender = 3;
    };

    const poke = () => {
      if (!reduced) spinVel += target.kind === 'home' ? 9.2 : 7.6;
      idleKind = 1;
      idleT = 0;
      needsRender = 3;
    };

    /* --- surbrillance de la branche --------------------------------------- */

    let nearEl: HTMLElement | null = null;
    const markNear = (el: HTMLElement | null) => {
      if (el === nearEl) return;
      nearEl?.classList.remove('is-mascot-near');
      nearEl = el;
      nearEl?.classList.add('is-mascot-near');
    };

    /* --- choix de la branche ---------------------------------------------- */

    const screenY = (p: Perch, sy: number) => (p.fixed ? p.y : p.y - sy);

    const anyVisible = (sy: number): Perch | null => {
      const vh = window.innerHeight;
      for (const perch of registry.values()) {
        if (perch.kind === 'home' || perch.kind === 'dock') continue;
        if (!clearsNav(perch, sy)) continue;
        const y = screenY(perch, sy);
        if (y >= navCeiling() && y <= vh * 0.92) return perch;
      }
      return null;
    };

    const choose = (now: number, sy: number): Perch => {
      const g = guideTargetRef.current;
      if (g) {
        if (g === 'logo') return home;
        const el = document.querySelector<HTMLElement>(`[data-guide="${g}"]`);
        const perch = el ? measurePerch(el, perchSize()) : null;
        if (perch && clearsNav(perch, sy)) return perch;
        return home;
      }

      const onPage = target.kind !== 'home';
      if (sy < HOME_RETURN) return home;
      if (sy < HOME_LEAVE && !onPage) return home;

      const vh = window.innerHeight;
      const aim = vh * AIM;
      let dock: Perch | null = null;
      let best: Perch | null = null;
      let bestScore = Infinity;

      for (const perch of registry.values()) {
        const y = screenY(perch, sy);
        if (perch.kind === 'dock') {
          if (y > vh * 0.2 && y < vh * 0.86) dock = perch;
          continue;
        }
        if (!clearsNav(perch, sy)) continue;
        if (y < -vh * 0.12 || y > vh * 0.9) continue;
        const score = Math.abs(y - aim);
        if (score < bestScore) {
          bestScore = score;
          best = perch;
        }
      }

      if (dock && clearsNav(dock, sy)) return dock;

      const current = target.el ? (registry.get(target.el) ?? (onPage ? target : null)) : onPage ? target : null;

      const nextBelowNav = (): Perch | null => {
        let pick: Perch | null = null;
        let pickY = Infinity;
        for (const perch of registry.values()) {
          if (perch.kind === 'home' || perch.kind === 'dock') continue;
          if (!clearsNav(perch, sy)) continue;
          const y = screenY(perch, sy);
          if (y < navCeiling() || y > vh * 0.92) continue;
          if (y < pickY) {
            pickY = y;
            pick = perch;
          }
        }
        return pick;
      };

      if (!best) {
        const below = nextBelowNav();
        if (below) return below;
        if (current && current.kind !== 'home' && clearsNav(current, sy)) return current;
        if (sy > HOME_LEAVE) {
          for (const perch of registry.values()) {
            if (perch.kind === 'home' || perch.kind === 'dock') continue;
            if (!clearsNav(perch, sy)) continue;
            const y = screenY(perch, sy);
            if (y > -vh * 0.08 && y < vh * 0.92) return perch;
          }
        }
        if (sy > HOME_LEAVE) {
          const visible = anyVisible(sy);
          if (visible) return visible;
          if (current && clearsNav(current, sy)) return current;
        }
        return sy < HOME_RETURN ? home : anyVisible(sy) ?? current ?? home;
      }
      if (target.id === best.id) return best;

      if (current && current.kind !== 'home' && current.kind !== 'dock') {
        if (!clearsNav(current, sy)) return best;
        const curY = screenY(current, sy);
        const stillHere = curY > -vh * 0.06 && curY < vh * 0.88;
        const zoneChanged = perchZone(current) !== perchZone(best);
        if (stillHere) {
          if (zoneChanged) {
            const curScore = Math.abs(curY - aim);
            if (curScore <= bestScore + vh * 0.08) return current;
            return best;
          }
          const dwell = scrollSpeed > 120 ? DWELL * 0.45 : onLanding ? DWELL * 0.62 : DWELL;
          if (now - switchedAt < dwell) return current;
          const curScore = Math.abs(curY - aim);
          if (curScore < bestScore + vh * 0.16) return current;
        }
      }
      return best;
    };

    /* --- boucle ----------------------------------------------------------- */

    const applyFrame = (now: number) => {
      if (!model) return;
      const dt = Math.min(0.033, (now - lastT) / 1000) || 0.016;
      lastT = now;
      life += dt;

      if (document.documentElement.classList.contains('dark') !== lastTheme) lightsForTheme();

      const sy = window.scrollY;
      const dy = sy - lastScrollY;
      lastScrollY = sy;
      if (Math.abs(dy) > 0.5) {
        scrollAt = now;
        scrollSpeed = Math.abs(dy) / Math.max(dt, 0.008);
      } else if (now - scrollAt > scrollSettleMs(onLanding)) {
        scrollSpeed = 0;
      }
      const settled = now - scrollAt > scrollSettleMs(onLanding);

      if (warp === 'out') {
        warpT += dt;
        if (warpT >= WARP_OUT) {
          warp = 'away';
          warpT = 0;
        }
      }

      if (pickDue || warp === 'away' || !settled) {
        if (warp === 'away' || settled) {
          for (const [el, perch] of registry) {
            const fresh = measurePerch(el, perch.s);
            if (fresh) registry.set(el, { ...fresh, id: perch.id });
          }
          measureHome();
        }
      }

      const guided = Boolean(guideTargetRef.current);
      const nextPick = warp === 'in' ? null : choose(now, sy);

      if (warp === 'out' || warp === 'away') {
        if (nextPick) pending = nextPick;
      }

      if (warp === 'away') {
        const next = pending ?? nextPick ?? target;
        pending = null;
        takeOff(next);
      } else if (warp === 'idle' && nextPick) {
        const zoneChanged = perchZone(nextPick) !== perchZone(target);
        const perchY = screenY(target, sy);
        const currentGone =
          target.kind !== 'home' &&
          (perchY < -window.innerHeight * 0.08 || perchY > window.innerHeight * 0.92);
        if (nextPick.id !== target.id && (guided || zoneChanged || currentGone)) {
          pending = nextPick;
          vanish();
        } else if (nextPick.id === target.id) {
          target = nextPick;
          if (!guided) pickDue = false;
        }
      }
      if (target.kind === 'home') target = home;

      if (warp === 'in') {
        warpT += dt;
        const warpInDur = spawnDebut ? WARP_IN_SPAWN : WARP_IN;
        if (warpT >= warpInDur) {
          warp = 'idle';
          warpT = 0;
          spawnFx = false;
          spawnDebut = false;
          pickDue = false;
        }
      }

      /* Collée au document sur la page, fixe seulement dans la barre. */
      const pinned = target.fixed;
      const dest = pinned ? resolve(target) : { x: target.x, y: target.y };
      pos.x = dest.x;
      pos.y = dest.y;
      pos.s = target.s;
      const pin = pinned ? 'fixed' : 'absolute';
      if (host.style.position !== pin) host.style.position = pin;
      if (hit.style.position !== pin) hit.style.position = pin;

      const flying = warp !== 'idle';
      const parked = target.kind === 'home' || target.kind === 'dock';

      /* parole */
      const g = guideTargetRef.current;
      // La barre de navigation est le seul perchoir silencieux : la mascotte y
      // attend sans commenter. Partout ailleurs elle explique la zone.
      const mute = target.kind === 'home' && !g;
      if (!flying && !mute && !clickSpeech) {
        const line = lineFor(target.kind);
        if (line && target.id !== spokenFor) {
          spokenFor = target.id;
          speak(line);
        } else if (line && sayText && sayText !== line && !say.classList.contains('is-out')) {
          speak(line);
        }
      } else if (mute && !clickSpeech && sayText && spokenFor !== target.id) {
        hushSay();
      }
      if (g === 'logo' && target.id === 'home' && spokenFor !== 'guide:logo') {
        spokenFor = 'guide:logo';
        speak(guideCopyRef.current.steps.logo);
      }

      /* impatience : micro-gestes aléatoires, sans rebond */
      if (!reduced && !flying) {
        fidget += dt;
        if (fidget > fidgetIn) {
          fidget = 0;
          fidgetIn = onLanding ? 5.4 + Math.random() * 4.2 : 4.2 + Math.random() * 6.8;
          const roll = Math.random();
          if (roll < 0.28) {
            idleKind = 1;
            spinVel += (Math.random() > 0.5 ? 1 : -1) * (0.85 + Math.random() * 1.15);
          } else if (roll < 0.54) {
            idleKind = 2;
            idleT = 0;
          } else if (roll < 0.78) {
            idleKind = 3;
            idleT = 0;
          } else {
            idleKind = 0;
          }
        }
        if (idleKind === 2 || idleKind === 3) idleT += dt;
      }

      /* rotation — jamais figée : spin d'ambiance + impulsions */
      const spinning = !reduced || Math.abs(spinVel) > 0.18;
      const viewX = pinned ? pos.x : pos.x - window.scrollX;
      const viewY = pinned ? pos.y : pos.y - window.scrollY;
      const lookGain = reduced || flying ? 0 : spinning ? 0.08 : 0.35;
      const nx = (pointer.x - viewX) / Math.max(160, window.innerWidth * 0.36);
      const ny = (pointer.y - viewY) / Math.max(110, window.innerHeight * 0.3);
      lookY = smoothTo(lookY, clamp(-nx, -1, 1) * 0.18 * lookGain, dt, 0.15);
      lookX = smoothTo(lookX, clamp(ny, -1, 1) * 0.12 * lookGain, dt, 0.17);
      const face = REST_YAW + lookY;
      if (!reduced) {
        spinY += (flying ? AMBIENT_SPIN_FLYING : AMBIENT_SPIN) * dt;
        spinY += spinVel * dt;
        const tauF = flying ? 0.36 : 0.72 + Math.min(0.4, Math.abs(spinVel) * 0.045);
        spinVel *= Math.exp(-dt / tauF);
        spinY += angleDelta(spinY, face) * (1 - Math.exp(-dt / 3.2)) * 0.035;
      } else {
        spinY += spinVel * dt;
        const tauF = flying ? 0.36 : 0.72 + Math.min(0.4, Math.abs(spinVel) * 0.045);
        spinVel *= Math.exp(-dt / tauF);
        if (Math.abs(spinVel) < 0.12 && !flying) {
          spinVel = 0;
          spinY = smoothAngle(spinY, face, dt, 0.28);
        }
      }

      /* atterrissage et accroupissement */
      if (landT < 5) landT += dt;
      const flutter = 0;
      const breathe = flying ? 0 : Math.sin(life * 1.5) * (parked ? 0.7 : 0.95);
      const amp = parked ? 0.55 : 1;
      const nod = Math.sin(life * 1.15) * 0.03 * amp;
      const tilt = Math.sin(life * 0.85 + 0.8) * 0.028 * amp;
      const idleLeanX = flying ? 0 : idleKind === 2 ? Math.sin(idleT * 2.1) * 0.055 : 0;
      const idleLeanZ = flying ? 0 : idleKind === 2 ? Math.cos(idleT * 1.65) * 0.038 : 0;
      const idleDrift = flying ? 0 : idleKind === 3 ? Math.sin(idleT * 1.35) * 1.8 : 0;
      const lean = flying ? 0 : tilt + lookY * 0.12 + idleLeanZ;

      const drawX = pos.x + idleDrift * 0.35;
      const drawY = pos.y + breathe + flutter + idleDrift * 0.22;
      const viewDrawX = pinned ? drawX : drawX - window.scrollX;
      const viewDrawY = pinned ? drawY : drawY - window.scrollY;

      /* rendu : le canvas suit la mascotte, il ne couvre pas l'écran */
      let vis = 1;
      let pop = 1;
      const warpInDur = spawnDebut ? WARP_IN_SPAWN : WARP_IN;
      if (warp === 'out') {
        const t = easeInOutCubic(clamp(warpT / WARP_OUT));
        vis = 1 - t;
        pop = 1 - t * 0.44;
      } else if (warp === 'away') {
        vis = 0;
        pop = 0.48;
      } else if (warp === 'in') {
        const t = easeInOutCubic(clamp(warpT / warpInDur));
        vis = t;
        pop = spawnDebut ? 0.42 + t * 0.58 : 0.56 + t * 0.44;
      }
      if (flying && !reduced) spinVel = Math.max(spinVel, spawnDebut ? 4.8 : 3.8);
      const warpScale = clamp(pos.s / WARP_SIZE_REF, 0.58, 1.38).toFixed(3);
      const ringMul = spawnDebut && warp === 'in' ? 1.14 : 1;
      const warpRing = Math.round(clamp(pos.s * 0.54 * ringMul, 22, 48));
      const warpGlow = Math.round(warpRing * 0.76);
      if (host.style.getPropertyValue('--lp-warp-scale') !== warpScale) {
        host.style.setProperty('--lp-warp-scale', warpScale);
      }
      if (host.style.getPropertyValue('--lp-warp-ring') !== `${warpRing}px`) {
        host.style.setProperty('--lp-warp-ring', `${warpRing}px`);
        host.style.setProperty('--lp-warp-glow', `${warpGlow}px`);
      }
      const scale = (WORLD_H * pos.s) / stageSize;
      model.position.set(0, 0, 0);
      model.rotation.set(0.04 + nod + lookX + idleLeanX, spinY, lean);
      model.scale.set(scale * pop, scale * pop, scale * pop);
      const inner = model.children[0] as Group | undefined;
      if (inner) inner.rotation.set(nod * 0.35 + lookX * 0.45, lookY * 0.28, tilt * 0.55);

      host.style.transform = `translate3d(${(drawX - stageSize / 2).toFixed(1)}px,${(drawY - stageSize / 2).toFixed(1)}px,0)`;
      const hitMin = isMobileViewport() ? 48 : 34;
      const hitSize = Math.round(Math.max(hitMin, pos.s * 0.92));
      if (hit.dataset.size !== String(hitSize)) {
        hit.dataset.size = String(hitSize);
        hit.style.width = `${hitSize}px`;
        hit.style.height = `${hitSize}px`;
      }
      hit.style.transform = `translate3d(${(drawX - hitSize / 2).toFixed(1)}px,${(drawY - hitSize / 2).toFixed(1)}px,0)`;

      /* lettres remuées — désactivé sur la landing (centaines de nœuds DOM). */
      if (!onLanding) {
        if (fieldDue && settled) {
          fieldDue = false;
          clearField(field);
          field = buildField();
        }
        const brisk = flying || scrollSpeed > 640;
        const stirRadius = reduced
          ? 0
          : brisk
            ? pos.s * 2.4 + 120
            : target.kind === 'home' || target.kind === 'dock'
              ? 0
              : pos.s * 0.85 + 34;
        stirField(
          field,
          pinned ? drawX + window.scrollX : drawX,
          pinned ? drawY + window.scrollY : drawY,
          stirRadius,
          dt,
          brisk,
        );
      }

      markNear(flying ? null : target.el);

      const menuOpen = Boolean(navWrap?.classList.contains('is-open'));
      const root = document.documentElement;
      root.style.setProperty('--lp-mx', clamp(viewDrawX / window.innerWidth, 0, 1).toFixed(4));
      root.style.setProperty('--lp-my', clamp(viewDrawY / window.innerHeight, 0, 1).toFixed(4));
      root.style.setProperty('--lp-mascot-active', flying || menuOpen ? '0' : '1');

      /* couches et logos, écritures uniquement sur changement */
      const guiding = Boolean(g);
      const departed = target.id !== 'home';
      const layer = guiding ? 'guide' : menuOpen || departed ? 'front' : 'nav';
      if (host.dataset.layer !== layer) {
        host.dataset.layer = layer;
        host.classList.toggle('is-nav', layer === 'nav');
        host.classList.toggle('is-front', layer === 'front');
        host.classList.toggle('is-guide', layer === 'guide');
        hit.classList.toggle('is-nav', layer === 'nav');
        hit.classList.toggle('is-guide', guiding);
      }
      const hidden = menuOpen && !guiding ? 0 : vis;
      const opacity = hidden.toFixed(3);
      if (host.style.opacity !== opacity) host.style.opacity = opacity;
      hit.style.pointerEvents = hidden < 0.25 ? 'none' : 'auto';
      const warpClass = `${warp === 'out' ? 'out' : warp === 'in' ? 'in' : warp === 'away' ? 'away' : ''}${spawnDebut ? '-spawn' : spawnFx ? '-fx' : ''}`;
      if (host.dataset.warp !== warpClass) {
        host.dataset.warp = warpClass;
        host.classList.toggle('is-warp-out', warp === 'out');
        host.classList.toggle('is-warp-in', warp === 'in');
        host.classList.toggle('is-warp-spawn', spawnDebut && warp === 'in');
        host.classList.toggle('is-warp-fx', spawnFx && (warp === 'in' || warp === 'out'));
        host.classList.toggle('is-away', warp === 'away');
      }
      if (warp === 'idle') {
        spawnFx = false;
        spawnDebut = false;
      }
      const atHome = target.id === 'home';
      const homeState = `${atHome ? 1 : 0}${spinning || flying ? 1 : 0}${guiding || !menuOpen ? 1 : 0}${vis > 0.45 ? 1 : 0}`;
      if (host.dataset.homeState !== homeState) {
        host.dataset.homeState = homeState;
        for (const el of logoSlots) {
          const on = atHome && el === logoEl && (guiding || !menuOpen) && vis > 0.45;
          el.classList.toggle('is-3d', on);
          el.classList.toggle('is-spinning', on && (spinning || flying));
        }
      }
      const docked = target.kind === 'dock';
      const dockState = `${docked ? 1 : 0}${spinning || flying ? 1 : 0}`;
      if (host.dataset.dockState !== dockState) {
        host.dataset.dockState = dockState;
        for (const el of footerSlots) {
          el.classList.toggle('is-3d', docked);
          el.classList.toggle('is-spinning', docked && (spinning || flying));
        }
      }

      /* bulle : même repère que la mascotte (fixe nav, absolu page). Collée au scroll. */
      if (flying) sayInited = false;
      const fading = say.classList.contains('is-out');
      const talking = (!menuOpen || guiding) && !flying && (Boolean(sayText) || fading || guiding);
      if (say.classList.contains('is-on') !== talking) say.classList.toggle('is-on', talking);
      if (talking) {
        if (say.style.position !== pin) {
          say.style.position = pin;
          sayInited = false;
          lastSayLeft = -1;
          lastSayTop = -1;
        }
        const pad = 12;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const sx = window.scrollX;
        const sy = window.scrollY;
        const body = Math.max(28, pos.s * 0.55);
        const gap = Math.max(18, pos.s * 0.24);
        const leftSlot = viewDrawX - body - gap - sayW;
        const rightSlot = viewDrawX + body + gap;
        const canLeft = leftSlot >= pad;
        const canRight = rightSlot + sayW <= vw - pad;
        const fromRight = canLeft || !canRight;
        let targetLeft = fromRight ? leftSlot : rightSlot;
        let targetTop = viewDrawY - sayH * 0.5;
        if (!canLeft && !canRight) {
          targetLeft = clamp(viewDrawX - sayW * 0.5, pad, Math.max(pad, vw - sayW - pad));
          targetTop = viewDrawY - body - gap - sayH;
          if (targetTop < pad) targetTop = viewDrawY + body + gap;
        } else {
          targetLeft = clamp(targetLeft, pad, Math.max(pad, vw - sayW - pad));
        }
        const hitX = targetLeft < viewDrawX + body && targetLeft + sayW > viewDrawX - body;
        const hitY = targetTop < viewDrawY + body && targetTop + sayH > viewDrawY - body;
        if (hitX && hitY) targetTop = viewDrawY - body - gap - sayH;
        targetTop = clamp(targetTop, pad, Math.max(pad, vh - sayH - pad));
        if (!pinned) {
          targetLeft += sx;
          targetTop += sy;
        }
        const scrolling = !settled || scrollSpeed > 8;
        if (!sayInited || scrolling) {
          sayX = targetLeft;
          sayY = targetTop;
          sayInited = true;
        } else {
          const k = 1 - Math.exp(-dt / 0.2);
          sayX += (targetLeft - sayX) * k;
          sayY += (targetTop - sayY) * k;
        }
        const l = Math.round(sayX);
        const t = Math.round(sayY);
        if (l !== lastSayLeft) {
          lastSayLeft = l;
          say.style.left = `${l}px`;
        }
        if (t !== lastSayTop) {
          lastSayTop = t;
          say.style.top = `${t}px`;
        }
        say.classList.toggle('is-from-right', fromRight);
        say.classList.toggle('is-from-left', !fromRight);
      }
      say.classList.toggle('is-nav-say', parked);
      say.classList.toggle('is-guide-say', guiding);

      if (host.dataset.departed !== String(departed)) {
        host.dataset.departed = String(departed);
        onProgressRef.current?.(departed ? 1 : 0, departed);
      }

      /* faut-il vraiment redessiner ? */
      const busy = Boolean(
        flying ||
          !settled ||
          landT < 0.7 ||
          spinning ||
          Math.abs(pos.x - dest.x) > 0.3 ||
          Math.abs(pos.y - dest.y) > 0.3 ||
          field?.live.size,
      );
      idleFrames = busy ? 0 : idleFrames + 1;
      if (busy || !reduced) needsRender = 2;
      else needsRender = Math.max(needsRender, 1);
    };

    let modalOpen = false;

    const tick = (now: number) => {
      if (dead) return;
      if (document.hidden) {
        frame = requestAnimationFrame(tick);
        return;
      }
      applyFrame(now);
      if (!modalOpen && needsRender > 0) {
        renderer.render(scene, camera);
        needsRender--;
      }
      frame = requestAnimationFrame(tick);
    };

    // La carte de la landing insère des épingles en continu. Sans garde-fou,
    // chaque insertion relancerait une mesure complète de la page.
    let domTimer = 0;
    let glyphCount = 0;
    const domWatch = new MutationObserver(() => {
      window.clearTimeout(domTimer);
      domTimer = window.setTimeout(() => {
        if (dead) return;
        modalOpen = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(
          (el) => !el.classList.contains('app-guide'),
        );
        refreshSlots();
        syncRegistry();
        const glyphs = document.querySelectorAll('.lp-glyph').length;
        if (glyphs !== glyphCount) {
          glyphCount = glyphs;
          fieldDue = true;
        }
        needsRender = 2;
      }, 420);
    });
    // La landing insère des épingles carte en continu : l'observateur global
    // relançait des remesures en boucle et faisait saccader la mascotte.
    if (!onLanding) domWatch.observe(document.body, { childList: true, subtree: true });

    host.style.opacity = '0';

    /* --- montage ---------------------------------------------------------- */

    let attachedSource: MascotSource | null = null;
    let booted = false;

    const boot = () => {
      if (booted) return;
      booted = true;
      syncRegistry();
      measureHome();
      target = home;
      const start = resolve(home);
      pos.x = start.x;
      pos.y = start.y;
      pos.s = home.s;
      source.classList.remove('is-3d-wait');
      lastT = performance.now();
      takeOff(home);
      tick(lastT);
      window.clearTimeout(introTimer);
    };

    const mount = (object: Object3D, modelSource: MascotSource) => {
      if (dead) return;
      if (attachedSource === modelSource && model) return;
      if (attachedSource && attachedSource !== 'fallback' && modelSource === 'fallback') return;
      try {
        const root =
          modelSource === 'gltf' || modelSource === 'fbx' ? (object.clone(true) as Object3D) : object;
        const wrap = buildMascot(root, modelSource);
        if (modelSource !== 'fallback' && meshCount(wrap) < 1) {
          if (!model) mount(fallbackPin(), 'fallback');
          return;
        }
        if (model) scene.remove(model);
        model = wrap;
        attachedSource = modelSource;
        scene.add(wrap);
        lightsForTheme();
        boot();
        needsRender = 3;
      } catch {
        if (!model) mount(fallbackPin(), 'fallback');
      }
    };

    if (modelShared) mount(modelShared.object, modelShared.source);

    onModelReady(({ object, source: modelSource }) => {
      if (dead) return;
      mount(object, modelSource);
    });

    if (!booted) mount(fallbackPin(), 'fallback');

    /* --- écouteurs -------------------------------------------------------- */

    const themeWatch = new MutationObserver(lightsForTheme);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (dead) return;
        syncRenderer();
        refreshSlots();
        syncRegistry();
        fieldDue = true;
        needsRender = 2;
      }, 130);
    };
    window.addEventListener('resize', onResize);
    const viewport = window.visualViewport;
    const onViewport = () => {
      pickDue = true;
      needsRender = 2;
    };
    viewport?.addEventListener('resize', onViewport);
    if (onLanding) window.addEventListener('load', onViewport, { once: true });

    const onPointer = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      needsRender = Math.max(needsRender, 1);
    };
    window.addEventListener('pointermove', onPointer, { passive: true });

    const onScroll = () => {
      pickDue = true;
      needsRender = 3;
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    const onVisibility = () => {
      if (dead || document.hidden) return;
      lastT = performance.now();
      needsRender = 2;
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onHit = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      poke();
    };
    hit.addEventListener('click', onHit);
    source.addEventListener('click', onHit);

    if (document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        if (dead) return;
        syncRegistry();
        fieldDue = true;
      });
    }

    return () => {
      dead = true;
      window.clearTimeout(fadeTimer);
      window.clearTimeout(introTimer);
      window.clearTimeout(resizeTimer);
      cancelAnimationFrame(frame);
      markNear(null);
      document.documentElement.style.removeProperty('--lp-mx');
      document.documentElement.style.removeProperty('--lp-my');
      document.documentElement.style.removeProperty('--lp-mascot-active');
      window.clearTimeout(domTimer);
      themeWatch.disconnect();
      domWatch.disconnect();
      window.removeEventListener('resize', onResize);
      viewport?.removeEventListener('resize', onViewport);
      if (onLanding) window.removeEventListener('load', onViewport);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      hit.removeEventListener('click', onHit);
      source.removeEventListener('click', onHit);
      source.classList.remove('is-3d', 'is-3d-wait', 'is-spinning');
      document.querySelectorAll<HTMLElement>('.app-logo-slot, .lp-nav-logo, .lp-footer-logo').forEach((el) => {
        el.classList.remove('is-3d', 'is-3d-wait', 'is-spinning');
      });
      clearField(field);
      scene.clear();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [sourceRef]);

  return createPortal(
    <>
      <div ref={hostRef} className="lp-logo-canvas is-nav" aria-hidden />
      <button type="button" ref={hitRef} className="lp-mascot-hit" aria-label={m.mascot.home} />
      <div ref={sayRef} className="lp-mascot-say" role="status" aria-live="polite">
        <p className="lp-mascot-say-text" />
        {guideActions && (
          <div className="lp-mascot-say-actions">
            <button type="button" className="app-guide-skip" onClick={guideActions.onSkip}>
              {m.guide.skip}
            </button>
            <button type="button" className="app-guide-next" onClick={guideActions.onNext}>
              {guideActions.last ? m.guide.done : m.guide.next}
            </button>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
