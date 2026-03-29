'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  code: string;
  imagePath?: string | null;
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

    // Watch data-theme attribute changes
    const observer = new MutationObserver(() => setDark(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Watch system preference changes
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMq = () => setDark(read());
    mq.addEventListener('change', onMq);

    return () => { observer.disconnect(); mq.removeEventListener('change', onMq); };
  }, []);

  return dark;
}

export default function MermaidDiagram({ code, imagePath }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dark = useIsDark();

  useEffect(() => {
    if (!code || imagePath) return;
    let cancelled = false;

    async function render() {
      const mermaid = (await import('mermaid')).default;

      mermaid.initialize({
        startOnLoad: false,
        theme: dark ? 'dark' : 'neutral',
        htmlLabels: true,
        flowchart: { htmlLabels: true, wrappingWidth: 180 },
        themeVariables: dark
          ? {
              // Antiquarian dark palette
              background:        '#1e1710',
              mainBkg:           '#26200f',
              nodeBorder:        '#3a3020',
              clusterBkg:        '#26200f',
              clusterBorder:     '#3a3020',
              primaryColor:      '#26200f',
              primaryTextColor:  '#f0e8d5',
              primaryBorderColor:'#e0aa20',
              lineColor:         '#8a7a60',
              secondaryColor:    '#2e2618',
              tertiaryColor:     '#1e1710',
              edgeLabelBackground:'#1e1710',
              titleColor:        '#f0e8d5',
              attributeBackgroundColorEven: '#26200f',
              attributeBackgroundColorOdd:  '#2e2618',
            }
          : {
              // Antiquarian light palette
              background:        '#f5f0e8',
              mainBkg:           '#ffffff',
              nodeBorder:        '#c4b89a',
              clusterBkg:        '#ede8de',
              clusterBorder:     '#c4b89a',
              primaryColor:      '#ffffff',
              primaryTextColor:  '#1a1208',
              primaryBorderColor:'#c9940a',
              lineColor:         '#9a8f7a',
              secondaryColor:    '#f5f0e8',
              tertiaryColor:     '#ede8de',
              edgeLabelBackground:'#f5f0e8',
              titleColor:        '#1a1208',
            },
        securityLevel: 'loose',
      });

      if (cancelled || !containerRef.current) return;
      containerRef.current.innerHTML = '';

      try {
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          const svgEl = containerRef.current.querySelector('svg');
          if (svgEl) {
            svgEl.removeAttribute('width');
            svgEl.removeAttribute('height');
            svgEl.style.width = '100%';
            svgEl.style.minWidth = '400px';
            svgEl.style.height = 'auto';
            svgEl.style.display = 'block';
          }
        }
      } catch {
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = `<pre style="font-size:12px;color:var(--text-3);padding:12px;white-space:pre-wrap">${code}</pre>`;
        }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [code, imagePath, dark]); // re-render when theme changes

  if (imagePath) {
    return (
      <div style={{
        width: '100%', borderRadius: 12, overflow: 'hidden',
        border: '1px solid var(--border)', background: 'var(--surface)',
      }}>
        <img src={imagePath} alt="Story diagram" style={{ width: '100%', objectFit: 'contain', display: 'block' }} />
      </div>
    );
  }

  if (!code) {
    return (
      <div style={{
        width: '100%', minHeight: 120, borderRadius: 12,
        border: '2px dashed var(--border)', background: 'var(--surface-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, color: 'var(--text-3)',
      }}>
        No diagram available
      </div>
    );
  }

  return (
    <div style={{
      width: '100%', borderRadius: 12,
      border: '1px solid var(--border)', background: 'var(--surface)',
      padding: 16, minHeight: 96,
      overflowX: 'auto',
      overflowY: 'visible',
    }}>
      <div ref={containerRef} style={{ minWidth: 'max-content' }} />
    </div>
  );
}
