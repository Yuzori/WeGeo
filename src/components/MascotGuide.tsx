import { useEffect, useState } from 'react';

export const GUIDE_STORAGE_KEY = 'prospy.guide.v3';

export function guideStorageKey(userId: number): string {
  return `${GUIDE_STORAGE_KEY}.${userId}`;
}
export const GUIDE_STEPS = ['logo', 'search', 'launch', 'results', 'pipeline', 'invite'] as const;
export type GuideStep = (typeof GUIDE_STEPS)[number];

function visibleSlot(step: GuideStep): HTMLElement | null {
  if (step === 'logo') {
    const slots = [...document.querySelectorAll<HTMLElement>('.app-logo-slot')];
    return (
      slots.find((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 8 && r.height > 8 && r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight;
      }) ?? slots[0] ?? null
    );
  }
  return document.querySelector<HTMLElement>(`[data-guide="${step}"]`);
}

export function MascotGuide({ step }: { step: GuideStep | null }) {
  const [hole, setHole] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!step) {
      setHole(null);
      return;
    }
    let frame = 0;
    const measure = () => {
      const el = visibleSlot(step);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 4 && r.height > 4) {
          const pad = step === 'logo' ? 10 : 8;
          setHole(
            new DOMRect(
              r.left - pad,
              r.top - pad,
              r.width + pad * 2,
              r.height + pad * 2,
            ),
          );
        }
      }
      frame = requestAnimationFrame(measure);
    };
    const el = visibleSlot(step);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    measure();
    return () => cancelAnimationFrame(frame);
  }, [step]);

  if (!step) return null;

  const radius = step === 'logo' ? 999 : 18;

  return (
    <div className="app-guide" role="presentation" aria-hidden>
      <div className="app-guide-veil" />
      {hole && (
        <div
          className="app-guide-spot"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            borderRadius: radius,
          }}
        />
      )}
    </div>
  );
}
