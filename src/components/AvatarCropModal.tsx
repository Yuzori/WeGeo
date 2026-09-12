import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cropAvatarToDataUrl, coverScaleForViewport } from '../lib/avatar';
import { Button, Modal } from './ui';

const VIEWPORT = 280;

export function AvatarCropModal({
  file,
  open,
  title,
  hint,
  zoomLabel,
  cancelLabel,
  applyLabel,
  onClose,
  onConfirm,
}: {
  file: File | null;
  open: boolean;
  title: string;
  hint: string;
  zoomLabel: string;
  cancelLabel: string;
  applyLabel: string;
  onClose: () => void;
  onConfirm: (dataUrl: string) => void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    if (!open || !file) {
      setImage(null);
      setPreviewUrl(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      return;
    }
    let cancelled = false;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.onerror = () => {
      if (!cancelled) setImage(null);
    };
    img.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [open, file]);

  const baseScale = useMemo(() => (image ? coverScaleForViewport(image, VIEWPORT) : 1), [image]);

  const display = useMemo(() => {
    if (!image) return { width: VIEWPORT, height: VIEWPORT };
    const scale = baseScale * zoom;
    return {
      width: image.naturalWidth * scale,
      height: image.naturalHeight * scale,
    };
  }, [image, baseScale, zoom]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || event.buttons !== 1) return;
    setOffset({
      x: dragRef.current.ox + (event.clientX - dragRef.current.x),
      y: dragRef.current.oy + (event.clientY - dragRef.current.y),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const apply = useCallback(() => {
    if (!image) return;
    setBusy(true);
    try {
      onConfirm(cropAvatarToDataUrl(image, VIEWPORT, baseScale, zoom, offset.x, offset.y));
    } finally {
      setBusy(false);
    }
  }, [image, baseScale, zoom, offset.x, offset.y, onConfirm]);

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={title}
      subtitle={hint}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button type="button" variant="primary" loading={busy} disabled={!image} onClick={apply}>
            {applyLabel}
          </Button>
        </div>
      }
    >
      <div className="avatar-crop">
        <div
          className="avatar-crop-viewport"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="presentation"
        >
          {previewUrl && image && (
            <img
              src={previewUrl}
              alt=""
              draggable={false}
              className="avatar-crop-image"
              style={{
                width: `${display.width}px`,
                height: `${display.height}px`,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            />
          )}
          <div className="avatar-crop-mask" aria-hidden />
        </div>
        <label className="avatar-crop-zoom">
          <span>{zoomLabel}</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
      </div>
    </Modal>
  );
}
