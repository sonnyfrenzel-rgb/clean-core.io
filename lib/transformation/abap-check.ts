/**
 * The activation check of a generated ABAP package (roadmap 3.0.13, item 1:
 * "honest status first").
 *
 * One check, run exactly as the package is delivered: the same
 * `abaplint.json` object (`ABAPLINT_CONFIG`, which the Delivery tool writes
 * out), the same `@abaplint/core` the server loads, over the package's own
 * objects under `src/`, with the SAP classes the package inherits from read
 * as dependencies (`abap-sap-stubs.ts`, delivered as `checks/sap-stubs/`).
 *
 * Why it exists. The SD example's delivered package said "abaplint: 13
 * reported, 1 failed" and "complete", and abaplint with the package's own
 * `abaplint.json` reports 107 parser errors in it. The record before this one
 * counted *files* (13 read, 1 with an issue — the logic class, with all 107),
 * the words read that as an old "reported" count, the semantic check did not
 * run at all, and nothing tied the generation's status to any of it.
 *
 * Every finding is one of four kinds:
 *
 *   - `parser`   — the statement does not parse under ABAP Cloud (`WRITE`,
 *                  `MESSAGE`, `ULINE` …): the object cannot be activated;
 *   - `syntax`   — `check_syntax` / `unknown_types` in the package's own
 *                  objects: a parameter that does not exist, a variable never
 *                  declared, a type that is not there;
 *   - `unresolved` — a reference to an SAP object the check cannot see (SAP's
 *                  released objects are not available here), and what follows
 *                  from it: the implementation of a method of an SAP interface
 *                  whose signature the check does not know. Counted and said,
 *                  never counted as an error of the package;
 *   - `lint`     — every other rule of the shipped configuration (Clean ABAP,
 *                  ABAP Doc, metadata): findings, not activation errors.
 *
 * "Activatable" means 0 parser and 0 syntax errors in the package's own
 * objects — a statement about what abaplint can see, not an activation in an
 * SAP system.
 *
 * Server-only: `@abaplint/core` is large and registers its statement handlers
 * on load (`next.config.mjs` keeps it external). The browser gets the result
 * from `/api/run-tests` (verify mode) and the store route.
 */

import * as abaplint from '@abaplint/core';
import { ABAPLINT_CONFIG } from './abaplint-config';
import { SAP_STUB_FILES } from './abap-sap-stubs';
import type { AbapActivation, AbapFinding, AbapFindingKind } from './check-words';

export type { AbapActivation, AbapFinding, AbapFindingKind } from './check-words';
export { isAbapPackage } from './check-words';

/** At most this many findings are kept on a record; the counts are complete. */
export const MAX_ABAP_FINDINGS = 200;

const PARSER_RULES = new Set(['parser_error', 'cds_parser_error']);
const SYNTAX_RULES = new Set(['check_syntax', 'unknown_types']);

/** The names the package's own objects may carry (the shipped `errorNamespace`, plus the local prefixes). */
const OWN_NAMESPACE = new RegExp(ABAPLINT_CONFIG.syntax.errorNamespace, 'i');

const normPath = (p: string) => p.replace(/\\/g, '/').replace(/^\.?\//, '');

export function abaplintVersion(): string | null {
  try {
    const v = (abaplint.Registry as unknown as { abaplintVersion?: () => string }).abaplintVersion?.();
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

/** The object name of a file under `src/` (`src/zcl_x.clas.locals_imp.abap` → `zcl_x`). */
const objectOf = (path: string) => (path.split('/').pop() ?? '').split('.')[0].toLowerCase();

/** The name before `~` or `=>`, lower case. */
const headOf = (name: string) => name.split(/~|=>|->/)[0].replace(/^\\/, '').toLowerCase();

/**
 * The SAP-side name a finding complains about, when it is one: a superclass,
 * a class, interface or type the check could not find, or an interface whose
 * method is implemented.
 */
function externalNameOf(message: string, own: ReadonlySet<string>): string | null {
  const patterns = [
    /^Super class "([^"]+)" not found/i,
    /^Method definition "([^"~]+)~[^"]*" not found/i,
    /^(?:Class|Interface|Class or type|Type|Class or interface)\s+"([^"]+)"\s+not found/i,
    /^"([^"]+)" not found, (?:findTop|Target)/i,
    /^Implementing interface "([^"]+)"/i,
    /^Interface "([^"]+)"/i,
    /^([A-Z0-9_/]+) unknown$/i,
  ];
  for (const re of patterns) {
    const m = message.match(re);
    if (!m) continue;
    const head = headOf(m[1]);
    // A local variable (`"out" not found`) is not an object name; only names that look global count here.
    if (re.source.startsWith('^"(') && !/^(?:c[lx]_|if_|i_|\/)/i.test(head)) return null;
    if (own.has(head) || OWN_NAMESPACE.test(head)) return null;
    return head;
  }
  return null;
}

/**
 * The implicit parameters of a RAP handler method (`reported`, `failed`,
 * `mapped`, `result`) and their components are typed from the behavior
 * definition, which abaplint reads only by its entity names: in a behavior
 * pool's local classes a finding about them is the check not seeing the
 * behavior definition, not an error of the package.
 */
const RAP_DERIVED = /^"(?:reported|failed|mapped|result)(?:-[\w%]+)*" not found/i;
const RAP_DERIVED_NAME = 'behavior definition (derived types)';

