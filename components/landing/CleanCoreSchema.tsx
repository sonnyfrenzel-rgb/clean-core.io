/**
 * "What clean core means" as a picture — landing mockup, section `clean-core`.
 *
 * A concept, not data: the SAP core stays standard, extensions reach it only
 * through released interfaces (in-app with ABAP Cloud, side-by-side on SAP BTP
 * through an API), and a modification goes through the boundary into SAP code.
 * Server-rendered SVG in the page's tokens; the list beside it says the same in
 * words for a screen reader.
 */
export default function CleanCoreSchema() {
  const box = 'fill-cc-surface stroke-cc-ink-muted';
  return (
    <svg viewBox="0 0 440 250" className="mx-auto block h-auto w-full max-w-md" role="img" aria-label="The SAP core stays standard inside a boundary of released interfaces. Side-by-side extensions on SAP BTP reach it through an API, in-app extensions with ABAP Cloud; a modification changes SAP code through the boundary.">
      <text x="220" y="16" textAnchor="middle" fontSize={12} className="fill-cc-ink-muted">
        boundary: released interfaces
      </text>
      <rect x="150" y="28" width="140" height="120" rx="8" className="fill-cc-surface-muted stroke-cc-information" strokeWidth={1.8} />
      {[180, 220, 260].map((x) => (
        <rect key={x} x={x - 5} y="23" width="10" height="10" className="fill-cc-surface stroke-cc-information" strokeWidth={1.5} />
      ))}
      <rect x="166" y="44" width="108" height="88" rx="4" className={box} strokeWidth={1.3} />
      <text x="220" y="84" textAnchor="middle" fontSize={12} fontWeight={600} className="fill-cc-ink">
        SAP core
      </text>
      <text x="220" y="100" textAnchor="middle" fontSize={12} className="fill-cc-ink-muted">
        standard
      </text>

      <rect x="10" y="62" width="100" height="52" rx="6" className={box} strokeWidth={1.3} />
      <text x="60" y="84" textAnchor="middle" fontSize={12} fontWeight={600} className="fill-cc-ink">
        side-by-side
      </text>
      <text x="60" y="100" textAnchor="middle" fontSize={12} className="fill-cc-ink-muted">
        SAP BTP
      </text>
      <path d="M110 88 H150" className="stroke-cc-information" strokeWidth={1.5} />
      <rect x="145" y="83" width="10" height="10" className="fill-cc-surface stroke-cc-information" strokeWidth={1.5} />
      <text x="128" y="80" textAnchor="middle" fontSize={11} className="fill-cc-ink-muted">
        API
      </text>

      <rect x="330" y="62" width="100" height="52" rx="6" className={box} strokeWidth={1.3} />
      <text x="380" y="84" textAnchor="middle" fontSize={12} fontWeight={600} className="fill-cc-ink">
        in-app
      </text>
      <text x="380" y="100" textAnchor="middle" fontSize={12} className="fill-cc-ink-muted">
        ABAP Cloud
      </text>
      <path d="M290 88 H330" className="stroke-cc-information" strokeWidth={1.5} />
      <rect x="285" y="83" width="10" height="10" className="fill-cc-surface stroke-cc-information" strokeWidth={1.5} />

      <path d="M220 236 L220 212 L210 200 L230 186 L220 172 L220 136" className="fill-none stroke-cc-error" strokeWidth={1.8} />
      <path d="M213 146 L220 134 L227 146" className="fill-none stroke-cc-error" strokeWidth={1.8} />
      <text x="238" y="205" fontSize={12} fontWeight={600} className="fill-cc-error">
        modification
      </text>
      <text x="238" y="221" fontSize={12} className="fill-cc-error">
        changes SAP code
      </text>
    </svg>
  );
}
