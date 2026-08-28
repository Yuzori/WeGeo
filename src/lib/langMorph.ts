const SELECTOR = [
  '.landing .lp-btn',
  '.landing .lp-nav-links a',
  '.landing .lp-command',
  '.landing .lp-nav-profile-name',
  '.landing p:not(.lp-chip):not(.lp-hero-lead)',
  '.app-settings p:not(.settings-stat-n)',
  '.app-settings .legend',
  '.app-settings .settings-copy',
  '.app-settings .settings-morph',
].join(', ');

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const DURATION_MS = 580;

export type BoxShot = {
  el: HTMLElement;
  w: number;
  h: number;
  display: string;
  morphWidth: boolean;
  morphHeight: boolean;
};

function shouldMorphWidth(el: HTMLElement, display: string) {
  if (el.closest('h1, h2, h3')) return false;
  if (display === 'inline' || display === 'inline-block' || display === 'inline-flex') return true;
  const parent = el.parentElement;
  if (!parent) return false;
  const parentDisplay = getComputedStyle(parent).display;
  if (
    parentDisplay !== 'flex' &&
    parentDisplay !== 'inline-flex' &&
    parentDisplay !== 'grid' &&
    parentDisplay !== 'inline-grid'
  ) {
    return false;
  }
  return el.offsetWidth + 24 < parent.clientWidth;
}

function shouldMorphHeight(el: HTMLElement) {
  if (el.matches('.lp-btn, .lp-chip, .lp-nav-links a, .lp-nav-profile-name, .settings-morph')) return false;
  if (el.closest('h1, h2, h3')) return false;
  const tag = el.tagName;
  return tag === 'P' || el.classList.contains('lp-command');
}

export function snapshotLangBoxes(): BoxShot[] {
  return [...document.querySelectorAll<HTMLElement>(SELECTOR)].flatMap((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return [];
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w < 2 || h < 2) return [];
    const morphWidth = shouldMorphWidth(el, cs.display);
    const morphHeight = shouldMorphHeight(el);
    if (!morphWidth && !morphHeight) return [];
    return [{ el, w, h, display: cs.display, morphWidth, morphHeight }];
  });
}

function pinBox(el: HTMLElement, shot: Pick<BoxShot, 'w' | 'h' | 'display' | 'morphWidth' | 'morphHeight'>) {
  el.style.boxSizing = 'border-box';
  el.style.maxWidth = '100%';
  el.style.flexShrink = '0';
  if (shot.display === 'inline') el.style.display = 'inline-block';
  if (shot.morphWidth) {
    el.style.width = `${Math.max(1, shot.w)}px`;
    el.style.overflowX = 'clip';
  }
  if (shot.morphHeight) {
    el.style.height = `${Math.max(1, shot.h)}px`;
    el.style.overflowY = 'clip';
  }
}

function measureNatural(el: HTMLElement, morphWidth: boolean, morphHeight: boolean) {
  const cs = getComputedStyle(el);
  const probe = el.cloneNode(true) as HTMLElement;
  probe.style.cssText = '';
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.left = '0';
  probe.style.top = '0';
  probe.style.zIndex = '-1';
  probe.style.flexShrink = '0';
  probe.style.maxWidth = cs.maxWidth;
  probe.style.boxSizing = cs.boxSizing;
  if (morphWidth) probe.style.width = 'auto';
  else probe.style.width = `${el.offsetWidth}px`;
  if (morphHeight) probe.style.height = 'auto';
  else probe.style.height = `${el.offsetHeight}px`;
  (el.parentElement ?? document.body).appendChild(probe);
  const nextW = probe.offsetWidth;
  const nextH = probe.offsetHeight;
  probe.remove();
  return { nextW, nextH };
}

export function lockLangBoxes(shots: BoxShot[]) {
  for (const shot of shots) {
    if (!shot.el.isConnected) continue;
    pinBox(shot.el, shot);
  }
}

export function morphLangBoxes(shots: BoxShot[]) {
  const live = shots.filter(({ el }) => el.isConnected);

  const next = live.map((shot) => {
    const { nextW, nextH } = measureNatural(shot.el, shot.morphWidth, shot.morphHeight);
    return { ...shot, nextW, nextH };
  });

  void document.body.offsetWidth;

  for (const { el, w, h, nextW, nextH, morphWidth, morphHeight, display } of next) {
    pinBox(el, { w, h, display, morphWidth, morphHeight });
    const parts: string[] = [];
    if (morphWidth && Math.abs(nextW - w) > 0.5) {
      parts.push(`width ${DURATION_MS}ms ${EASE}`);
      el.style.width = `${nextW}px`;
    } else if (morphWidth) {
      el.style.width = `${nextW}px`;
    }
    if (morphHeight && Math.abs(nextH - h) > 0.5) {
      parts.push(`height ${DURATION_MS}ms ${EASE}`);
      el.style.height = `${nextH}px`;
    } else if (morphHeight) {
      el.style.height = `${nextH}px`;
    }
    el.style.transition = parts.join(', ');
  }

  window.setTimeout(() => {
    for (const { el } of live) {
      el.style.width = '';
      el.style.height = '';
      el.style.overflowX = '';
      el.style.overflowY = '';
      el.style.overflow = '';
      el.style.transition = '';
      el.style.boxSizing = '';
      el.style.maxWidth = '';
      el.style.display = '';
      el.style.flexShrink = '';
    }
  }, DURATION_MS + 80);
}
