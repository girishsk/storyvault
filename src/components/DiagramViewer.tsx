'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Maximize2 } from 'lucide-react';

interface Props {
  code: string;
  label: string;
  type: string;
  onClose: () => void;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const PINCH_DAMPING = 0.6;

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    function read() {
      const attr = document.documentElement.getAttribute('data-theme');
      if (attr === 'dark') return true;
      if (attr === 'light') return false;
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    setDark(read());
    const observer = new MutationObserver(() => setDark(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

export default function DiagramViewer({ code, label, type, onClose }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgWrapRef = useRef<HTMLDivElement>(null);
  const dark = useIsDark();

  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);

  const drag = useRef({ active: false, startX: 0, startY: 0, posX: 0, posY: 0 });
  const pinch = useRef({ active: false, prevDist: 0, prevMidX: 0, prevMidY: 0 });

  // ── Render Mermaid directly, then best-fit ────────────────────────
  useEffect(() => {
    if (!svgWrapRef.current || !canvasRef.current) return;
    let cancelled = false;
    setReady(false);

    async function render() {
      const mermaid = (await import('mermaid')).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: dark ? 'dark' : 'neutral',
        htmlLabels: true,
        flowchart: { htmlLabels: true, wrappingWidth: 200 },
        themeVariables: dark
          ? {
              background: '#1e1710', mainBkg: '#26200f',
              nodeBorder: '#3a3020', clusterBkg: '#26200f', clusterBorder: '#3a3020',
              primaryColor: '#26200f', primaryTextColor: '#f0e8d5',
              primaryBorderColor: '#e0aa20', lineColor: '#8a7a60',
              secondaryColor: '#2e2618', tertiaryColor: '#1e1710',
              edgeLabelBackground: '#1e1710', titleColor: '#f0e8d5',
            }
          : {
              background: '#f5f0e8', mainBkg: '#ffffff',
              nodeBorder: '#c4b89a', clusterBkg: '#ede8de', clusterBorder: '#c4b89a',
              primaryColor: '#ffffff', primaryTextColor: '#1a1208',
              primaryBorderColor: '#c9940a', lineColor: '#9a8f7a',
              secondaryColor: '#f5f0e8', tertiaryColor: '#ede8de',
              edgeLabelBackground: '#f5f0e8', titleColor: '#1a1208',
            },
        securityLevel: 'loose',
      });

      if (cancelled || !svgWrapRef.current) return;
      svgWrapRef.current.innerHTML = '';

      try {
        const id = `viewer-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, code);
        if (cancelled || !svgWrapRef.current || !canvasRef.current) return;

        svgWrapRef.current.innerHTML = svg;
        const svgEl = svgWrapRef.current.querySelector('svg');
        if (!svgEl) return;

        // Remove any fixed size attrs so we can measure natural size
        svgEl.removeAttribute('width');
        svgEl.removeAttribute('height');
        svgEl.style.display = 'block';

        // Measure natural SVG size via viewBox
        const vb = svgEl.getAttribute('viewBox');
        let svgW = svgEl.getBoundingClientRect().width || 800;
        let svgH = svgEl.getBoundingClientRect().height || 600;
        if (vb) {
          const parts = vb.split(/[\s,]+/).map(Number);
          if (parts.length === 4) { svgW = parts[2]; svgH = parts[3]; }
        }

        // Canvas available area (minus toolbar + hint = ~80px)
        const canvasW = canvasRef.current.clientWidth - 64;
        const canvasH = canvasRef.current.clientHeight - 64;

        const fitScale = Math.min(canvasW / svgW, canvasH / svgH, 1);
        setScale(fitScale);
        setPos({ x: 0, y: 0 });
        setReady(true);
      } catch {
        if (!cancelled && svgWrapRef.current) {
          svgWrapRef.current.innerHTML = `<pre style="font-size:12px;padding:20px;color:#888;white-space:pre-wrap">${code}</pre>`;
          setReady(true);
        }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [code, dark]);

  // ── Best-fit reset ────────────────────────────────────────────────
  function fitToScreen() {
    if (!svgWrapRef.current || !canvasRef.current) return;
    const svgEl = svgWrapRef.current.querySelector('svg');
    const vb = svgEl?.getAttribute('viewBox');
    let svgW = 800, svgH = 600;
    if (vb) {
      const p = vb.split(/[\s,]+/).map(Number);
      if (p.length === 4) { svgW = p[2]; svgH = p[3]; }
    }
    const canvasW = canvasRef.current.clientWidth - 64;
    const canvasH = canvasRef.current.clientHeight - 64;
    setScale(Math.min(canvasW / svgW, canvasH / svgH, 1));
    setPos({ x: 0, y: 0 });
  }

  // ── Keyboard ──────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  // ── Scroll wheel zoom ─────────────────────────────────────────────
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

  // ── Mouse drag ────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    drag.current = { active: true, startX: e.clientX, startY: e.clientY, posX: pos.x, posY: pos.y };
  }, [pos]);
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drag.current.active) return;
    setPos({ x: drag.current.posX + e.clientX - drag.current.startX, y: drag.current.posY + e.clientY - drag.current.startY });
  }, []);
  const onMouseUp = useCallback(() => { drag.current.active = false; }, []);

  // ── Pinch / touch ─────────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      drag.current = { active: true, startX: e.touches[0].clientX, startY: e.touches[0].clientY, posX: pos.x, posY: pos.y };
      pinch.current.active = false;
    } else if (e.touches.length === 2) {
      drag.current.active = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinch.current = { active: true, prevDist: Math.hypot(dx, dy), prevMidX: (e.touches[0].clientX + e.touches[1].clientX) / 2, prevMidY: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
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
        setPos(p => ({ x: cx - (cx - p.x) * (next / prev) + midX - pinch.current.prevMidX, y: cy - (cy - p.y) * (next / prev) + midY - pinch.current.prevMidY }));
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

  const pct = Math.round(scale * 100);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: dark ? '#0d0a05' : '#1a1510', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', flexShrink: 0, zIndex: 1,
        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--accent)', background: 'rgba(201,148,10,0.15)', border: '1px solid rgba(201,148,10,0.3)', borderRadius: 6, padding: '3px 9px' }}>
            {label}
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{type}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Btn onClick={() => setScale(s => clamp(s / 1.25, MIN_SCALE, MAX_SCALE))} title="Zoom out"><ZoomOut size={15} /></Btn>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', minWidth: 46, textAlign: 'center' }}>{pct}%</span>
          <Btn onClick={() => setScale(s => clamp(s * 1.25, MIN_SCALE, MAX_SCALE))} title="Zoom in"><ZoomIn size={15} /></Btn>
          <Btn onClick={fitToScreen} title="Best fit"><Maximize2 size={14} /></Btn>
          <Btn onClick={() => { setScale(1); setPos({ x: 0, y: 0 }); }} title="Reset to 100%"><RotateCcw size={14} /></Btn>
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
        {!ready && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
            Rendering…
          </div>
        )}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: ready ? 1 : 0, transition: 'opacity 0.2s',
        }}>
          <div style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: 'none',
          }}>
            <div
              ref={svgWrapRef}
              style={{
                background: dark ? '#1e1710' : '#ffffff',
                borderRadius: 12,
                padding: 24,
                boxShadow: '0 4px 48px rgba(0,0,0,0.5)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Hint */}
      <div style={{ padding: '6px 0', flexShrink: 0, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.2)' }}>
        Scroll to zoom · Drag to pan · Pinch on touch · Esc to close
      </div>
    </div>
  );
}

function Btn({ onClick, title, children, danger }: { onClick: () => void; title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 7, border: 'none', background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', transition: 'background 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.background = danger ? 'rgba(220,60,60,0.35)' : 'rgba(255,255,255,0.15)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
    >{children}</button>
  );
}
