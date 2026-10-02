/**
 * "What clean core means" as a picture — landing mockup, section `clean-core`,
 * its two drawings: the wide one, and a tall one for a phone.
 *
 * A concept, not data: the SAP core stays standard inside a boundary of
 * released interfaces; in-app with ABAP Cloud docks on the boundary, a
 * side-by-side extension on SAP BTP comes through an API, and a modification breaks into the core. The mockup's
 * geometry, drawn in the page's tokens.
 */
const BOX = 'fill-cc-surface stroke-cc-field-border';
const STRONG = { fontWeight: 600 } as const;
const SOFT = { fontWeight: 500 } as const;
const LABEL =
  'The SAP core with a boundary of released interfaces. An in-app extension with ABAP Cloud docks on the boundary, a side-by-side extension on SAP BTP connects through an API, and a modification breaks into the core and changes SAP code.';

export default function CleanCoreSchema() {
  return (
    <>
      <svg className="schema l" width="420" height="226" viewBox="0 0 420 226" role="img" aria-label={LABEL}>
        <text x="212" y="16" textAnchor="middle" style={SOFT} className="fill-cc-ink-muted">
          boundary: released interfaces
        </text>
        <rect x="136.5" y="32.5" width="152" height="126" rx="6" className="fill-none stroke-cc-field-border" strokeWidth={1.2} />
        <g className={BOX} strokeWidth={1.2}>
          <rect x="160" y="28" width="9" height="9" />
          <rect x="208" y="28" width="9" height="9" />
          <rect x="256" y="28" width="9" height="9" />
          <rect x="132" y="91" width="9" height="9" />
          <rect x="284" y="91" width="9" height="9" />
        </g>
        <rect x="152.5" y="48.5" width="120" height="94" rx="4" className="fill-cc-surface-muted stroke-cc-field-border" />
        <text x="212" y="92" textAnchor="middle" style={STRONG} className="fill-cc-ink">
          SAP core
        </text>
        <text x="212" y="108" textAnchor="middle" style={SOFT} className="fill-cc-ink-muted">
          standard
        </text>
        <path d="M293 95.5 H304" className="stroke-cc-field-border" strokeWidth={1.2} />
        <rect x="304.5" y="70.5" width="110" height="50" rx="6" className={BOX} />
        <text x="359" y="92" textAnchor="middle" style={STRONG} className="fill-cc-ink">
          in-app
        </text>
        <text x="359" y="108" textAnchor="middle" style={SOFT} className="fill-cc-ink-muted">
          ABAP Cloud
        </text>
        <rect x="2.5" y="70.5" width="96" height="50" rx="6" className={BOX} />
        <text x="50" y="92" textAnchor="middle" style={STRONG} className="fill-cc-ink">
          side-by-side
        </text>
        <text x="50" y="108" textAnchor="middle" style={SOFT} className="fill-cc-ink-muted">
          SAP BTP
        </text>
        <path d="M99 95.5 H132" className="stroke-cc-field-border" strokeWidth={1.2} />
        <text x="116" y="88" textAnchor="middle" style={SOFT} className="fill-cc-ink-muted">
          API
        </text>
        <path d="M212 222 V190 L205 182 L219 174 L212 166 V150" className="fill-none stroke-cc-error" strokeWidth={2} />
        <path d="M206 156 L212 146 L218 156" className="fill-none stroke-cc-error" strokeWidth={2} />
        <text x="226" y="196" style={STRONG} className="fill-cc-error">
          modification
        </text>
        <text x="226" y="212" style={SOFT} className="fill-cc-error">
          changes SAP code
        </text>
      </svg>
      <svg className="schema s" width="300" height="306" viewBox="0 0 300 306" role="img" aria-label={LABEL}>
        <rect x="35.5" y="4.5" width="140" height="48" rx="6" className={BOX} />
        <text x="105" y="25" textAnchor="middle" style={STRONG} className="fill-cc-ink">
          side-by-side
        </text>
        <text x="105" y="41" textAnchor="middle" style={SOFT} className="fill-cc-ink-muted">
          SAP BTP
        </text>
        <path d="M105.5 53 V82" className="stroke-cc-field-border" strokeWidth={1.2} />
        <text x="114" y="72" style={SOFT} className="fill-cc-ink-muted">
          API
        </text>
        <rect x="20.5" y="86.5" width="170" height="140" rx="6" className="fill-none stroke-cc-field-border" strokeWidth={1.2} />
        <g className={BOX} strokeWidth={1.2}>
          <rect x="101" y="82" width="9" height="9" />
          <rect x="186" y="152" width="9" height="9" />
          <rect x="16" y="152" width="9" height="9" />
        </g>
        <rect x="36.5" y="104.5" width="138" height="104" rx="4" className="fill-cc-surface-muted stroke-cc-field-border" />
        <text x="105" y="152" textAnchor="middle" style={STRONG} className="fill-cc-ink">
          SAP core
        </text>
        <text x="105" y="168" textAnchor="middle" style={SOFT} className="fill-cc-ink-muted">
          standard
        </text>
        <text x="200" y="98" style={SOFT} className="fill-cc-ink-muted">
          boundary:
        </text>
        <text x="200" y="113" style={SOFT} className="fill-cc-ink-muted">
          released
        </text>
        <text x="200" y="128" style={SOFT} className="fill-cc-ink-muted">
          interfaces
        </text>
        <path d="M195 156.5 H206" className="stroke-cc-field-border" strokeWidth={1.2} />
        <rect x="206.5" y="132.5" width="90" height="48" rx="6" className={BOX} />
        <text x="251" y="153" textAnchor="middle" style={STRONG} className="fill-cc-ink">
          in-app
        </text>
        <text x="251" y="169" textAnchor="middle" style={SOFT} className="fill-cc-ink-muted">
          ABAP Cloud
        </text>
        <path d="M105 304 V272 L98 264 L112 256 L105 248 V204" className="fill-none stroke-cc-error" strokeWidth={2} />
        <path d="M99 206 L105 196 L111 206" className="fill-none stroke-cc-error" strokeWidth={2} />
        <text x="122" y="276" style={STRONG} className="fill-cc-error">
          modification
        </text>
        <text x="122" y="292" style={SOFT} className="fill-cc-error">
          changes SAP code
        </text>
      </svg>
    </>
  );
}
