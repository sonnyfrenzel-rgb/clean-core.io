/**
 * The deterministic checks a stored solution design passes before it is
 * written out — release 3.0.13 (SD review of 3.0.12: CR-D7, A03, A04, 2.5).
 *
 * The design is model text. The prompt asks for the right things; this module
 * holds what came back against them, without a model, wherever the design is
 * exported (`formatDesignToMarkdown`, the Confluence page):
 *
 *   1. **The route's own words** (`designRouteOf`). The renderer wrote "Target
 *      Node.js Framework: SAP RAP" and "the recommended side-by-side
 *      microservice project layout" under a RAP design — template text of the
 *      CAP route. A RAP design is labelled as one, and Node.js, npm, Express or
 *      microservice wording the model wrote into it is listed as refused
 *      (`rapTemplateRemnants`).
 *   2. **The scaffold's object names** (`alignRapDesignNames`). The design named
 *      `zi_returncreditclaim_r` where the package delivers `zsd_return_cr_r`.
 *      The RAP scaffold names every object from one short name
 *      (`rapShortName`, `lib/transformation/rap-names.ts`, re-exported by `scaffold-rap.ts` — imported, never
 *      copied); the design's artifact list is rewritten to those names, and
 *      every other mention of a renamed object (endpoint paths, roadmap) with
 *      it. An artifact the scaffold does not generate is kept and said to be
 *      beyond the package.
 *   3. **No consistency promise from MVCC** (`refuseMvccClaims`). "Consistent
 *      read states are guaranteed natively by SAP HANA multi-version
 *      concurrency control" is refused: a technically consistent snapshot is
 *      one moment of the database; it does not reconstruct what was effective
 *      at one cut-off and known at another, and it cannot hold a message that
 *      was never stored. When the program reads at two cut-offs
 *      (`readsAtTwoCutoffs`), the design says a certified input snapshot is
 *      needed.
 *   4. **Short marks, one matrix** (`annotateSapReferencesCompact`). The long
 *      evidence sentence after every SAP name broke the design's sentences; a
 *      name found in a catalog or verified carries its state word only, and
 *      the identifier table at the end carries the evidence, including whether
 *      a release or an edition was checked. A wrong name, an unverified one and
 *      every mark whose licence asks for its source where it stands keep the
 *      full mark.
 *
 * Pure: no React, no Firestore, no model.
 */

import { rapShortName, rapTableName } from './transformation/rap-names';
import { programArchitecture } from './transformation/architecture';
import { abapDeliveryOf } from './transformation/abap-delivery';
import { accessPointsOf } from './transformation/access-layer';
import { programNameOf } from './abap/callback-registrations';
import { readStatements } from './abap/statement-reader';
import { readBlocks } from './abap/block-structure';
import { readCallGraphFrom } from './abap/call-graph';
import { readOriginalContract } from './abap/original-contract';
import { findSapIdentifiers, occurrencesToMark, sapIdMark, sapIdStateWord, type SapIdCheck } from './sap-reference-check';

/* ------------------------------------------------------------------ route */

