'use client';

import React, { useEffect, useRef } from 'react';
import { sanitizeMermaidSvg } from '@/lib/sanitize-html';

export default function MermaidDiagram({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !ref.current || !chart || !chart.trim()) return;
    
    const renderChart = async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'neutral',
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

        // Use the mermaid-aware sanitizer: DOMPurify's SVG profile strips the
        // <foreignObject> label HTML (empty boxes); this keeps labels while still
        // removing scripts/handlers. See lib/sanitize-html.ts.
        const cleanSvg = sanitizeMermaidSvg(svg);
        if (ref.current) {
          ref.current.innerHTML = cleanSvg;
        }
      } catch (err) {
        console.error("Mermaid render error:", err);
        if (ref.current) {
          ref.current.innerHTML = '<div class="p-4 text-red-500 text-xs bg-red-50 rounded-xl border border-red-100">Failed to render process flow diagram.</div>';
        }
      }
    };
    
    renderChart();
  }, [chart]);

  return <div ref={ref} className="mermaid-container w-full overflow-x-auto flex justify-center py-6 px-4 bg-gray-50 rounded-3xl border border-gray-100 shadow-inner" style={{ maxHeight: '600px' }} />;
}
