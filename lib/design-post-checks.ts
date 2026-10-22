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

/**
 * A security row or a text that proposes CDS access control: DCL, `define role`, `pfcg_auth`, "CDS access control".
 * "Access control" alone is no such proposal — a query provider's AUTHORITY-CHECK is access control too, and is
 * exactly what a custom entity needs.
 */
const DCL_CLAIM = /\bDCL\b|\bpfcg_auth\b|\bdefine\s+role\b|\bCDS\s+access\s+controls?\b|\.dcls\b|\basdcls\b/i;

/** The words that name a CDS access control, as the negations below set them aside. */
const DCL_TERM = String.raw`(?:CDS\s+)?(?:DCL|access\s+controls?|pfcg_auth|define\s+role)(?:\s+(?:access\s+controls?|roles?|rules?|protection|objects?))?`;

/**
 * A mention of a CDS access control that says it is absent, not proposed: "custom entities lack DCL access
 * controls", "has no DCL", "without a DCL", "is not protected by a DCL", "instead of DCL", "DCL does not
 * apply", "DCL is not supported". Set aside before `DCL_CLAIM` is asked, so "Ensure the authorization check
 * runs in the query implementation as custom entities lack DCL access controls" proposes nothing, while
 * "Define a DCL for the custom entity" still does.
 */
const DCL_NEGATED = new RegExp(
  String.raw`\b(?:lacks?|lacking|has\s+no|have\s+no|with\s+no|without|no|not\s+(?:protected|covered|secured|restricted|guarded)\s+(?:by|through|via|with)|not\s+(?:via|through|by|with)|cannot\s+(?:use|have|rely\s+on|be\s+protected\s+by)|can't\s+(?:use|have|rely\s+on)|(?:does|do)\s+not\s+(?:support|have|use|rely\s+on)|(?:doesn't|don't)\s+(?:support|have|use|rely\s+on)|instead\s+of|rather\s+than|in\s+place\s+of)\s+(?:(?:an?|the|any)\s+)?`
    + DCL_TERM
    + String.raw`|\b` + DCL_TERM
    + String.raw`\s+(?:(?:is|are)\s+(?:not\s+(?:supported|available|applicable|possible|used)|unavailable|unsupported)|(?:does|do)\s+not\s+apply|(?:doesn't|don't)\s+apply|cannot\s+be\s+used)`,
  'gi',
);

