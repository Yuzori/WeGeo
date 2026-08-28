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
import { useI18n } from '../i18n';

const FBX_URL = '/prospy.fbx?full=1';
const LIME_DAY = 0xd2f54c;
const LIME_NIGHT = 0xd6fa58;

type FbxReady = { object: Object3D; fromFbx: boolean };
let fbxShared: FbxReady | null = null;
let fbxStarted = false;
const fbxWaiters: Array<(ready: FbxReady) => void> = [];

function startFbxLoad() {
  if (fbxStarted || typeof window === 'undefined') return;
  fbxStarted = true;
  const loader = new FBXLoader();
  loader.load(
    FBX_URL,
    (fbx) => {
      fbxShared = { object: fbx, fromFbx: true };
      fbxWaiters.splice(0).forEach((fn) => fn(fbxShared!));
    },
    undefined,
    () => {
      fbxShared = { object: fallbackPin(), fromFbx: false };
      fbxWaiters.splice(0).forEach((fn) => fn(fbxShared!));
    },
  );
}

function onFbxReady(cb: (ready: FbxReady) => void) {
  startFbxLoad();
  if (fbxShared) cb(fbxShared);
  else fbxWaiters.push(cb);
}

startFbxLoad();

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

function brandLime(dark: boolean): number {
  return dark ? LIME_NIGHT : LIME_DAY;
}