/** The METHOD … ENDMETHOD spans of a source that implement a method of an interface the check could not see. */
function blindMethodSpans(content: string, external: ReadonlySet<string>): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  const lines = content.split('\n');
  let open: number | null = null;
  lines.forEach((line, i) => {
    const m = line.match(/^\s*METHOD\s+([\w/]+)~[\w/]+\s*\./i);
    if (m && external.has(m[1].toLowerCase())) open = i + 1;
    else if (open !== null && /^\s*ENDMETHOD\s*\./i.test(line)) {
      out.push({ start: open, end: i + 1 });
      open = null;
    }
  });
  return out;
}

export interface AbapCheckResult {
  ran: true;
  activation: AbapActivation;
  /** Every finding, in path and line order (the record keeps the first `MAX_ABAP_FINDINGS`). */
  findings: AbapFinding[];
}

export type AbapCheckOutcome = AbapCheckResult | { ran: false; reason: string };


/**
 * abaplint over the package's objects under `src/`, with the shipped
 * configuration and the SAP stubs as dependencies. Never throws: abaplint
 * stopping is `{ ran: false, reason }` — never a pass.
 */
export function abapCheck(files: ReadonlyArray<{ path: string; content: string }>): AbapCheckOutcome {
  const src = files.map((f) => ({ path: normPath(f.path), content: f.content })).filter((f) => f.path.startsWith('src/'));
  if (!src.some((f) => /\.(?:abap|asddls)$/i.test(f.path) || /\.tabl\.xml$/i.test(f.path))) {
    return { ran: false, reason: 'The package has no ABAP source under src/: there was nothing to check.' };
  }
  const version = abaplintVersion();
  let raw: Array<{ path: string; line: number; rule: string; message: string }>;
  try {
    const registry = new abaplint.Registry(new abaplint.Config(JSON.stringify(ABAPLINT_CONFIG)));
    for (const f of src) registry.addFile(new abaplint.MemoryFile(f.path.slice('src/'.length), f.content));
    registry.addDependencies(SAP_STUB_FILES.map((s) => new abaplint.MemoryFile(s.name, s.content)));
    registry.parse();
    raw = registry
      .findIssues()
      .map((i) => ({ path: `src/${i.getFilename()}`, line: i.getStart().getRow(), rule: i.getKey(), message: i.getMessage() }))
      .filter((i) => src.some((f) => f.path === i.path));
  } catch (err) {
    return { ran: false, reason: `abaplint stopped: ${err instanceof Error ? err.message.slice(0, 300) : 'unknown error'}` };
  }

  const own = new Set(src.map((f) => objectOf(f.path)));
  // Pass 1: the SAP names the findings point at.
  const external = new Set<string>();
  for (const i of raw) {
    if (!SYNTAX_RULES.has(i.rule)) continue;
    const name = externalNameOf(i.message, own);
    if (name) external.add(name);
  }
  // Pass 2: the methods of SAP interfaces the check could not see — their parameters are unknown to it too.
  const blind = new Map<string, Array<{ start: number; end: number }>>();
  for (const f of src) if (/\.abap$/i.test(f.path)) blind.set(f.path, blindMethodSpans(f.content, external));
  const kindOf = (i: (typeof raw)[number]): AbapFindingKind => {
    if (PARSER_RULES.has(i.rule)) return 'parser';
    if (!SYNTAX_RULES.has(i.rule)) return 'lint';
    if (externalNameOf(i.message, own)) return 'unresolved';
    if ((blind.get(i.path) ?? []).some((s) => i.line >= s.start && i.line <= s.end)) return 'unresolved';
    if (/\.clas\.locals_imp\.abap$/i.test(i.path) && RAP_DERIVED.test(i.message)) {
      external.add(RAP_DERIVED_NAME);
      return 'unresolved';
    }
    return 'syntax';
  };
  const findings: AbapFinding[] = raw
    .map((i) => ({ path: i.path, line: i.line, rule: i.rule, kind: kindOf(i), message: i.message.slice(0, 300) }))
    .sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.rule.localeCompare(b.rule));
  const count = (k: AbapFindingKind) => findings.filter((f) => f.kind === k).length;
  const parserErrors = count('parser');
  const syntaxErrors = count('syntax');
  const checked = src.filter((f) => /\.(?:abap|asddls)$/i.test(f.path) || /\.tabl\.xml$/i.test(f.path)).map((f) => f.path);
  const failing = new Set(findings.filter((f) => f.kind === 'parser' || f.kind === 'syntax').map((f) => f.path));
  return {
    ran: true,
    findings,
    activation: {
      v: 1,
      abaplint: version ?? 'unknown',
      config: 'shipped',
      files: checked.length,
      paths: checked.slice(0, 100),
      failedFiles: failing.size,
      parserErrors,
      syntaxErrors,
      unresolved: count('unresolved'),
      unresolvedNames: [...external].sort().slice(0, 20),
      lint: count('lint'),
      activatable: parserErrors === 0 && syntaxErrors === 0,
      stubs: SAP_STUB_FILES.map((s) => s.object),
      // The errors first, then what could not be resolved, then the other rules' findings.
      findings: (['parser', 'syntax', 'unresolved', 'lint'] as const).flatMap((k) => findings.filter((f) => f.kind === k)).slice(0, MAX_ABAP_FINDINGS),
    },
  };
}
