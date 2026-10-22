/**
 * Where this program touches SAP standard — stage 1 of the fit-to-standard
 * approach (owner decision 22.10.2026; research report §4, concept
 * `docs/design/fit-to-standard-concept.md` §3).
 *
 * What it reads: the findings and uses of the signed run's source as the IT
 * view already has them (`lib/it-findings.ts`, built on the server by
 * `GET /api/projects/{id}/findings`), with SAP's application component per
 * object from the Cloudification Repository (Apache-2.0). Nothing else — no
 * model, no SAP website, no Signavio content.
 *
 * What it says, every statement with its lines:
 *
 *   - **areas** — the SAP application components the program works in, from
 *     the SAP objects it reads, writes or calls. Only application components:
 *     cross-application and basis components (`BC-*`, `CA-*`) are not an area
 *     of the business (a BAPIRET2 or a logging table says nothing about it);
 *   - **departures** — how the program departs from SAP standard: an
 *     enhancement or BAdI implementation, a modification, a copy of SAP code,
 *     batch input on a standard transaction, a direct write to a standard
 *     table, hard-coded customising;
 *   - **the gate** — whether the program is worth examining against SAP
 *     standard (classes A–D, concept §3.2), or why not (§3.3), or that it
 *     cannot be said.
 *
 * What it never says: that SAP standard does what the program does. That is
 * the customer's fit-to-standard workshop (`STANDARD_TOUCH_LIMITS`). The
 * gate's sentence is "worth examining", never "covered".
 *
 * A view: derived when shown, never stored, hashed or signed — like the level
 * and the distance to SAP standard. Pure: no imports beyond types.
 */
import type { ItFindingsSource } from './it-findings';

/**
 * The limits sentence of every stage-1 and stage-2 surface (research report
 * §4), shown visibly — never in a tooltip.
 */
export const STANDARD_TOUCH_LIMITS =
  "Clean-Core.io reads your code and SAP's openly licensed data only. It shows where this program touches and departs from SAP standard — not whether SAP standard does what it does. That is decided in your fit-to-standard workshop; entries here are your own statements or AI-generated suggestions, never a confirmation by SAP.";

export type DepartureKind =
  | 'enhancement'
  | 'modification'
  | 'sap-code-copy'
  | 'batch-input'
  | 'standard-table-write'
  | 'hardcoded-customizing';

export const DEPARTURE_ORDER: readonly DepartureKind[] = [
  'enhancement',
  'modification',
  'sap-code-copy',
  'batch-input',
  'standard-table-write',
  'hardcoded-customizing',
];

/** Plain words for each departure kind — what a business reader can follow. */
export const DEPARTURE_LABELS: Readonly<Record<DepartureKind, string>> = {
  enhancement: 'Enhancement or BAdI implementation inside a standard process',
  modification: 'Modification of SAP code',
  'sap-code-copy': 'Copy of SAP code',
  'batch-input': 'Batch input on a standard transaction',
  'standard-table-write': 'Direct write to a standard table',
  'hardcoded-customizing': 'Hard-coded value that could be customizing',
};

/** The engine's finding kinds behind each departure kind. */
const KIND_TO_DEPARTURE: Readonly<Record<string, DepartureKind>> = {
  enhancement: 'enhancement',
  'hook-implementation': 'enhancement',
  modification: 'modification',
  'sap-code-copy': 'sap-code-copy',
  bdc: 'batch-input',
  'batch-input': 'batch-input',
  'standard-table-write': 'standard-table-write',
  'hardcoded-value': 'hardcoded-customizing',
};

export interface TouchAnchor {
  lineStart: number;
  lineEnd: number | null;
}

export interface TouchArea {
  /** `SD-SLS`: the first two levels of SAP's component. */
  component: string;
  /** The SAP objects of the program in it, upper-cased. */
  objects: string[];
}

export interface TouchDeparture {
  kind: DepartureKind;
  label: string;
  anchors: TouchAnchor[];
  /** The SAP objects the departure is about, where the finding names one. */
  objects: string[];
}

export type GateClass = 'A' | 'B' | 'C' | 'D';

export const GATE_CLASS_LABELS: Readonly<Record<GateClass, string>> = {
  A: 'A — departs from a standard process',
  B: 'B — its own view on standard data',
  C: 'C — drives standard transactions or BAPIs',
  D: 'D — hard-coded customizing',
};

export type GateExclusion = 'no-sap-object' | 'integration' | 'own-persistence';

export const GATE_EXCLUSION_SENTENCES: Readonly<Record<GateExclusion, string>> = {
  'no-sap-object': 'Not offered: the program uses no SAP object, so there is no standard process to compare it with.',
  integration:
    'Not offered: its main effect is an interface to another system (an outbound call or a file exchange), which is integration, not a standard process.',
  'own-persistence':
    'Not offered: it writes only its own tables, so it keeps its own business data. That is a rebuild or a custom business object, not SAP standard.',
};

