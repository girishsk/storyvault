'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, RotateCw, Maximize2, Save, Loader2 } from 'lucide-react';

interface Props {
  src: string;
  initialRotation?: number;
  onClose: () => void;
  onSaveRotation?: (rotation: number) => Promise<void>;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const PINCH_DAMPING = 0.25;

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function normalizeRotation(r: number): number {
  return ((r % 360) + 360) % 360;
}

export default function ImageViewer({ src, initialRotation = 0, onClose, onSaveRotation }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(normalizeRotation(initialRotation));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const drag = useRef({ active: false, startX: 0, startY: 0, posX: 0, posY: 0 });
  const pinch = useRef({ active: false, prevDist: 0, prevMidX: 0, prevMidY: 0 });

  // Best-fit on load or rotation change
  function fitToScreen(rot?: number) {
    if (!imgRef.current || !canvasRef.current) return;
    const r = rot !== undefined ? rot : rotation;
    const iw = imgRef.current.naturalWidth || imgRef.current.offsetWidth || 800;
    const ih = imgRef.current.naturalHeight || imgRef.current.offsetHeight || 600;
    // At 90° / 270° the image is transposed
    const swapped = r === 90 || r === 270;
    const effectiveW = swapped ? ih : iw;
    const effectiveH = swapped ? iw : ih;
    const canvasW = canvasRef.current.clientWidth - 64;
    const canvasH = canvasRef.current.clientHeight - 64;
    const fit = Math.min(canvasW / effectiveW, canvasH / effectiveH, 1);
    setScale(fit);
    setPos({ x: 0, y: 0 });
  }

  useEffect(() => {
    if (imgLoaded) fitToScreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgLoaded, rotation]);

  // Keyboard
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  // Wheel zoom
  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setScale(prev => {
      const next = clamp(prev * factor, MIN_SCALE, MAX_SCALE);
      const rect = canvasRef.current!.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      setPos(p => ({
        x: cx - (cx - p.x) * (next / prev),
        y: cy - (cy - p.y) * (next / prev),
      }));
      return next;
    });
  }, []);

  // Mouse drag
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    drag.current = { active: true, startX: e.clientX, startY: e.clientY, posX: pos.x, posY: pos.y };
  }, [pos]);
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drag.current.active) return;
    setPos({ x: drag.current.posX + e.clientX - drag.current.startX, y: drag.current.posY + e.clientY - drag.current.startY });
  }, []);
  const onMouseUp = useCallback(() => { drag.current.active = false; }, []);

  // Touch
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      drag.current = { active: true, startX: e.touches[0].clientX, startY: e.touches[0].clientY, posX: pos.x, posY: pos.y };
      pinch.current.active = false;
    } else if (e.touches.length === 2) {
      drag.current.active = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinch.current = {
        active: true,
        prevDist: Math.hypot(dx, dy),
        prevMidX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        prevMidY: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    }
  }, [pos]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && drag.current.active) {
      setPos({ x: drag.current.posX + e.touches[0].clientX - drag.current.startX, y: drag.current.posY + e.touches[0].clientY - drag.current.startY });
    } else if (e.touches.length === 2 && pinch.current.active) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const rawRatio = dist / pinch.current.prevDist;
      const ratio = 1 + (rawRatio - 1) * PINCH_DAMPING;
      setScale(prev => {
        const next = clamp(prev * ratio, MIN_SCALE, MAX_SCALE);
        const rect = canvasRef.current!.getBoundingClientRect();
        const cx = midX - rect.left - rect.width / 2;
        const cy = midY - rect.top - rect.height / 2;
        setPos(p => ({
          x: cx - (cx - p.x) * (next / prev) + midX - pinch.current.prevMidX,
          y: cy - (cy - p.y) * (next / prev) + midY - pinch.current.prevMidY,
        }));
        return next;
      });
      pinch.current.prevDist = dist;
      pinch.current.prevMidX = midX;
      pinch.current.prevMidY = midY;
    }
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) pinch.current.active = false;
    if (e.touches.length === 0) drag.current.active = false;
  }, []);

  function rotate(delta: number) {
    const next = normalizeRotation(rotation + delta);
    setRotation(next);
    setSaved(false);
  }

  async function handleSave() {
    if (!onSaveRotation) return;
    setSaving(true);
    try {
      await onSaveRotation(rotation);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const pct = Math.round(scale * 100);
  const rotationChanged = normalizeRotation(initialRotation) !== rotation;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#0d0a05', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', flexShrink: 0, zIndex: 1,
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>Source Image</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Zoom */}
          <Btn onClick={() => setScale(s => clamp(s / 1.25, MIN_SCALE, MAX_SCALE))} title="Zoom out"><ZoomOut size={15} /></Btn>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', minWidth: 46, textAlign: 'center' }}>{pct}%</span>
          <Btn onClick={() => setScale(s => clamp(s * 1.25, MIN_SCALE, MAX_SCALE))} title="Zoom in"><ZoomIn size={15} /></Btn>
          <Btn onClick={() => fitToScreen()} title="Best fit"><Maximize2 size={14} /></Btn>

          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />

          {/* Rotation */}
          <Btn onClick={() => rotate(-90)} title="Rotate counter-clockwise"><RotateCcw size={15} /></Btn>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', minWidth: 36, textAlign: 'center' }}>{rotation}°</span>
          <Btn onClick={() => rotate(90)} title="Rotate clockwise"><RotateCw size={15} /></Btn>

          {onSaveRotation && (
            <button
              onClick={handleSave}
              disabled={saving || (!rotationChanged && saved)}
              title="Save rotation"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 12, fontWeight: 600,
                background: saved && !rotationChanged ? 'rgba(40,180,90,0.3)' : 'rgba(201,148,10,0.25)',
                color: saved && !rotationChanged ? '#5dd08a' : 'var(--accent, #c9940a)',
                border: `1px solid ${saved && !rotationChanged ? 'rgba(40,180,90,0.4)' : 'rgba(201,148,10,0.4)'}`,
                borderRadius: 7, padding: '5px 12px', cursor: saving ? 'default' : 'pointer',
                opacity: saving ? 0.6 : 1, transition: 'all 0.2s',
              }}
            >
              {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
              {saved && !rotationChanged ? 'Saved' : 'Save'}
            </button>
          )}

          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />
          <Btn onClick={onClose} title="Close (Esc)" danger><X size={15} /></Btn>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ flex: 1, overflow: 'hidden', position: 'relative', cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
      >
        {!imgLoaded && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
            Loading…
          </div>
        )}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.2s',
        }}>
          <div style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: 'none',
          }}>
            <img
              ref={imgRef}
              src={src}
              alt="Source"
              onLoad={() => setImgLoaded(true)}
              style={{
                display: 'block',
                maxWidth: '80vw',
                maxHeight: '80vh',
                borderRadius: 8,
                boxShadow: '0 4px 48px rgba(0,0,0,0.6)',
                transform: `rotate(${rotation}deg)`,
                transition: 'transform 0.3s ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* Hint */}
      <div style={{ padding: '6px 0', flexShrink: 0, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.2)' }}>
        Scroll to zoom · Drag to pan · Pinch on touch · Rotate with buttons · Esc to close
      </div>
    </div>
  );
}

function Btn({ onClick, title, children, danger }: { onClick: () => void; title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 7, border: 'none',
        background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.75)',
        cursor: 'pointer', transition: 'background 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = danger ? 'rgba(220,60,60,0.35)' : 'rgba(255,255,255,0.15)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
    >
      {children}
    </button>
  );
}
