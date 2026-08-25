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

function clamp(v: number, a = 0, b = 1): number {
  return Math.min(b, Math.max(a, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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

function easeInOut(t: number): number {
  const x = clamp(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
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

function hitsCopy(x: number, y: number, pad = 12): boolean {
  const nodes = document.querySelectorAll<HTMLElement>('h1, h2, h3, .lp-hero-lead, .lp-hero-ctas, .lp-plan ul, .lp-plan h3');
  for (const node of nodes) {
    const r = node.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    if (x > r.left - pad && x < r.right + pad && y > r.top - pad && y < r.bottom + pad) return true;
  }
  return false;
}

function sitOn(el: HTMLElement, lines: Record<string, string>, loose = false): Perch | null {
  const r = el.getBoundingClientRect();
  if (r.width < (loose ? 16 : 40) || r.height < (loose ? 16 : 28)) return null;
  if (!loose && (r.bottom < 80 || r.top > window.innerHeight - 40)) return null;
  const kind = el.dataset.mascot ?? el.dataset.guide ?? 'spot';
  const s = perchSize();
  let x = r.left + 22;
  let y = r.top + 10;
  if (kind === 'feature' || kind === 'trust') {
    x = r.left + 28;
    y = r.top + 18;
  } else if (kind === 'plan') {
    x = r.right - 26;
    y = r.top + 12;
  } else if (kind === 'launch') {
    x = r.left + r.width * 0.5;
    y = r.top + 8;
  } else if (kind === 'pipeline' || kind === 'search' || kind === 'results') {
    x = r.left + 56;
    y = r.top + 18;
  }
  x = clamp(x, 72, window.innerWidth - 28);
  y = clamp(y, loose ? 24 : 70, window.innerHeight - 36);
  if (!loose && hitsCopy(x, y, 8)) return null;
  const line = lines[kind] ?? lines.hero;
  return { id: `${eid(el)}:${kind}`, el, x, y, s, kind, line, top: r.top };
}

function collectPerches(source: HTMLElement | null, lines: Record<string, string>): Perch[] {
  const list: Perch[] = [homePerch(source, lines.home)];
  document.querySelectorAll<HTMLElement>('[data-mascot]').forEach((el) => {
    const spot = sitOn(el, lines);
    if (spot) list.push(spot);
  });
  return list;
}

function pickPerch(perches: Perch[], currentId: string, scrollY: number, rushing: boolean): Perch {
  const home = perches[0];
  if (scrollY < 52) return home;
  const vis = perches.filter((p) => p.id !== 'home');
  if (!vis.length) return home;
  const aim = Math.min(158, window.innerHeight * 0.24);
  const score = (p: Perch) => Math.abs(p.top - aim);
  vis.sort((a, b) => score(a) - score(b) || a.x - b.x);
  const best = vis[0];
  if (rushing) return best;
  const cur = vis.find((p) => p.id === currentId);
  if (cur && score(cur) <= score(best) + 64) return cur;
  return best;
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
    let flightT = 0;
    let flightDur = 0.55;
    const flightFrom = { x: 0, y: 0, s: 40 };
    const flightTo = { x: 0, y: 0, s: 40 };
    let departed = false;
    let clickI = 0;
    let life = 0;
    let lastScrollY = window.scrollY;
    let spokenFor = 'home';
    let lookX = 0;
    let lookY = 0;
    const pointer = { x: window.innerWidth * 0.5, y: 40 };

    const scene = new Scene();
    const camera = new PerspectiveCamera(28, 1, 0.5, 40);
    camera.position.set(0, 0, 8);

    const hemi = new HemisphereLight(0xf4f7ea, 0x1a2214, 1);
    const key = new DirectionalLight(0xfff6e0, 1.15);
    key.position.set(2.4, 4.2, 6);
    const fill = new AmbientLight(0xd5ddc4, 0.38);
    scene.add(hemi, key, fill);

    const renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
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

    const speak = (text: string) => {
      if (!text) return;
      say.textContent = text;
    };

    const poke = () => {
      hop = destId === 'home' ? 0.38 : 0.5;
      if (!reduced) spinVel += destId === 'home' ? 12.6 : 10.8;
      if (guideTargetRef.current || destId !== 'home') return;
      const clicks = linesRef.current.click;
      speak(clicks[clickI % clicks.length]);
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
      flightFrom.x = pos.x;
      flightFrom.y = pos.y;
      flightFrom.s = pos.s;
      flightTo.x = to.x;
      flightTo.y = to.y;
      flightTo.s = to.s;
      const dist = Math.hypot(to.x - pos.x, to.y - pos.y);
      if (rushing) flightDur = clamp(dist / 1600, 0.18, 0.38);
      else if (fromHome) flightDur = clamp(dist / 680, 0.52, 0.95);
      else flightDur = clamp(dist / 900, 0.32, 0.72);
      flightT = 0;
      flying = dist > 10;
      destId = to.id;
      if (to.id === 'home' && guideTargetRef.current !== 'logo') {
        say.textContent = '';
        spokenFor = 'home';
      } else if (to.id !== 'home') {
        say.textContent = '';
      }
      if (!flying) {
        pos.x = to.x;
        pos.y = to.y;
        pos.s = to.s;
        if (to.id !== 'home' && to.id !== spokenFor) {
          spokenFor = to.id;
          speak(to.line);
        }
      } else {
        hop = Math.max(hop, fromHome ? 0.55 : rushing ? 0.22 : 0.4);
        if (!reduced) spinVel += fromHome ? 2.6 : rushing ? 1.1 : 1.8;
      }
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
      const lineMap: Record<string, string> = {
        home: lines.home,
        window: lines.hero,
        hero: lines.hero,
        product: lines.product,
        feature: lines.features,
        trust: lines.trust,
        plan: lines.pricing,
        logo: guide.steps.logo,
        search: guide.steps.search,
        launch: guide.steps.launch,
        results: guide.steps.results,
        pipeline: guide.steps.pipeline,
      };
      const home = homePerch(mark, lineMap.home);
      let next: Perch;
      let perchLive: Perch | undefined;
      if (g) {
        if (g === 'logo') next = home;
        else {
          const el = document.querySelector<HTMLElement>(`[data-guide="${g}"]`);
          next = (el && sitOn(el, lineMap, true)) || home;
        }
        perchLive = next;
      } else {
        const perches = collectPerches(mark, lineMap);
        perchLive = perches.find((p) => p.id === destId);
        const destGone = destId !== 'home' && !perchLive;
        next = reduced ? perches[0] : pickPerch(perches, destGone ? 'home' : destId, sy, rushing);
      }

      if (next.id !== destId) startFlight(next, rushing || (!g && destId !== 'home' && !perchLive));
      const perch = perchLive && perchLive.id === destId ? perchLive : next;
      departed = destId !== 'home';
      if (perch) {
        flightTo.x = perch.x;
        flightTo.y = perch.y;
        flightTo.s = perch.s;
      }

      if (flying) {
        flightT += dt;
        const u = easeInOut(flightT / Math.max(0.1, flightDur));
        const dist = Math.hypot(flightTo.x - flightFrom.x, flightTo.y - flightFrom.y);
        const lift = (destId === 'home' ? 18 : 36) + Math.min(52, dist * 0.16);
        pos.x = lerp(flightFrom.x, flightTo.x, u);
        pos.y = lerp(flightFrom.y, flightTo.y, u) - Math.sin(u * Math.PI) * lift;
        pos.s = lerp(flightFrom.s, flightTo.s, u);
        if (flightT >= flightDur) {
          pos.x = flightTo.x;
          pos.y = flightTo.y;
          pos.s = flightTo.s;
          flying = false;
          hop = Math.max(hop, destId === 'home' ? 0.12 : 0.22);
          if (destId !== 'home' && destId !== spokenFor && perch) {
            spokenFor = destId;
            speak(perch.line);
          }
        }
      } else {
        pos.x = flightTo.x;
        pos.y = flightTo.y;
        pos.s = flightTo.s;
      }

      if (g === 'logo' && destId === 'home' && spokenFor !== 'guide:logo') {
        spokenFor = 'guide:logo';
        speak(guide.steps.logo);
      }

      const atHome = destId === 'home';
      hop = smoothTo(hop, 0, dt, 0.22);
      const spinning = Math.abs(spinVel) > 0.18;
      const lookGain = reduced || flying ? 0.12 : spinning ? 0.08 : atHome ? 0.72 : 1;
      const nx = (pointer.x - pos.x) / Math.max(160, window.innerWidth * 0.36);
      const ny = (pointer.y - pos.y) / Math.max(110, window.innerHeight * 0.3);
      lookY = smoothTo(lookY, clamp(nx, -1, 1) * 0.4 * lookGain, dt, 0.15);
      lookX = smoothTo(lookX, clamp(-ny, -1, 1) * 0.22 * lookGain, dt, 0.17);
      const face = 0.22 + lookY;
      const travel = flying ? (flightTo.x >= flightFrom.x ? 0.55 : -0.4) : 0;
      spinY += spinVel * dt + travel * dt;
      const tauF = flying ? 0.42 : 0.72 + Math.min(0.4, Math.abs(spinVel) * 0.045);
      spinVel *= Math.exp(-dt / tauF);
      if (Math.abs(spinVel) < 0.12 && !flying) {
        spinVel = 0;
        spinY = smoothAngle(spinY, face, dt, 0.4);
      }

      const amp = atHome ? 0.32 : 1;
      const bounce = Math.sin(hop * Math.PI) * (atHome ? 2.2 : 5);
      const squash = hop * (atHome ? 0.04 : 0.08);
      const breathe = Math.sin(life * 2.05) * (atHome ? 0.65 : 1.35);
      const sway = Math.sin(life * 0.92) * 0.45 * amp;
      const nod = Math.sin(life * 1.55) * 0.036 * amp;
      const tilt = Math.sin(life * 1.08 + 0.8) * 0.034 * amp;
      const lean = flying ? 0.06 * (flightTo.x >= flightFrom.x ? 1 : -1) : tilt + lookY * 0.12;
      const at = worldAtPixel(camera, pos.x + sway * 0.15, pos.y - bounce + breathe);
      model.position.set(at.x, at.y, 0);
      model.rotation.set(0.04 + nod + lookX, spinY, lean);
      const inner = model.children[0] as Group | undefined;
      if (inner) inner.rotation.set(nod * 0.35 + lookX * 0.45, lookY * 0.28, tilt * 0.55);
      const unit = Math.max(0.001, pos.s * at.unit);
      model.scale.set(unit * (1 + squash), unit * (1 - squash * 0.7), unit);

      markNear(flying ? null : perch?.el ?? null);

      const menuOpen = Boolean(document.querySelector('.lp-nav-wrap.is-open'));
      const guiding = Boolean(g);
      const visLogo = pickVisibleLogo(mark);
      const layer = guiding ? 'guide' : menuOpen ? 'front' : departed ? 'front' : 'nav';
      host.classList.toggle('is-nav', layer === 'nav');
      host.classList.toggle('is-front', layer === 'front');
      host.classList.toggle('is-guide', layer === 'guide');
      host.classList.toggle('is-behind', false);
      host.style.opacity = menuOpen && !guiding ? '0' : '1';
      document.querySelectorAll<HTMLElement>('.app-logo-slot, .lp-nav-logo').forEach((el) => {
        el.classList.toggle('is-3d', el === visLogo && (guiding || !menuOpen));
        el.classList.toggle('is-spinning', el === visLogo && (spinning || flying));
      });

      const hitSize = Math.max(32, pos.s);
      hit.style.width = `${hitSize}px`;
      hit.style.height = `${hitSize}px`;
      hit.style.left = `${pos.x + sway * 0.15}px`;
      hit.style.top = `${pos.y - bounce + breathe}px`;
      hit.style.pointerEvents = menuOpen && !guiding ? 'none' : 'auto';
      hit.classList.toggle('is-guide', guiding);
      hit.setAttribute('aria-label', lines.home);

      const talking = (!menuOpen || guiding) && Boolean(say.textContent);
      say.style.left = `${pos.x + sway * 0.15}px`;
      say.style.top = atHome
        ? `${pos.y + bounce + breathe + pos.s * 0.52}px`
        : `${pos.y - bounce + breathe - pos.s * 0.62}px`;
      say.style.transform = atHome ? 'translate(-50%, 0)' : 'translate(-50%, -100%)';
      say.style.display = talking ? 'block' : 'none';
      say.classList.toggle('is-nav-say', atHome);
      say.classList.toggle('is-guide-say', guiding);

      onProgressRef.current?.(departed ? 1 : 0, departed);
    };

    const tick = (now: number) => {
      if (dead) return;
      applyFrame(now);
      renderer.render(scene, camera);
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
      lastT = performance.now();
      tick(lastT);
    };

    const loader = new FBXLoader();
    loader.load(
      FBX_URL,
      (fbx) => mount(fbx, true),
      undefined,
      () => mount(fallbackPin(), false),
    );

    const themeWatch = new MutationObserver(lightsForTheme);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', fit);
    const onPointer = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    };
    window.addEventListener('pointermove', onPointer, { passive: true });
    const onHit = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      poke();
    };
    hit.addEventListener('click', onHit);
    source.addEventListener('click', onHit);

    return () => {
      dead = true;
      cancelAnimationFrame(frame);
      clearNear();
      themeWatch.disconnect();
      window.removeEventListener('resize', fit);
      window.removeEventListener('pointermove', onPointer);
      hit.removeEventListener('click', onHit);
      source.removeEventListener('click', onHit);
      source.classList.remove('is-3d', 'is-spinning');
      document.querySelectorAll<HTMLElement>('.app-logo-slot').forEach((el) => {
        el.classList.remove('is-3d', 'is-spinning');
      });
      scene.clear();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [sourceRef]);

  return createPortal(
    <>
      <div ref={hostRef} className="lp-logo-canvas is-nav" aria-hidden />
      <button type="button" ref={hitRef} className="lp-mascot-hit" aria-label={m.mascot.home} />
      <div ref={sayRef} className="lp-mascot-say" />
    </>,
    document.body,
  );
}