function paintBrand(root: Object3D, dark: boolean) {
  const hex = brandLime(dark);
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.castShadow = false;
    node.receiveShadow = false;
    node.frustumCulled = false;
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

function extractLogo(root: Object3D): Group {
  root.updateMatrixWorld(true);
  const group = new Group();
  const pos = new Vector3();
  const quat = new Quaternion();
  const scl = new Vector3();
  const seen = new Set<string>();
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    if (!/curve002|curve003/i.test(node.name)) return;
    const key = node.name.replace(/\.\d+$/, '').toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const mesh = node.clone();
    mesh.geometry = node.geometry.clone();
    mesh.material = Array.isArray(node.material) ? node.material.map((item) => item.clone()) : node.material.clone();
    node.matrixWorld.decompose(pos, quat, scl);
    mesh.position.copy(pos);
    mesh.quaternion.copy(quat);
    mesh.scale.copy(scl);
    mesh.name = node.name;
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
  inner.scale.multiplyScalar(1 / Math.max(size.y, 1e-4));
  inner.updateMatrixWorld(true);
  box.setFromObject(inner);
  box.getCenter(center);
  inner.position.sub(center);
}

function buildMascot(object: Object3D, fromFbx: boolean): Group {
  const extracted = fromFbx ? extractLogo(object) : object;
  const inner = new Group();
  inner.add(extracted);
  const wrap = new Group();
  wrap.add(inner);
  paintBrand(wrap, document.documentElement.classList.contains('dark'));
  refit(wrap);
  return wrap;
}

function worldAtPixel(camera: PerspectiveCamera, cx: number, cy: number) {
  const dist = camera.position.z;
  const vFov = (camera.fov * Math.PI) / 180;
  const worldH = 2 * Math.tan(vFov / 2) * dist;
  return {
    x: (cx / window.innerWidth - 0.5) * worldH * camera.aspect,
    y: -(cy / window.innerHeight - 0.5) * worldH,
    unit: worldH / window.innerHeight,
  };
}

type Perch = {
  id: string;
  el: HTMLElement | null;
  x: number;
  y: number;
  s: number;
  kind: string;
  line: string;
  top: number;
  off?: boolean;
};

const elIds = new WeakMap<HTMLElement, number>();
let elSeq = 0;
function eid(el: HTMLElement): number {
  let id = elIds.get(el);
  if (id == null) {
    id = ++elSeq;
    elIds.set(el, id);
  }
  return id;
}

function pickVisibleLogo(source: HTMLElement | null): HTMLElement | null {
  const nodes = [...document.querySelectorAll<HTMLElement>('.lp-nav-logo, .app-logo-slot')];
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

function navSize(): number {
  const bar = document.querySelector('.lp-nav') as HTMLElement | null;
  if (bar) {
    const h = bar.getBoundingClientRect().height || 48;
    return Math.round(Math.min(36, Math.max(30, h * 0.72)));
  }
  const slot = pickVisibleLogo(null);
  const h = slot?.getBoundingClientRect().height ?? 42;
  return Math.round(clamp(h * 0.88, 32, 44));
}

function perchSize(): number {
  const w = window.innerWidth;
  if (w < 640) return Math.round(clamp(w * 0.13, 48, 58));
  return 70;
}

function homePerch(source: HTMLElement | null, line: string): Perch {
  const mark = pickVisibleLogo(source);
  const logo = mark?.getBoundingClientRect();
  const bar = document.querySelector('.lp-nav')?.getBoundingClientRect();
  const s = navSize();
  const open = Boolean(logo && logo.width > 8);
  const y = open && logo ? logo.top + logo.height / 2 : bar ? bar.top + bar.height / 2 : 24;
  return {
    id: 'home',
    el: mark ?? source,
    x: open && logo ? logo.left + logo.width / 2 : bar ? bar.left + 22 : 28,
    y,
    s,
    kind: 'home',
    line,
    top: y,
  };
}

function sitOn(el: HTMLElement, lines: Record<string, string>, mode: 'strict' | 'near' = 'strict'): Perch | null {
  const r = el.getBoundingClientRect();
  if (r.width < 16 || r.height < 16) return null;
  const vh = window.innerHeight;
  const kind = el.dataset.mascot ?? el.dataset.guide ?? 'spot';

  if (kind === 'dock') {
    const inView = r.bottom > 8 && r.top < vh - 8;
    const approaching = r.top < vh + 280;
    if (mode === 'strict' && !inView) return null;
    if (mode === 'near' && !inView && !approaching) return null;
    return {
      id: `${eid(el)}:dock`,
      el,
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      s: navSize(),
      kind,
      line: lines.home,
      top: r.top,
      off: !inView,
    };
  }

  const vis = r.bottom > 110 && r.top < vh - 48;
  const approaching = r.top < vh + 520 && r.bottom > 80;
  if (mode === 'strict' && !vis) return null;
  if (mode === 'near' && !vis && !approaching) return null;

  const s = perchSize();
  let x = r.left + 28;
  let y = r.top + 22;
  if (kind === 'feature' || kind === 'trust') {
    x = r.left + 32;
    y = r.top + 18;
  } else if (kind === 'plan') {
    x = r.right - 32;
    y = r.top + 20;
  } else if (kind === 'launch' || kind === 'cta') {
    x = r.left + r.width * 0.5;
    y = vis ? r.top + 8 : vh * 0.42;
  } else if (kind === 'pipeline' || kind === 'search' || kind === 'results' || kind === 'invite') {
    x = r.left + 56;
    y = r.top + 22;
  }
  x = clamp(x, 64, window.innerWidth - 36);
  if (!vis && approaching) {
    y = clamp(r.top + 18, vh * 0.5, vh - 64);
  } else {
    y = clamp(y, 108, vh - 56);
  }
  const line = lines[kind] ?? lines.hero;
  return { id: `${eid(el)}:${kind}`, el, x, y, s, kind, line, top: r.top, off: !vis };
}

function collectPerches(source: HTMLElement | null, lines: Record<string, string>): Perch[] {
  const list: Perch[] = [homePerch(source, lines.home)];
  document.querySelectorAll<HTMLElement>('[data-mascot]').forEach((el) => {
    const spot = sitOn(el, lines, 'strict') ?? sitOn(el, lines, 'near');
    if (spot) list.push(spot);
  });
  return list;
}

function visiblyHere(perch?: Perch): boolean {
  if (!perch || perch.off) return false;
  if (perch.kind === 'dock') return true;
  return perch.top > 100 && perch.top < window.innerHeight * 0.82;
}

function pickPerch(perches: Perch[], currentId: string, scrollY: number, rushing: boolean): Perch {
  const home = perches[0];
  const vh = window.innerHeight;
  if (scrollY < 72) return home;
  const spots = perches.filter((p) => p.id !== 'home');
  if (!spots.length) return home;

  const dock = spots.find((p) => p.kind === 'dock');
  if (dock && !dock.off && dock.top < vh * 0.78) return dock;

  const inBand = (p: Perch) => p.kind !== 'dock' && !p.off && p.top > 100 && p.top < vh * 0.78;
  const vis = spots.filter(inBand);
  const aim = Math.min(210, vh * 0.32);
  const score = (p: Perch) => Math.abs(p.top - aim);
  if (vis.length) {
    const ranked = [...vis].sort((a, b) => score(a) - score(b) || a.x - b.x);
    const best = ranked[0];
    if (rushing) return best;
    const cur = vis.find((p) => p.id === currentId);
    if (cur && score(cur) <= score(best) + 40) return cur;
    return best;
  }
  const coming = spots.filter((p) => p.kind !== 'dock' && p.off && p.top > 100).sort((a, b) => a.top - b.top);
  if (coming.length) return coming[0];
  if (dock) return dock;
  return spots.find((p) => p.id === currentId) ?? spots[spots.length - 1] ?? home;
}

const glyphOff = new WeakMap<HTMLElement, { x: number; y: number }>();

function stirCopy(mx: number, my: number, radius: number, dt: number, rushing: boolean) {
  const glyphs = document.querySelectorAll<HTMLElement>('.lp-glyph');
  if (!glyphs.length) return;
  const kIn = 1 - Math.exp(-dt / (rushing ? 0.05 : 0.07));
  const kOut = 1 - Math.exp(-dt / 0.3);
  const maxForce = Math.min(46, radius * 0.2);
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    const box = g.getBoundingClientRect();
    if (box.width < 1) continue;
    const cur = glyphOff.get(g) ?? { x: 0, y: 0 };
    const restX = box.left + box.width * 0.5 - cur.x;
    const restY = box.top + box.height * 0.5 - cur.y;
    let tx = 0;
    let ty = 0;
    if (radius >= 8 && box.bottom > -80 && box.top < window.innerHeight + 80) {
      const dx = restX - mx;
      const dy = restY - my;
      const d2 = dx * dx + dy * dy;
      const reach = radius * radius;
      if (d2 < reach && d2 > 1) {
        const d = Math.sqrt(d2);
        const t = 1 - d / radius;
        const force = t * maxForce;
        tx = (dx / d) * force;
        ty = (dy / d) * force * 0.38;
      }
    }
    const k = Math.hypot(tx, ty) > Math.hypot(cur.x, cur.y) + 0.3 ? kIn : kOut;
    cur.x += (tx - cur.x) * k;
    cur.y += (ty - cur.y) * k;
    if (Math.abs(cur.x) < 0.12 && Math.abs(cur.y) < 0.12) {
      g.style.transform = '';
      glyphOff.delete(g);
    } else {
      glyphOff.set(g, cur);
      g.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
    }
  }
}

function sayOverlap(ax: number, ay: number, aw: number, ah: number, ignore: HTMLElement | null, pad = 6): number {
  const nodes = document.querySelectorAll<HTMLElement>(
    'h1, h2, h3, .lp-h2, .lp-btn, .lp-command, .lp-chip, .lp-hero-lead, .lp-hero-ctas, .lp-frame, .lp-plan, .lp-feature, .lp-hero-mocks, .app-sidebar',
  );
  let area = 0;
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (ignore && (el === ignore || ignore.contains(el) || el.contains(ignore))) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const ix = Math.max(0, Math.min(ax + aw, r.right + pad) - Math.max(ax, r.left - pad));
    const iy = Math.max(0, Math.min(ay + ah, r.bottom + pad) - Math.max(ay, r.top - pad));
    const heading = el.matches('h1, h2, h3, .lp-h2');
    area += ix * iy * (heading ? 10 : 1);
  }
  return area;
}