export type DesignRoute = 'rap' | 'cap';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The route a stored design was written for, read from what the RAP prompt
 * fixes (`nodeFramework` "SAP RAP …", `runtimePlatform` "SAP S/4HANA Core
 * (Developer Extensibility)"); a design that names neither is the CAP route's.
 */
export function designRouteOf(design: unknown): DesignRoute {
  const o = isObj(design) && isObj(design.architectureOverview) ? design.architectureOverview : {};
  const said = `${typeof o.nodeFramework === 'string' ? o.nodeFramework : ''} ${typeof o.runtimePlatform === 'string' ? o.runtimePlatform : ''}`;
  if (/\bCAP\b|Cloud Application Programming|\bBTP\b|Business Technology Platform/i.test(said) && !/\bRAP\b|RESTful Application Programming/i.test(said)) return 'cap';
  return /\bRAP\b|RESTful Application Programming|ABAP Cloud|Developer Extensibility|S\/4HANA Core/i.test(said) ? 'rap' : 'cap';
}

/** The words a renderer writes for the route — never the CAP template's under a RAP design. */
export const DESIGN_ROUTE_WORDS: Readonly<Record<DesignRoute, { framework: string; layoutLead: string }>> = Object.freeze({
  rap: {
    framework: 'Target framework',
    layoutLead: 'The ABAP objects of the in-app (ABAP Cloud) package:',
  },
  cap: {
    framework: 'Target Node.js Framework',
    layoutLead: 'Below is the recommended side-by-side microservice project layout:',
  },
});

const REMNANT = /\bNode\.?js\b|\bnpm\b|\bExpress(?:\.js)?\b|\bmicro-?services?\b|\bDockerfile\b|\bpackage\.json\b/gi;

/** Every string of a value, with where it stands (`cloudServices[0].purpose`). */
function strings(value: unknown, at = ''): Array<{ at: string; text: string }> {
  if (typeof value === 'string') return [{ at, text: value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${at}[${i}]`));
  if (isObj(value)) return Object.entries(value).flatMap(([k, v]) => strings(v, at ? `${at}.${k}` : k));
  return [];
}

/**
 * Side-by-side template wording the model wrote into a RAP design — Node.js,
 * npm, Express, microservices, a Dockerfile — as `"field: word"` entries. The
 * option comparison is left out: it weighs CAP on purpose.
 */
export function rapTemplateRemnants(design: unknown): string[] {
  if (!isObj(design)) return [];
  const { optionComparison: _weighsCapOnPurpose, ...rest } = design;
  void _weighsCapOnPurpose;
  const out: string[] = [];
  for (const s of strings(rest)) {
    const words = [...new Set([...s.text.matchAll(REMNANT)].map((m) => m[0]))];
    if (words.length) out.push(`${s.at}: ${words.join(', ')}`);
  }
  return out;
}

/* ------------------------------------------------------------ RAP names */

/** The names the RAP scaffold gives a program's objects — the same derivation, imported. */
export interface RapDesignNames {
  short: string;
  table: string;
  root: string;
  projection: string;
  behaviorPool: string;
  logic: string;
  serviceDefinition: string;
  serviceBinding: string;
  accessInterface: string;
  accessClass: string;
  job: string;
  /** The custom entity of a program that writes no table (`z<short>_ce`). */
  entity: string;
  /** Its query provider (`zcl_<short>_query`). */
  query: string;
}

export function rapDesignNames(program: string | null): RapDesignNames {
  const s = rapShortName(program);
  return {
    short: s,
    table: rapTableName(s),
    root: `z${s}_r`,
    projection: `z${s}_c`,
    behaviorPool: `zbp_${s}_r`,
    logic: `zcl_${s}_logic`,
    serviceDefinition: `z${s}_srvd`,
    serviceBinding: `z${s}_srvb`,
    accessInterface: `zif_${s}_access`,
    accessClass: `zcl_${s}_access`,
    job: `zcl_${s}_job`,
    entity: `z${s}_ce`,
    query: `zcl_${s}_query`,
  };
}

/* ------------------------------------------------- what the package delivers */

/**
 * The RAP variant a package is: a managed business object over the record
 * table (the original writes a table), or a custom entity with a query
 * provider (a report or simulation) — `lib/transformation/architecture.ts`.
 */
export type RapVariant = 'managed-bo' | 'custom-entity';

/** One ABAP object of the package, as abapGit names its file: `zsd_x_r` + `ddls`. */
export interface RapObject {
  name: string;
  type: string;
}

/**
 * What the RAP package delivers — roadmap 3.0.18 item 13 (QM-07, FI-F02). The
 * design described a table, a behavior definition and a DCL with `pfcg_auth`
 * for a package that delivers a custom entity, and listed objects the package
 * does deliver as "not generated". The list is the package's file list when
 * one is at hand (`basis: 'package'`), else the objects the scaffold writes for
 * this source, read with the scaffold's own decisions (architecture, job,
 * service, access layer — `basis: 'source'`; `tests/design-delivered-objects.spec.ts`
 * holds it against `buildRapScaffold` on the starter examples).
 */
export interface RapDelivered {
  variant: RapVariant | null;
  objects: RapObject[];
  basis: 'package' | 'source';
}

const OBJECT_FILE = /^(?:.*\/)?([a-z0-9_/#]+?)\.([a-z]{4})(?:\.[a-z0-9_.]+)?$/i;

/** The objects a package's file paths name, each once, in path order; abapGit's package file left out. */
export function rapObjectsOfFiles(paths: readonly string[]): RapObject[] {
  const seen = new Set<string>();
  const out: RapObject[] = [];
  for (const p of paths) {
    const m = OBJECT_FILE.exec(p.trim());
    if (!m || m[2].toLowerCase() === 'devc' || p.startsWith('.')) continue;
    const key = `${m[1].toLowerCase()}.${m[2].toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: m[1].toLowerCase(), type: m[2].toLowerCase() });
  }
  return out;
}

/** The variant a list of objects is: a behavior definition makes a business object, a `_ce` view a custom entity. */
export function rapVariantOfObjects(objects: readonly RapObject[]): RapVariant | null {
  if (objects.some((o) => o.type === 'bdef')) return 'managed-bo';
  if (objects.some((o) => o.type === 'ddls' && /_ce$/.test(o.name))) return 'custom-entity';
  return null;
}

/** The delivered objects from a package's file list. */
export function rapDeliveredFromFiles(paths: readonly string[]): RapDelivered {
  const objects = rapObjectsOfFiles(paths);
  return { variant: rapVariantOfObjects(objects), objects, basis: 'package' };
}

/** The objects the RAP scaffold writes for this source, or null when there is no readable source. */
export function rapDeliveredFromSource(code: string | null | undefined): RapDelivered | null {
  if (typeof code !== 'string' || !code.trim()) return null;
  try {
    const text = code.replace(/\r\n?/g, '\n');
    const statements = readStatements(text);
    const graph = readCallGraphFrom(statements, readBlocks(statements));
    const contract = readOriginalContract(text);
    const n = rapDesignNames(programNameOf(statements));
    const variant: RapVariant = programArchitecture({ graph }) === 'writing' ? 'managed-bo' : 'custom-entity';
    const delivery = abapDeliveryOf({ statements, graph, contract });
    const withJob = delivery.kind !== 'ui-service';
    const withService = delivery.kind !== 'application-job';
    const hasAccess = accessPointsOf({ statements, graph }, { customerWrites: true, files: true }).points.length > 0;
    const o = (name: string, type: string): RapObject => ({ name, type });
    const objects: RapObject[] = [
      o(n.logic, 'clas'), o(`zcx_${n.short}_refusal`, 'clas'), o(`zcx_${n.short}_nofill`, 'clas'),
      ...(hasAccess ? [o(n.accessInterface, 'intf'), o(n.accessClass, 'clas'), o(`zcx_${n.short}_access`, 'clas')] : []),
      ...(variant === 'custom-entity'
        ? [o(n.entity, 'ddls'), o(n.query, 'clas')]
        : [o(n.table, 'tabl'), o(n.root, 'ddls'), o(n.projection, 'ddls'), o(`z${n.short}_p`, 'ddls'), o(n.root, 'dcls'), o(n.projection, 'dcls'), o(n.root, 'bdef'), o(n.behaviorPool, 'clas')]),
      ...(withJob ? [o(n.job, 'clas'), o(`zcl_${n.short}_job_setup`, 'clas')] : []),
      ...(withService ? [o(n.serviceDefinition, 'srvd'), o(n.serviceBinding, 'srvb')] : []),
    ];
    return { variant, objects, basis: 'source' };
  } catch {
    return null;
  }
}

/** The variant in words. */
export const RAP_VARIANT_WORDS: Readonly<Record<RapVariant, string>> = Object.freeze({
  'custom-entity': 'a custom entity with a query provider (the original writes no table)',
  'managed-bo': 'a managed business object over its record table (the original writes a table)',
});

/**
 * Said where a design proposes CDS access control for a custom entity. SAP: a
 * custom entity has no CDS access control; its query provider class is where
 * the authorization is checked.
 */
export const CUSTOM_ENTITY_AUTH_NOTE =
  'A custom entity is not protected by a CDS access control (DCL): its rows come from the query provider class, not from a view an access control could restrict. '
  + 'The query provider checks the authorization (AUTHORITY-CHECK) before it returns rows.';

/** A security row or a text that proposes CDS access control: DCL, `define role`, `pfcg_auth`, "access control". */
const DCL_CLAIM = /\bDCL\b|\bpfcg_auth\b|\bdefine\s+role\b|\b(?:CDS\s+)?access\s+controls?\b|\.dcls\b|\basdcls\b/i;

/** The program a source declares (`REPORT`/`PROGRAM`), as the engine reads it; `null` when it declares none. */
export function programOfSource(code: string | null | undefined): string | null {
  if (typeof code !== 'string' || !code.trim()) return null;
  try {
    return programNameOf(readStatements(code));
  } catch {
    return null;
  }
}

/** The file of each object as the scaffold writes it (abapGit serializer file names). */
const SCAFFOLD_FILE: Readonly<Record<string, string>> = Object.freeze({
  ddls: 'ddls.asddls',
  dcls: 'dcls.asdcls',
  bdef: 'bdef.asbdef',
  clas: 'clas.abap',
  intf: 'intf.abap',
  srvd: 'srvd.srvdsrv',
  srvb: 'srvb.xml',
  tabl: 'tabl.xml',
});

const PROJECTION = /(?:^zc_|_c$|_p$|_proj|proj_|consum)/i;

export interface RapNameAlignment<T> {
  design: T;
  /** Object names of the model replaced by the scaffold's, lower case. */
  renamed: Array<{ from: string; to: string }>;
  /** Artifact paths the scaffold does not generate — kept, said to be beyond the package. */
  beyond: string[];
}

function scaffoldNameFor(name: string, type: string, purpose: string, names: RapDesignNames, taken: Set<string>, variant: RapVariant | null = null): string | null {
  const projection = PROJECTION.test(name) || /\bprojection\b/i.test(purpose);
  // 3.0.18 item 13 (QM-07): a custom entity package has one view — the entity — and a query class; nothing else of a business object.
  if (variant === 'custom-entity') {
    if (type === 'ddls') return projection ? null : names.entity;
    if (type === 'dcls' || type === 'bdef' || type === 'tabl') return null;
    if (type === 'clas' && (/query|provider/i.test(name) || /\bquery\b/i.test(purpose))) return names.query;
    if (type === 'clas' && /^zbp_/i.test(name)) return null;
  }
  switch (type) {
    case 'ddls':
    case 'dcls':
      return projection ? names.projection : names.root;
    case 'bdef':
      return projection ? null : names.root;
    case 'clas':
      if (/^zbp_/i.test(name)) return names.behaviorPool;
      if (/query|provider/i.test(name)) return variant === 'managed-bo' ? null : names.query;
      if (/test/i.test(name)) return null;
      if (/job/i.test(name)) return names.job;
      if (/access|adapter|reader/i.test(name)) return names.accessClass;
      return taken.has(names.logic) ? null : names.logic;
    case 'intf':
      return names.accessInterface;
    case 'srvd':
      return names.serviceDefinition;
    case 'srvb':
      return names.serviceBinding;
    case 'tabl':
      return names.table;
    default:
      return null;
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function renameIn(value: unknown, renames: ReadonlyArray<{ from: string; to: string }>): unknown {
  if (typeof value === 'string') {
    let out = value;
    for (const r of renames) {
      out = out.replace(new RegExp(`(?<![A-Za-z0-9_])${escapeRe(r.from)}(?![A-Za-z0-9_])`, 'gi'), (m) => (m === m.toUpperCase() ? r.to.toUpperCase() : r.to));
    }
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => renameIn(v, renames));
  if (isObj(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renameIn(v, renames)]));
  return value;
}

/**
 * The design with its RAP artifact list on the scaffold's names (see the file
 * comment, 2). Paths keep their folder; the file name becomes the scaffold's.
 */
export function alignRapDesignNames<T>(design: T, program: string | null, delivered: RapDelivered | null = null): RapNameAlignment<T> {
  if (!isObj(design) || !isObj(design.nodeAppBlueprint) || !Array.isArray(design.nodeAppBlueprint.projectStructure)) {
    return { design, renamed: [], beyond: [] };
  }
  const names = rapDesignNames(program);
  const taken = new Set<string>();
  const renames = new Map<string, string>();
  const beyond: string[] = [];
  // 3.0.18 item 13 (QM-07, FI-F02): what the package delivers decides, never a fixed list of roles.
  const deliveredKeys = delivered ? new Set(delivered.objects.map((o) => `${o.name}.${o.type}`)) : null;
  const structure = design.nodeAppBlueprint.projectStructure.map((entry: unknown) => {
    const path = typeof entry === 'string' ? entry : isObj(entry) && typeof entry.path === 'string' ? entry.path : '';
    const purpose = isObj(entry) && typeof entry.purpose === 'string' ? entry.purpose : '';
    const m = /^(.*\/)?([A-Za-z0-9_/]+?)\.([a-z]{4})(?:\.[A-Za-z0-9.]+)?$/.exec(path.trim());
    const type = m ? m[3].toLowerCase() : '';
    // An object the package delivers under the model's own name stays, and is never "not generated".
    if (m && deliveredKeys?.has(`${m[2].toLowerCase()}.${type}`)) {
      taken.add(m[2].toLowerCase());
      return entry;
    }
    const mapped = m ? scaffoldNameFor(m[2], type, purpose, names, taken, delivered?.variant ?? null) : null;
    const target = mapped && (!deliveredKeys || deliveredKeys.has(`${mapped}.${type}`)) ? mapped : null;
    if (!m || !target) {
      if (path) beyond.push(path);
      return entry;
    }
    taken.add(target);
    const from = m[2].toLowerCase();
    if (from !== target) renames.set(from, target);
    const file = `${m[1] ?? 'src/'}${target}.${SCAFFOLD_FILE[type] ?? type}`;
    return typeof entry === 'string' ? file : { ...(entry as Record<string, unknown>), path: file };
  });
  const renamed = [...renames].map(([from, to]) => ({ from, to })).sort((a, b) => b.from.length - a.from.length);
  // An object the model named after the program itself ("zsd_return_credit_recon.srvd") is renamed in the
  // endpoint paths only: elsewhere the same word is the program ("retire report ZSD_RETURN_CREDIT_RECON").
  const own = (program ?? '').toLowerCase();
  const inText = renamed.filter((r) => r.from !== own);
  const { nodeAppBlueprint, ...rest } = design;
  const blueprint = renameIn(nodeAppBlueprint, inText) as Record<string, unknown>;
  const endpoints = Array.isArray(nodeAppBlueprint.apiEndpoints)
    ? nodeAppBlueprint.apiEndpoints.map((e: unknown) =>
        isObj(e) ? { ...(renameIn(e, inText) as Record<string, unknown>), path: renameIn(e.path, renamed) } : e,
      )
    : blueprint.apiEndpoints;
  const out = {
    ...(renameIn(rest, inText) as Record<string, unknown>),
    nodeAppBlueprint: { ...blueprint, projectStructure: structure, ...(endpoints !== undefined ? { apiEndpoints: endpoints } : {}) },
  };
  return { design: out as T, renamed, beyond };
}

/* ------------------------------------------------------------------ MVCC */

/** A sentence that rests a consistency or history promise on MVCC or a database snapshot. */
const MVCC_CLAIM =
  /\bMVCC\b|multi[- ]?version(?:ed)? concurrency|snapshot isolation|\b(?:HANA|database)\b[^.]{0,60}\bsnapshot\b[^.]{0,60}\b(?:consistent|guarantee[sd]?|historical|point[- ]in[- ]time)\b/i;

/** Said in place of a refused MVCC sentence. */
export const MVCC_REFUSAL =
  'A claim was removed: a consistent read through SAP HANA multi-version concurrency control (MVCC) is one moment of the database. '
  + 'It does not reconstruct what was effective at one cut-off and known at another, and it cannot hold a message that was never stored. '
  + 'Under READ COMMITTED several statements can even see different commit states.';

/** Said when the program reads at two cut-offs. */
export const CERTIFIED_SNAPSHOT_NOTE =
  'This program reads at two cut-offs (effective and known): the target needs a certified input snapshot — '
  + 'an event store that keeps both time axes, unique event and reference identities and a confirmed completeness — '
  + 'not a live read of the current tables.';

/**
 * A text with every sentence that rests consistency or history on MVCC (or a
 * database snapshot) taken out; the removed sentences are returned so that
 * the export can say what went.
 */
export function refuseMvccClaims(text: string): { text: string; refused: string[] } {
  if (!MVCC_CLAIM.test(text)) return { text, refused: [] };
  const parts = text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? [text];
  const kept: string[] = [];
  const refused: string[] = [];
  for (const p of parts) (MVCC_CLAIM.test(p) ? refused : kept).push(p.trim());
  return { text: kept.filter(Boolean).join(' '), refused };
}

/** Every string of the design with MVCC claims refused (the option comparison included). */
export function refuseMvccClaimsIn<T>(design: T): { design: T; refused: string[] } {
  const refused: string[] = [];
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const r = refuseMvccClaims(v);
      refused.push(...r.refused);
      return r.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return { design: walk(design) as T, refused };
}

/**
 * Does the program read at two cut-offs — one for what was effective, one for
 * what was known? Read from its selection parameters: one named for an
 * effective or valid date, another for a known, recorded or booked one
 * (`p_eff` and `p_known` in the SD example). A heuristic on names, said as one
 * where it is used; `false` when there is no source.
 */
export function readsAtTwoCutoffs(code: string | null | undefined): boolean {
  if (typeof code !== 'string' || !code) return false;
  // A chained declaration ("PARAMETERS: p_eff TYPE …, p_known TYPE ….") names one parameter per comma.
  const names = [...code.matchAll(/^[ \t]*(?:PARAMETERS?|SELECT-OPTIONS)\b\s*:?([^.]*)\./gim)].flatMap((m) =>
    m[1].split(',').map((part) => /^\s*([\w/]+)/.exec(part)?.[1]?.toLowerCase() ?? '').filter(Boolean),
  );
  const effective = names.some((n) => /eff|valid|keydate|key_date/.test(n));
  const known = names.some((n) => /known|knowledge|recorded|booked|asof|as_of/.test(n));
  return effective && known;
}

/* ------------------------------------------------------- SAP identifiers */

/** A mark kept in full: a wrong or unverified name, or one whose licence asks for its source where it stands. */
function keepsFullMark(c: SapIdCheck): boolean {
  return (c.status !== 'verified' && c.status !== 'catalog') || !!c.attribution || !!c.otherTitle;
}

/** The compact mark: the state word, and SAP's restriction when there is one. */
export function compactSapIdMark(c: SapIdCheck): string {
  if (keepsFullMark(c)) return sapIdMark(c);
  return `${sapIdStateWord(c)} — evidence in the identifier table${c.caveat ? `; SAP restriction: ${c.caveat}` : ''}`;
}

/**
 * `annotateSapReferences` with the short mark of a design (see the file
 * comment, 4) — the identifier table at the end carries what the mark leaves out.
 */
export function annotateSapReferencesCompact(text: unknown): string {
  if (typeof text !== 'string') return text == null ? '' : String(text);
  if (!text) return text;
  let out = '';
  let pos = 0;
  for (const c of occurrencesToMark(findSapIdentifiers(text))) {
    const end = c.index + c.length;
    out += text.slice(pos, end) + ` [${compactSapIdMark(c)}]`;
    pos = end;
  }
  return out + text.slice(pos);
}

/* ------------------------------------------------------------ all of it */

export interface DesignPostCheck<T> {
  design: T;
  route: DesignRoute;
  /** The program the scaffold names its objects after, or `null` when no source was at hand. */
  program: string | null;
  renamed: Array<{ from: string; to: string }>;
  beyond: string[];
  remnants: string[];
  mvccRefused: string[];
  twoCutoffs: boolean;
  /** What the package delivers (3.0.18 item 13), or null on the CAP route or without a source or package. */
  delivered: RapDelivered | null;
  /** Security rows proposing CDS access control for a custom entity, taken out of the design (3.0.18 item 13, QM-07). */
  dclRefused: string[];
}

/** The checks of this module on one parsed design, in the order they apply. */
export function postCheckDesign<T>(design: T, code?: string | null, packageFiles?: readonly string[] | null): DesignPostCheck<T> {
  const route = designRouteOf(design);
  const program = programOfSource(code);
  const twoCutoffs = readsAtTwoCutoffs(code);
  const mvcc = refuseMvccClaimsIn(design);
  if (route !== 'rap') {
    return { design: mvcc.design, route, program, renamed: [], beyond: [], remnants: [], mvccRefused: mvcc.refused, twoCutoffs, delivered: null, dclRefused: [] };
  }
  const remnants = rapTemplateRemnants(mvcc.design);
  // 3.0.18 item 13: the package's own file list when there is one, else what the scaffold writes for this source.
  const fromFiles = packageFiles && packageFiles.length ? rapDeliveredFromFiles(packageFiles) : null;
  const delivered = fromFiles && fromFiles.objects.length ? fromFiles : rapDeliveredFromSource(code);
  // Without a source the scaffold's names cannot be derived: the model's stay, and the export says so.
  const aligned = program ? alignRapDesignNames(mvcc.design, program, delivered) : { design: mvcc.design, renamed: [], beyond: [] };
  const refusal = delivered?.variant === 'custom-entity' ? refuseCustomEntityDcl(aligned.design) : { design: aligned.design, refused: [] };
  return { design: refusal.design, route, program, renamed: aligned.renamed, beyond: aligned.beyond, remnants, mvccRefused: mvcc.refused, twoCutoffs, delivered, dclRefused: refusal.refused };
}

/**
 * The security rows of a custom-entity design that propose CDS access control
 * (DCL, `pfcg_auth`, `define role`), taken out and returned: SAP protects a
 * custom entity in its query provider, not by an access control
 * (`CUSTOM_ENTITY_AUTH_NOTE`). Pure.
 */
export function refuseCustomEntityDcl<T>(design: T): { design: T; refused: string[] } {
  if (!isObj(design) || !Array.isArray(design.securityHardening)) return { design, refused: [] };
  const refused: string[] = [];
  const kept = design.securityHardening.filter((row: unknown) => {
    const text = strings(row).map((s) => s.text).join(' ');
    if (!DCL_CLAIM.test(text)) return true;
    refused.push(isObj(row) && typeof row.requirement === 'string' ? row.requirement : text);
    return false;
  });
  return { design: { ...design, securityHardening: kept } as T, refused };
}

/* ---------------------------------------------------------------- prompt */

/**
 * The prompt's rule for the RAP artifact list: the names the scaffold will
 * generate, so the design and the package agree (SD review CR-D7).
 */
export function rapObjectNamesPromptRule(program: string | null, variant: RapVariant | null = null): string {
  const n = rapDesignNames(program);
  // 3.0.18 item 13 (QM-07, FI-F02): the variant the package delivers — a custom entity has no table, no behavior
  // definition and no access control, and the design must not describe them.
  if (variant === 'custom-entity') {
    return (
      `The package for ${program ?? 'this program'} is a custom entity: the original writes no table. Use exactly these object names, which the engine's RAP scaffold generates — never invent others: `
      + `custom entity ${n.entity} with its query provider class ${n.query} (IF_RAP_QUERY_PROVIDER), logic class ${n.logic}, `
      + `service definition ${n.serviceDefinition}, service binding ${n.serviceBinding}. `
      + 'Do not describe a database table, a behavior definition, a behavior pool, a projection view or a CDS access control (DCL): the package delivers none of them. '
      + `${CUSTOM_ENTITY_AUTH_NOTE} Endpoint paths use the same service definition and binding names.`
    );
  }
  return (
    `Use exactly these object names, which the engine's RAP scaffold generates for ${program ?? 'this program'} — never invent others: `
    + `table ${n.table}, root view entity and behavior definition ${n.root}, projection view ${n.projection}, behavior pool ${n.behaviorPool}, `
    + `logic class ${n.logic}, service definition ${n.serviceDefinition}, service binding ${n.serviceBinding}. `
    + 'Endpoint paths use the same service definition and binding names.'
  );
}

/** The prompt's rule on consistency claims (SD review A03) — `refuseMvccClaims` refuses what it forbids. */
export const DESIGN_CONSISTENCY_PROMPT_RULE =
  'CONSISTENCY: never promise consistent or historical reads from SAP HANA MVCC, snapshot isolation or "the database" — '
  + 'a consistent snapshot is one moment; it does not reconstruct what was effective at one cut-off and known at another. '
  + 'When the program reads at two cut-offs (an effective and a known date or timestamp), say that the target needs a certified input snapshot '
  + '(an event store with both time axes, unique event and reference identities and confirmed completeness).';

/** The prompt's rule against the side-by-side template in a RAP design (SD review CR-D7, A04). */
export const RAP_TEMPLATE_PROMPT_RULE =
  'This is an in-app ABAP Cloud design: never write Node.js, npm, Express, Dockerfile or microservice wording into it, outside the option comparison.';