/** Does this text propose a CDS access control — a mention of one that is not a negation of it? */
export function proposesDcl(text: string): boolean {
  return DCL_CLAIM.test(String(text ?? '').replace(DCL_NEGATED, ' '));
}

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
  const deliveredNames = delivered ? new Set(delivered.objects.map((o) => o.name)) : null;
  const structure = design.nodeAppBlueprint.projectStructure.map((entry: unknown) => {
    const path = typeof entry === 'string' ? entry : isObj(entry) && typeof entry.path === 'string' ? entry.path : '';
    const purpose = isObj(entry) && typeof entry.purpose === 'string' ? entry.purpose : '';
    // The type suffix in any case: "ZMM_X_CE.DDLS" names the same object as "zmm_x_ce.ddls".
    const m = /^(.*\/)?([A-Za-z0-9_/]+?)\.([A-Za-z]{4})(?:\.[A-Za-z0-9._]+)?$/.exec(path.trim());
    const type = m ? m[3].toLowerCase() : '';
    // An object the package delivers under the model's own name stays, and is never "not generated".
    if (m && deliveredKeys?.has(`${m[2].toLowerCase()}.${type}`)) {
      taken.add(m[2].toLowerCase());
      return entry;
    }
    // A bare object name without a type suffix ("zmm_x_ce", "src/zcl_mm_x_query") is the package's own
    // object when the package delivers an object of that name.
    const bare = m ? null : /^(?:.*\/)?([A-Za-z0-9_/]+)$/.exec(path.trim())?.[1]?.toLowerCase() ?? null;
    if (bare && deliveredNames?.has(bare)) {
      taken.add(bare);
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

/* ------------------------------------------------ the pre-posting check point */

/**
 * FI review of 18.10.2026, FI-F01 (roadmap 3.0.18 item 13): where the original posts an accounting document, the
 * design names one binding pre-posting check point as an architecture decision, with the channels that reach it —
 * the Fiori app, the API, the job, another caller. A check that sits in one channel (the UI's validation, the job's
 * selection) is skipped by the others; the check belongs where every channel passes, immediately before the posting
 * call. Read by the engine from the source: the posting calls, and whether the original checks the document before
 * it in the same routine. Deterministic; the decision text is the product's, not the model's.
 */
export const POSTING_FUNCTION = /^(?:BAPI_ACC_[A-Z0-9_]*_POST|POSTING_INTERFACE_(?:DOCUMENT|CLEARING)|AC_DOCUMENT_POST|BAPI_INCOMINGINVOICE_CREATE1?)$/;
/** The check a posting BAPI offers (BAPI_ACC_DOCUMENT_CHECK for BAPI_ACC_DOCUMENT_POST, …). */
export const POSTING_CHECK_FUNCTION = /^BAPI_ACC_[A-Z0-9_]*_CHECK$/;

export interface PostingCall {
  fm: string;
  line: number;
  /** The FORM or METHOD it is in, upper case; null at the event level. */
  routine: string | null;
  /** The original's check of the document before this call in the same routine, or null when there is none. */
  checkedBy: { fm: string; line: number } | null;
}

export interface PrePostingCheck {
  postings: PostingCall[];
  /** Check calls of the original outside the posting's routine: read, but not known to run on every path to it. */
  otherChecks: Array<{ fm: string; line: number }>;
  /** Where the check point is, in the target's own names. */
  checkPoint: string;
  channels: Array<{ channel: string; reaches: string }>;
}

/** The posting calls of a source and the original's own checks before them; null when it posts nothing. */
export function postingCallsOf(code: string | null | undefined): { postings: PostingCall[]; otherChecks: Array<{ fm: string; line: number }> } | null {
  if (typeof code !== 'string' || !code.trim()) return null;
  let statements;
  try {
    statements = readStatements(code.replace(/\r\n?/g, '\n'));
  } catch {
    return null;
  }
  const calls: Array<{ fm: string; line: number; routine: string | null }> = [];
  let routine: string | null = null;
  for (const s of statements) {
    const head = /^(FORM|METHOD)\s+([\w/~=>-]+)/i.exec(s.text);
    if (head) routine = head[2].toUpperCase();
    else if (/^END(?:FORM|METHOD)\b/i.test(s.text)) routine = null;
    const fm = /^CALL\s+FUNCTION\s+'([\w/]+)'/i.exec(s.text)?.[1]?.toUpperCase();
    if (fm && (POSTING_FUNCTION.test(fm) || POSTING_CHECK_FUNCTION.test(fm))) calls.push({ fm, line: s.lineStart, routine });
  }
  const posts = calls.filter((c) => POSTING_FUNCTION.test(c.fm));
  if (posts.length === 0) return null;
  const checks = calls.filter((c) => POSTING_CHECK_FUNCTION.test(c.fm));
  const postings = posts.map((p) => {
    const before = checks.filter((c) => c.routine === p.routine && c.line < p.line).at(-1);
    return { ...p, checkedBy: before ? { fm: before.fm, line: before.line } : null };
  });
  const used = new Set(postings.flatMap((p) => (p.checkedBy ? [p.checkedBy.line] : [])));
  return { postings, otherChecks: checks.filter((c) => !used.has(c.line)).map((c) => ({ fm: c.fm, line: c.line })) };
}

/**
 * The binding pre-posting check point of a design, with its channel matrix: the channels the target delivers
 * (read from the source the way the scaffold reads it), each reaching the posting only through the check point.
 * Null when the original posts no accounting document.
 */
export function prePostingCheckOf(code: string | null | undefined, route: DesignRoute): PrePostingCheck | null {
  const read = postingCallsOf(code);
  if (!read) return null;
  const text = (code ?? '').replace(/\r\n?/g, '\n');
  let job = false;
  let service = true;
  let logic = 'the logic class';
  let access = 'the access layer';
  try {
    const statements = readStatements(text);
    const graph = readCallGraphFrom(statements, readBlocks(statements));
    const delivery = abapDeliveryOf({ statements, graph, contract: readOriginalContract(text) });
    job = delivery.kind !== 'ui-service';
    service = delivery.kind !== 'application-job';
    const n = rapDesignNames(programNameOf(statements));
    logic = n.logic;
    access = n.accessInterface;
  } catch {
    /* the channels below stay the defaults */
  }
  const fms = [...new Set(read.postings.map((p) => p.fm))].join(', ');
  const checkPoint =
    route === 'rap'
      ? `${logic}, immediately before it calls ${access} to post (${fms}) — inside the logic every channel runs, never in one channel's UI or selection`
      : `the service's process logic, immediately before the call that posts (${fms}) — inside the logic every channel runs, never in one channel's UI or request handler`;
  const through = route === 'rap' ? `${logic}->run( )` : 'the process action';
  const channels = [
    ...(service ? [{ channel: route === 'rap' ? 'Fiori app and OData API (the service binding)' : 'Fiori app and OData API (the CAP service)', reaches: `${through}, then the check point` }] : []),
    ...(job ? [{ channel: route === 'rap' ? 'Application Job (unattended run)' : 'Scheduled job (unattended run)', reaches: `${through}, then the check point` }] : []),
    { channel: route === 'rap' ? 'Another ABAP caller of the logic' : 'Another service calling the action', reaches: `${through}, then the check point` },
  ];
  return { ...read, checkPoint, channels };
}

/** The architecture decision as the exports state it: one sentence, the original's own check named or missing. */
export function prePostingDecisionWords(p: PrePostingCheck): string[] {
  const posts = p.postings.map((x) =>
    `${x.fm} at L${x.line}${x.routine ? ` (${x.routine})` : ''}: ${x.checkedBy ? `the original checks the document first with ${x.checkedBy.fm} at L${x.checkedBy.line}` : 'the original posts without a check call before it in the same routine'}`,
  );
  return [
    `Architecture decision — a binding pre-posting check point: every posting runs the document check at ${p.checkPoint}. No channel posts past it, and a channel's own validation does not replace it.`,
    `Postings in the original: ${posts.join('; ')}.${p.otherChecks.length ? ` Checks elsewhere in the original (not known to run on every path to a posting): ${p.otherChecks.map((c) => `${c.fm} at L${c.line}`).join(', ')}.` : ''}`,
  ];
}

/** The prompt's rule (FI-F01): name the check point as an architecture decision; empty when the source posts nothing. */
export function prePostingPromptRule(code: string | null | undefined, route: DesignRoute): string {
  const p = prePostingCheckOf(code, route);
  if (!p) return '';
  return (
    `PRE-POSTING CHECK: the original posts an accounting document (${[...new Set(p.postings.map((x) => x.fm))].join(', ')}). Name one binding pre-posting check point as an architecture decision: the check runs at ${p.checkPoint}, and every channel `
    + `(${p.channels.map((c) => c.channel).join('; ')}) reaches the posting only through it. Never place the check in one channel only.`
  );
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
  /** The binding pre-posting check point and its channels (3.0.18 item 13, FI-F01), or null when the original posts nothing. */
  prePosting: PrePostingCheck | null;
}

/** The checks of this module on one parsed design, in the order they apply. */
export function postCheckDesign<T>(design: T, code?: string | null, packageFiles?: readonly string[] | null): DesignPostCheck<T> {
  const route = designRouteOf(design);
  const program = programOfSource(code);
  const twoCutoffs = readsAtTwoCutoffs(code);
  const mvcc = refuseMvccClaimsIn(design);
  if (route !== 'rap') {
    return { design: mvcc.design, route, program, renamed: [], beyond: [], remnants: [], mvccRefused: mvcc.refused, twoCutoffs, delivered: null, dclRefused: [], prePosting: prePostingCheckOf(code, route) };
  }
  const remnants = rapTemplateRemnants(mvcc.design);
  // 3.0.18 item 13: the package's own file list when there is one, else what the scaffold writes for this source.
  const fromFiles = packageFiles && packageFiles.length ? rapDeliveredFromFiles(packageFiles) : null;
  const delivered = fromFiles && fromFiles.objects.length ? fromFiles : rapDeliveredFromSource(code);
  // Without a source the scaffold's names cannot be derived: the model's stay, and the export says so.
  const aligned = program ? alignRapDesignNames(mvcc.design, program, delivered) : { design: mvcc.design, renamed: [], beyond: [] };
  const refusal = delivered?.variant === 'custom-entity' ? refuseCustomEntityDcl(aligned.design) : { design: aligned.design, refused: [] };
  return { design: refusal.design, route, program, renamed: aligned.renamed, beyond: aligned.beyond, remnants, mvccRefused: mvcc.refused, twoCutoffs, delivered, dclRefused: refusal.refused, prePosting: prePostingCheckOf(code, route) };
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
    if (!proposesDcl(text)) return true;
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
