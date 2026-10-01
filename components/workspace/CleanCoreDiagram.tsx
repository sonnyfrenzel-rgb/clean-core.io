import { wt } from '@/lib/workspace-messages';

/**
 * "What clean core means" as a picture — mockup 2.8 s14, ADR-040.
 *
 * The SAP core as a block inside its boundary of released interfaces; an in-app
 * extension docks on the boundary, a side-by-side extension reaches it through
 * an API, and a modification breaks into the core from below. Geometry from the
 * mockup, colours from the tokens (the error ink only for the modification),
 * words from the catalogue.
 */
export default function CleanCoreDiagram() {
  return (
    <svg
      data-clean-core-diagram=""
      viewBox="0 0 356 206"
      role="img"
      aria-label={wt('coreDiagram.label')}
      className="mt-2 block h-auto w-full max-w-[356px]"
    >
      <rect x="104.5" y="30.5" width="148" height="120" rx="6" className="fill-none stroke-cc-ink-muted" strokeWidth="1.2" />
      <g className="fill-cc-surface stroke-cc-ink-muted" strokeWidth="1.2">
        <rect x="126" y="26" width="8" height="8" />
        <rect x="174" y="26" width="8" height="8" />
        <rect x="222" y="26" width="8" height="8" />
        <rect x="100" y="91" width="8" height="8" />
        <rect x="248" y="91" width="8" height="8" />
      </g>
      <text x="178" y="16" textAnchor="middle" className="fill-cc-ink-muted text-[11px] font-medium">
        {wt('coreDiagram.boundary')}
      </text>
      <rect x="120.5" y="44.5" width="116" height="92" rx="4" className="fill-cc-surface-muted stroke-cc-ink-muted" />
      <text x="178" y="86" textAnchor="middle" className="fill-cc-ink text-[12px] font-semibold">
        {wt('coreDiagram.core')}
      </text>
      <text x="178" y="101" textAnchor="middle" className="fill-cc-ink-muted text-[11px] font-medium">
        {wt('coreDiagram.standard')}
      </text>
      <rect x="256.5" y="72.5" width="94" height="46" rx="6" className="fill-cc-surface stroke-cc-ink-muted" />
      <text x="303" y="92" textAnchor="middle" className="fill-cc-ink text-[11px] font-semibold">
        {wt('coreDiagram.inApp')}
      </text>
      <text x="303" y="107" textAnchor="middle" className="fill-cc-ink-muted text-[11px] font-medium">
        {wt('coreDiagram.abapCloud')}
      </text>
      <rect x="0.5" y="72.5" width="78" height="46" rx="6" className="fill-cc-surface stroke-cc-ink-muted" />
      <text x="39.5" y="92" textAnchor="middle" className="fill-cc-ink text-[11px] font-semibold">
        {wt('coreDiagram.sideBySide')}
      </text>
      <text x="39.5" y="107" textAnchor="middle" className="fill-cc-ink-muted text-[11px] font-medium">
        {wt('coreDiagram.btp')}
      </text>
      <path d="M79 95 H100" className="stroke-cc-ink-muted" strokeWidth="1.2" />
      <text x="89" y="88" textAnchor="middle" className="fill-cc-ink-muted text-[11px] font-medium">
        {wt('coreDiagram.api')}
      </text>
      <path d="M178 196 V168 L171 160 L185 152 L178 144 V128" className="fill-none stroke-cc-error" strokeWidth="2" />
      <path d="M172 134 L178 124 L184 134" className="fill-none stroke-cc-error" strokeWidth="2" />
      <text x="190" y="190" className="fill-cc-error text-[11px] font-semibold">
        {wt('coreDiagram.modification')}
      </text>
      <text x="190" y="203" className="fill-cc-error text-[11px] font-medium">
        {wt('coreDiagram.changesCode')}
      </text>
    </svg>
  );
}
