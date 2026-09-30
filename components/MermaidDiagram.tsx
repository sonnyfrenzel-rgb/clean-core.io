'use client';

import React, { useEffect, useRef, useState } from 'react';
import { sanitizeMermaidSvg } from '@/lib/sanitize-html';
import CcMessageStrip from '@/components/cc/MessageStrip';

/**
 * The theme colours, read from the design tokens (DESIGN.md §1.1) at render
 * time. Mermaid derives shades from what it is given, so it needs resolved
 * colour values, not `var(--…)` — hence the read from the computed style
 * rather than a second copy of the hex values here.
 */
function tokenThemeVariables(): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  const surface = token('--cc-surface');
  const muted = token('--cc-surface-muted');
  const ink = token('--cc-ink');
  const inkMuted = token('--cc-ink-muted');
  const border = token('--cc-field-border');
  const vars: Record<string, string> = {
    background: surface,
    mainBkg: muted,
    primaryColor: muted,
    primaryTextColor: ink,
    primaryBorderColor: border,
    secondaryColor: surface,
    tertiaryColor: surface,
    lineColor: inkMuted,
    textColor: ink,
    nodeBorder: border,
    clusterBkg: surface,
    clusterBorder: token('--cc-line'),
    edgeLabelBackground: surface,
    fontFamily: 'inherit',
  };
  // A token that did not resolve (no stylesheet yet) is left to mermaid's default.
  return Object.fromEntries(Object.entries(vars).filter(([, v]) => v !== ''));
}

export default function MermaidDiagram({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !ref.current || !chart || !chart.trim()) return;

    const renderChart = async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: tokenThemeVariables(),
          securityLevel: 'strict',
          flowchart: {
            useMaxWidth: false,
            htmlLabels: true,
            curve: 'basis',
            padding: 15,
            nodeSpacing: 30,
            rankSpacing: 40,
          },
        });
        const id = 'm' + Math.random().toString(36).substr(2, 9);
        const { svg } = await mermaid.render(id, chart);

        // Use the mermaid-aware sanitizer: the strict SVG profile empties the
        // <foreignObject> that carries the label (blank boxes), so this one is
        // configured to let label markup through and nothing else.
        // See lib/sanitize-html.ts.
        const cleanSvg = sanitizeMermaidSvg(svg);
        if (ref.current) {
          ref.current.innerHTML = cleanSvg;
        }
        setFailed(false);
      } catch (err) {
        console.error("Mermaid render error:", err);
        if (ref.current) {
          ref.current.innerHTML = '';
        }
        setFailed(true);
      }
    };

    renderChart();
  }, [chart]);

  return (
    <>
      {failed && (
        <CcMessageStrip state="error">Failed to render process flow diagram.</CcMessageStrip>
      )}
      <div
        ref={ref}
        hidden={failed}
        className="mermaid-container w-full overflow-x-auto flex justify-center py-6 px-4 bg-cc-surface-muted rounded-cc-card border border-cc-line"
        style={{ maxHeight: '600px' }}
      />
    </>
  );
}