export type StandardTouchGate =
  | { outcome: 'offered'; classes: GateClass[]; signals: Array<{ cls: GateClass; text: string; anchors: TouchAnchor[] }> }
  | { outcome: 'not-offered'; exclusion: GateExclusion; sentence: string; anchors: TouchAnchor[] }
  | { outcome: 'not-determined'; sentence: string };

export interface StandardTouch {
  areas: TouchArea[];
  /** True when the findings carry no SAP component at all (an answer built before 3.0.21). */
  areasNotRecorded: boolean;
  departures: TouchDeparture[];
  gate: StandardTouchGate;
  /** One plain sentence for a business reader. */
  sentence: string;
}

const WRITE_KINDS = new Set(['standard-table-write', 'custom-table-write', 'bdc', 'batch-input', 'update-task']);
const INTEGRATION_KINDS = new Set(['abap-proxy', 'dataset-io']);
const HOOK_KINDS = new Set(['enhancement', 'hook-implementation', 'modification']);
const CROSS_APPLICATION = /^(BC|CA)(-|$)/;

const anchorOf = (r: { lineStart: number; lineEnd: number | null }): TouchAnchor => ({ lineStart: r.lineStart, lineEnd: r.lineEnd });

function uniqueAnchors(list: TouchAnchor[]): TouchAnchor[] {
  const seen = new Set<string>();
  return list
    .filter((a) => {
      const k = `${a.lineStart}-${a.lineEnd ?? ''}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.lineStart - b.lineStart);
}

/** `L120` or `L212–L288`. */
export function anchorText(a: TouchAnchor): string {
  return a.lineEnd !== null && a.lineEnd !== a.lineStart ? `L${a.lineStart}–L${a.lineEnd}` : `L${a.lineStart}`;
}

function areaOf(component: string): string {
  return component.split('-').slice(0, 2).join('-').toUpperCase();
}

/** The card's reading of one findings source. `null` source → not determined. */
export function standardTouch(source: Pick<ItFindingsSource, 'rows' | 'uses'> | null): StandardTouch {
  if (!source) {
    return {
      areas: [],
      areasNotRecorded: true,
      departures: [],
      gate: { outcome: 'not-determined', sentence: 'Not determined: the findings of the signed run could not be read.' },
      sentence: 'Where this program touches SAP standard cannot be said until its findings are read.',
    };
  }
  const rows = source.rows;
  const uses = source.uses ?? [];
  const sapUses = uses.filter((u) => !u.custom);

  /* ---- areas ---- */
  const byArea = new Map<string, Set<string>>();
  let anyComponent = false;
  for (const u of sapUses) {
    const comp = (u.appComponent ?? '').trim();
    if (!comp) continue;
    anyComponent = true;
    if (CROSS_APPLICATION.test(comp.toUpperCase())) continue;
    const key = areaOf(comp);
    byArea.set(key, (byArea.get(key) ?? new Set()).add(u.object));
  }
  const areas: TouchArea[] = [...byArea.entries()]
    .map(([component, objects]) => ({ component, objects: [...objects].sort() }))
    .sort((a, b) => b.objects.length - a.objects.length || a.component.localeCompare(b.component));

  /* ---- departures ---- */
  const dep = new Map<DepartureKind, { anchors: TouchAnchor[]; objects: Set<string> }>();
  for (const r of rows) {
    const kind = KIND_TO_DEPARTURE[r.kind];
    if (!kind) continue;
    const held = dep.get(kind) ?? { anchors: [], objects: new Set<string>() };
    held.anchors.push(anchorOf(r));
    if (r.objectName) held.objects.add(r.objectName);
    dep.set(kind, held);
  }
  const departures: TouchDeparture[] = DEPARTURE_ORDER.filter((k) => dep.has(k)).map((k) => ({
    kind: k,
    label: DEPARTURE_LABELS[k],
    anchors: uniqueAnchors(dep.get(k)!.anchors),
    objects: [...dep.get(k)!.objects].sort(),
  }));

  return withSentence({ areas, areasNotRecorded: sapUses.length > 0 && !anyComponent, departures, gate: gateOf(rows, uses), sentence: '' });
}

type Rows = ItFindingsSource['rows'];
type Uses = NonNullable<ItFindingsSource['uses']>;

/** Concept §3.2/§3.3, as rules over what the findings show. */
export function gateOf(rows: Rows, uses: Uses): StandardTouchGate {
  const sapUses = uses.filter((u) => !u.custom);
  const kinds = new Set(rows.map((r) => r.kind));
  const of = (pred: (kind: string) => boolean) => rows.filter((r) => pred(r.kind));
  // A hook into SAP code or batch input on an SAP transaction touches SAP by definition.
  const touchesSap =
    sapUses.length > 0 ||
    ['standard-table-read', 'standard-table-write', 'bdc', 'batch-input', ...HOOK_KINDS].some((k) => kinds.has(k));
  if (!touchesSap) {
    return { outcome: 'not-offered', exclusion: 'no-sap-object', sentence: GATE_EXCLUSION_SENTENCES['no-sap-object'], anchors: [] };
  }

  const signals: Array<{ cls: GateClass; text: string; anchors: TouchAnchor[] }> = [];

  // A — a hook into, or a change of, a standard process.
  const hooks = of((k) => HOOK_KINDS.has(k));
  if (hooks.length > 0) {
    signals.push({ cls: 'A', text: 'It hooks into or changes a standard process.', anchors: uniqueAnchors(hooks.map(anchorOf)) });
  }

  // C — batch input on a standard transaction, or a call of an SAP BAPI.
  const batch = of((k) => k === 'bdc' || k === 'batch-input');
  const bapis = sapUses.filter((u) => u.kind === 'bapi' && u.use === 'call' && !u.remote);
  if (batch.length > 0 || bapis.length > 0) {
    signals.push({
      cls: 'C',
      text:
        batch.length > 0
          ? 'It drives a standard transaction by batch input.'
          : `It drives SAP through ${bapis.length === 1 ? 'a BAPI' : 'BAPIs'} (${bapis.map((b) => b.object).slice(0, 3).join(', ')}).`,
      anchors: uniqueAnchors([...batch.map(anchorOf), ...bapis.flatMap((b) => b.lines.map((l) => ({ lineStart: l, lineEnd: null })))]),
    });
  }

  // B — no write of any kind, reads of SAP tables, every one of them with a released path (level A–C).
  const reads = of((k) => k === 'standard-table-read');
  const writes = rows.some((r) => WRITE_KINDS.has(r.kind));
  if (!writes && reads.length > 0 && reads.every((r) => r.level === 'A' || r.level === 'B' || r.level === 'C')) {
    signals.push({
      cls: 'B',
      text: 'It only reads standard data and shows it its own way; every SAP table it reads has a released path.',
      anchors: uniqueAnchors(reads.map(anchorOf)),
    });
  }

  const strong = signals.some((s) => s.cls === 'A' || s.cls === 'C');

  // Exclusions — after the strong signals, because "main effect" is read as "and nothing that bends the standard".
  // Outbound: a function module called with a DESTINATION — customer or SAP, it leaves this system.
  const outbound = remoteLines(uses);
  const integration = [...of((k) => INTEGRATION_KINDS.has(k)).map(anchorOf), ...outbound.map((l) => ({ lineStart: l, lineEnd: null }))];
  if (!strong && (outbound.length > 0 || kinds.has('abap-proxy') || kinds.has('dataset-io'))) {
    return { outcome: 'not-offered', exclusion: 'integration', sentence: GATE_EXCLUSION_SENTENCES.integration, anchors: uniqueAnchors(integration) };
  }
  const ownWrites = of((k) => k === 'custom-table-write');
  const writesStandard = kinds.has('standard-table-write') || batch.length > 0 || bapis.length > 0;
  if (!signals.some((s) => s.cls === 'A') && ownWrites.length > 0 && !writesStandard) {
    return {
      outcome: 'not-offered',
      exclusion: 'own-persistence',
      sentence: GATE_EXCLUSION_SENTENCES['own-persistence'],
      anchors: uniqueAnchors(ownWrites.map(anchorOf)),
    };
  }

  // D — an add-on to A–C, never offered alone (concept §3.2: "weak alone").
  const hard = of((k) => k === 'hardcoded-value');
  if (signals.length > 0 && hard.length > 0) {
    signals.push({ cls: 'D', text: 'Values in the code could become standard configuration.', anchors: uniqueAnchors(hard.map(anchorOf)) });
  }

  if (signals.length === 0) {
    return {
      outcome: 'not-determined',
      sentence:
        'Not determined: nothing the engine read shows a departure from, or a drive of, a standard process — and nothing rules one out.',
    };
  }
  const order: GateClass[] = ['A', 'B', 'C', 'D'];
  signals.sort((a, b) => order.indexOf(a.cls) - order.indexOf(b.cls));
  return { outcome: 'offered', classes: signals.map((s) => s.cls), signals };
}

/** The lines of calls that leave this system (`CALL FUNCTION … DESTINATION`). */
function remoteLines(uses: Uses): number[] {
  return [...new Set(uses.filter((u) => u.remote).flatMap((u) => u.lines))].sort((a, b) => a - b);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** The one plain sentence for business (research report §4, stage 1). */
function withSentence(t: StandardTouch): StandardTouch {
  const area = t.areas[0]?.component ?? null;
  const places = t.departures.reduce((n, d) => n + d.anchors.length, 0);
  let sentence: string;
  if (t.gate.outcome === 'offered') {
    sentence = `Worth examining against SAP standard: ${
      t.departures.length > 0 ? `it departs from standard in ${plural(places, 'place')}` : 'it works on standard data'
    }${area ? `, mainly in the SAP area ${area}` : ''}. Whether SAP standard does what it does is decided in your fit-to-standard workshop.`;
  } else if (t.gate.outcome === 'not-offered') {
    sentence = t.gate.sentence;
  } else {
    sentence = t.gate.sentence;
  }
  return { ...t, sentence };
}