function clearStir() {
  document.querySelectorAll<HTMLElement>('.lp-glyph').forEach((g) => {
    g.style.transform = '';
  });
}

export function LogoFlight({
  sourceRef,
  onProgress,
  guideTarget = null,
}: {
  sourceRef: RefObject<HTMLAnchorElement | null>;
  onProgress?: (progress: number, departed: boolean) => void;
  guideTarget?: string | null;
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
    const source = sourceRef.current;
    if (!host || !hit || !say || !source) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let dead = false;
    let frame = 0;
    let model: Group | null = null;
    let lastTheme = document.documentElement.classList.contains('dark');
    const nearNow = new Set<HTMLElement>();

    const pos = { x: 0, y: 0, s: 40 };
    let spinY = 0.22;
    let spinVel = 0;
    let hop = 0;
    let lastT = performance.now();
    let destId = 'home';
    let flying = false;
    let arcSpan = 1;
    const flightTo = { x: 0, y: 0, s: 40 };
    let departed = false;
    let clickI = 0;
    let life = 0;
    let lastScrollY = window.scrollY;
    let spokenFor = 'home';
    let hadGuide = Boolean(guideTarget);
    let lookX = 0;
    let lookY = 0;
    let fidget = 0;
    let fidgetIn = 3;
    const pointer = { x: window.innerWidth * 0.5, y: 40 };

    const scene = new Scene();
    const camera = new PerspectiveCamera(28, 1, 0.5, 40);
    camera.position.set(0, 0, 8);

    const hemi = new HemisphereLight(0xf4f7ea, 0x1a2214, 1);
    const key = new DirectionalLight(0xfff6e0, 1.15);
    key.position.set(2.4, 4.2, 6);
    const fill = new AmbientLight(0xd5ddc4, 0.38);
    scene.add(hemi, key, fill);

    const renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(1.25, window.devicePixelRatio || 1));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NoToneMapping;
    host.appendChild(renderer.domElement);

    const fit = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      host.style.width = `${w}px`;
      host.style.height = `${h}px`;
    };
    fit();

    const lightsForTheme = () => {
      const dark = document.documentElement.classList.contains('dark');
      lastTheme = dark;
      hemi.intensity = dark ? 1.05 : 1.15;
      key.intensity = dark ? 1.2 : 1.35;
      fill.intensity = dark ? 0.42 : 0.52;
      if (model) paintBrand(model, dark);
    };
    lightsForTheme();

    let clickSpeech = false;
    let fadeTimer = 0;
    let introTimer = 0;

    const hushSay = () => {
      window.clearTimeout(fadeTimer);
      clickSpeech = false;
      say.classList.remove('is-out', 'is-on');
      say.textContent = '';
    };

    const speak = (text: string, fromClick = false) => {
      if (!text) return;
      window.clearTimeout(fadeTimer);
      clickSpeech = fromClick;
      say.classList.remove('is-out');
      say.classList.add('is-on');
      say.textContent = text;
      if (fromClick) {
        fadeTimer = window.setTimeout(() => dismissClickSpeech(), 4200);
      }
    };

    const dismissClickSpeech = () => {
      if (!clickSpeech || !say.textContent) return;
      clickSpeech = false;
      say.classList.add('is-out');
      fadeTimer = window.setTimeout(() => hushSay(), 280);
    };

    const poke = () => {
      hop = destId === 'home' ? 0.38 : 0.5;
      if (!reduced) spinVel += destId === 'home' ? 12.6 : 10.8;
      if (guideTargetRef.current) return;
      const clicks = linesRef.current.click;
      speak(clicks[clickI % clicks.length], true);
      clickI += 1;
    };

    const clearNear = () => {
      for (const el of nearNow) el.classList.remove('is-mascot-near');
      nearNow.clear();
    };

    const markNear = (el: HTMLElement | null) => {
      if (el && !nearNow.has(el)) {
        el.classList.add('is-mascot-near');
        nearNow.add(el);
      }
      for (const node of nearNow) {
        if (node !== el) {
          node.classList.remove('is-mascot-near');
          nearNow.delete(node);
        }
      }
    };

    const startFlight = (to: Perch, rushing = false) => {
      const fromHome = destId === 'home' && to.id !== 'home';
      const dist = Math.hypot(to.x - pos.x, to.y - pos.y);
      flightTo.x = to.x;
      flightTo.y = to.y;
      flightTo.s = to.s;
      arcSpan = Math.max(1, dist);
      flying = dist > 14;
      destId = to.id;
      if (to.kind === 'home' || to.kind === 'dock') {
        hushSay();
        spokenFor = to.kind === 'dock' ? to.id : 'home';
      } else if (to.line) {
        speak(to.line);
        spokenFor = to.id;
      } else {
        hushSay();
      }
      hop = Math.max(hop, fromHome ? 0.58 : rushing ? 0.28 : 0.44);
      if (!reduced) spinVel += fromHome ? 3.6 : rushing ? 1.8 : 2.5;
    };

    const applyFrame = (now: number) => {
      if (!model) return;
      const mark = sourceRef.current;
      if (!mark) return;

      const dt = Math.min(0.033, (now - lastT) / 1000) || 0.016;
      lastT = now;
      life += dt;
      const dark = document.documentElement.classList.contains('dark');
      if (dark !== lastTheme) lightsForTheme();

      const sy = window.scrollY;
      const rawSpd = (sy - lastScrollY) / Math.max(dt, 0.008);
      lastScrollY = sy;
      const rushing = Math.abs(rawSpd) > 640;

      const lines = linesRef.current;
      const guide = guideCopyRef.current;
      const g = guideTargetRef.current;
      if (!g && hadGuide) {
        hushSay();
        spokenFor = 'home';
      }
      hadGuide = Boolean(g);
      const lineMap: Record<string, string> = {
        home: lines.home,
        window: lines.hero,
        hero: lines.hero,
        product: lines.product,
        feature: lines.features,
        trust: lines.trust,
        plan: lines.pricing,
        cta: lines.hero,
        logo: guide.steps.logo,
        search: guide.steps.search,
        launch: g ? guide.steps.launch : lines.product,
        results: guide.steps.results,
        pipeline: guide.steps.pipeline,
        invite: guide.steps.invite,
      };
      const home = homePerch(mark, lineMap.home);
      let next: Perch;
      let perchLive: Perch | undefined;
      if (g) {
        if (g === 'logo') next = home;
        else {
          const el = document.querySelector<HTMLElement>(`[data-guide="${g}"]`);
          next = (el && sitOn(el, lineMap, 'near')) || home;
        }
        perchLive = next;
      } else {
        const perches = collectPerches(mark, lineMap);
        perchLive = perches.find((p) => p.id === destId);
        next = reduced ? perches[0] : pickPerch(perches, destId, sy, rushing);
      }

      if (next.id !== destId) startFlight(next, rushing || (!g && destId !== 'home' && !visiblyHere(perchLive)));
      const perch = perchLive && perchLive.id === destId ? perchLive : next;
      departed = destId !== 'home';
      if (perch) {
        flightTo.x = perch.x;
        flightTo.y = perch.y;
        flightTo.s = perch.s;
      }

      const dist = Math.hypot(flightTo.x - pos.x, flightTo.y - pos.y);
      flying = flying ? dist > 10 : dist > 24;
      const parked = destId === 'home' || perch?.kind === 'dock';
      const idleAmp = parked ? 0.1 : flying ? 0 : 0.22;
      const idleX = Math.sin(life * 0.52) * 4.5 * idleAmp;
      const idleY = Math.cos(life * 0.41) * 3.2 * idleAmp;
      const progress = clamp(1 - dist / arcSpan);
      const lift = flying ? Math.sin(progress * Math.PI) * Math.min(82, arcSpan * 0.22) : 0;
      const tau = reduced ? 0.07 : dist > 260 ? 0.11 : dist > 90 ? 0.17 : 0.3;
      pos.x = smoothTo(pos.x, flightTo.x + idleX, dt, tau);
      pos.y = smoothTo(pos.y, flightTo.y + idleY - lift, dt, tau);
      pos.s = smoothTo(pos.s, flightTo.s, dt, flying ? 0.16 : 0.24);

      if (!flying && !parked && destId !== spokenFor && perch?.line) {
        spokenFor = destId;
        speak(perch.line);
      }

      if (!reduced && !flying) {
        fidget += dt;
        if (fidget > fidgetIn) {
          fidget = 0;
          fidgetIn = 2.5 + Math.random() * 2.8;
          hop = parked ? 0.2 : 0.38;
          if (Math.random() > 0.35) spinVel += (Math.random() - 0.3) * 3.4;
        }
      }

      if (g === 'logo' && destId === 'home' && spokenFor !== 'guide:logo') {
        spokenFor = 'guide:logo';
        speak(guide.steps.logo);
      }

      hop = smoothTo(hop, 0, dt, 0.18);
      const spinning = Math.abs(spinVel) > 0.18;
      const lookGain = reduced || flying ? 0.1 : spinning ? 0.08 : parked ? 0.5 : 0.85;
      const nx = (pointer.x - pos.x) / Math.max(160, window.innerWidth * 0.36);
      const ny = (pointer.y - pos.y) / Math.max(110, window.innerHeight * 0.3);
      lookY = smoothTo(lookY, clamp(-nx, -1, 1) * 0.32 * lookGain, dt, 0.15);
      lookX = smoothTo(lookX, clamp(ny, -1, 1) * 0.18 * lookGain, dt, 0.17);
      const face = 0.22 + lookY;
      const travel = flying ? (flightTo.x >= pos.x ? 0.85 : -0.65) : 0;
      spinY += spinVel * dt + travel * dt;
      const tauF = flying ? 0.36 : 0.72 + Math.min(0.4, Math.abs(spinVel) * 0.045);
      spinVel *= Math.exp(-dt / tauF);
      if (Math.abs(spinVel) < 0.12 && !flying) {
        spinVel = 0;
        spinY = smoothAngle(spinY, face, dt, 0.4);
      }

      const amp = parked ? 0.2 : 1;
      const bounce = Math.sin(hop * Math.PI) * (parked ? 1.8 : 5.2);
      const squash = hop * (parked ? 0.03 : 0.08);
      const breathe = Math.sin(life * 1.55) * (parked ? 0.45 : 1.05);
      const sway = Math.sin(life * 0.7) * 0.35 * amp;
      const nod = Math.sin(life * 1.2) * 0.032 * amp;
      const tilt = Math.sin(life * 0.88 + 0.8) * 0.03 * amp;
      const lean = flying ? 0.11 * (flightTo.x >= pos.x ? 1 : -1) : tilt + lookY * 0.12;
      const drawX = pos.x + sway * 0.18;
      const drawY = pos.y - bounce + breathe;
      const at = worldAtPixel(camera, drawX, drawY);
      model.position.set(at.x, at.y, 0);
      model.rotation.set(0.04 + nod + lookX, spinY, lean);
      const inner = model.children[0] as Group | undefined;
      if (inner) inner.rotation.set(nod * 0.35 + lookX * 0.45, lookY * 0.28, tilt * 0.55);
      const unit = Math.max(0.001, pos.s * at.unit);
      model.scale.set(unit * (1 + squash), unit * (1 - squash * 0.7), unit);

      stirCopy(drawX, drawY, parked ? 0 : flying || rushing ? pos.s * 2.5 + 130 : pos.s * 0.85 + 34, dt, rushing || flying);

      markNear(flying ? null : perch?.el ?? null);

      const menuOpen = Boolean(document.querySelector('.lp-nav-wrap.is-open'));
      const guiding = Boolean(g);
      const visLogo = pickVisibleLogo(mark);
      const layer = guiding ? 'guide' : menuOpen ? 'front' : departed ? 'front' : 'nav';
      host.classList.toggle('is-nav', layer === 'nav');
      host.classList.toggle('is-front', layer === 'front');
      host.classList.toggle('is-guide', layer === 'guide');
      host.classList.toggle('is-behind', false);
      hit.classList.toggle('is-nav', layer === 'nav');
      hit.classList.toggle('is-guide', guiding);
      host.style.opacity = menuOpen && !guiding ? '0' : '1';
      document.querySelectorAll<HTMLElement>('.app-logo-slot, .lp-nav-logo').forEach((el) => {
        el.classList.toggle('is-3d', destId === 'home' && el === visLogo && (guiding || !menuOpen));
        el.classList.toggle('is-spinning', destId === 'home' && el === visLogo && (spinning || flying));
      });
      document.querySelectorAll<HTMLElement>('.lp-footer-logo').forEach((el) => {
        el.classList.toggle('is-3d', perch?.kind === 'dock');
        el.classList.toggle('is-spinning', perch?.kind === 'dock' && (spinning || flying));
      });

      const hitSize = Math.max(32, pos.s);
      hit.style.width = `${hitSize}px`;
      hit.style.height = `${hitSize}px`;
      hit.style.left = `${drawX}px`;
      hit.style.top = `${drawY}px`;
      hit.style.pointerEvents = menuOpen && !guiding ? 'none' : 'auto';
      hit.setAttribute('aria-label', lines.home);

      const fading = say.classList.contains('is-out');
      const talking = (!menuOpen || guiding) && (Boolean(say.textContent) || fading);
      say.classList.toggle('is-on', talking);
      if (talking) {
        const pad = 10;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const w = Math.max(40, say.offsetWidth);
        const h = Math.max(24, say.offsetHeight);
        const gap = pos.s * 0.7 + 14;
        let left: number;
        let top: number;
        if (parked) {
          left = clamp(drawX - w / 2, pad, Math.max(pad, vw - w - pad));
          top = clamp(drawY + Math.max(20, pos.s * 0.55), pad, Math.max(pad, vh - h - pad));
        } else {
          const below = { left: drawX - w / 2, top: drawY + Math.max(22, pos.s * 0.62) };
          const above = { left: drawX - w / 2, top: drawY - pos.s * 0.62 - h };
          const right = { left: drawX + gap, top: drawY - h * 0.5 };
          const leftSide = { left: drawX - gap - w, top: drawY - h * 0.5 };
          const spots = vw < 720 ? [below, above, right, leftSide] : [right, leftSide, below, above];
          left = spots[0].left;
          top = spots[0].top;
          let best = Number.POSITIVE_INFINITY;
          for (const spot of spots) {
            const l = clamp(spot.left, pad, Math.max(pad, vw - w - pad));
            const t = clamp(spot.top, pad, Math.max(pad, vh - h - pad));
            const score = sayOverlap(l, t, w, h, perch?.el ?? null);
            if (score < best) {
              best = score;
              left = l;
              top = t;
              if (score === 0) break;
            }
          }
        }
        say.style.left = `${left}px`;
        say.style.top = `${top}px`;
        if (!fading) say.style.transform = 'none';
      }
      say.classList.toggle('is-nav-say', parked);
      say.classList.toggle('is-guide-say', guiding);

      onProgressRef.current?.(departed ? 1 : 0, departed);
    };

    const tick = (now: number) => {
      if (dead) return;
      if (document.hidden) {
        frame = 0;
        return;
      }
      applyFrame(now);
      const modalOpen = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(
        (el) => !el.classList.contains('app-guide'),
      );
      if (!modalOpen) renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };

    const mount = (object: Object3D, fromFbx: boolean) => {
      if (dead || model) return;
      const wrap = buildMascot(object, fromFbx);
    const inner = wrap.children[0] as Group | undefined;
    const logo = inner?.children[0] as Group | undefined;
    if (fromFbx && (!logo || logo.children.length < 1)) {
      mount(fallbackPin(), false);
      return;
    }
      model = wrap;
      scene.add(wrap);
      const start = homePerch(source, linesRef.current.home);
      pos.x = start.x;
      pos.y = start.y;
      pos.s = start.s;
      destId = 'home';
      flightTo.x = start.x;
      flightTo.y = start.y;
      flightTo.s = start.s;
      source.classList.add('is-3d');
      source.classList.remove('is-3d-wait');
      lastT = performance.now();
      tick(lastT);
      window.clearTimeout(introTimer);
      introTimer = window.setTimeout(() => {
        if (dead || destId !== 'home' || say.textContent || guideTargetRef.current) return;
        speak(linesRef.current.home);
      }, 900);
    };

    onFbxReady(({ object, fromFbx }) => {
      if (dead) return;
      mount(object, fromFbx);
    });

    const themeWatch = new MutationObserver(lightsForTheme);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', fit);
    const onPointer = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    };
    window.addEventListener('pointermove', onPointer, { passive: true });
    const onVisibility = () => {
      if (dead || document.hidden) return;
      if (!frame) {
        lastT = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    const onHit = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      poke();
    };
    hit.addEventListener('click', onHit);
    source.addEventListener('click', onHit);

    return () => {
      dead = true;
      window.clearTimeout(fadeTimer);
      window.clearTimeout(introTimer);
      cancelAnimationFrame(frame);
      clearNear();
      themeWatch.disconnect();
      window.removeEventListener('resize', fit);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      hit.removeEventListener('click', onHit);
      source.removeEventListener('click', onHit);
      source.classList.remove('is-3d', 'is-3d-wait', 'is-spinning');
      document.querySelectorAll<HTMLElement>('.app-logo-slot, .lp-nav-logo, .lp-footer-logo').forEach((el) => {
        el.classList.remove('is-3d', 'is-3d-wait', 'is-spinning');
      });
      clearStir();
      scene.clear();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [sourceRef]);

  return createPortal(
    <>
      <div ref={hostRef} className="lp-logo-canvas is-nav" aria-hidden />
      <button type="button" ref={hitRef} className="lp-mascot-hit" aria-label={m.mascot.home} />
      <div ref={sayRef} className="lp-mascot-say" role="status" aria-live="polite" />
    </>,
    document.body,
  );
}
