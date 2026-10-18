/**
 * Key-user candidates — the parts of a program SAP's key-user tools could
 * cover, read from the code (roadmap 3.0.19, owner decisions 14.10.2026 and
 * 18.10.2026; engine gate `KEY_USER_FROM`, `key-user-gate.ts`).
 *
 * Before 3.0.19 the router's key-user checkpoint was neutral in every case and
 * every route ended in code — RAP on the stack or CAP beside it — so a small
 * change the key-user tools cover was sent through a developer build it does
 * not need. This module reads, deterministically and without a model, which
 * parts of a program are such a change:
 *
 *   | Tool (`KeyUserTool`)              | What in the code makes a part a candidate                                   |
 *   |-----------------------------------|-----------------------------------------------------------------------------|
 *   | `custom-field`                    | a `ZZ`/`YY` component of an SAP table (an append or customer include)        |
 *   | `custom-logic`                    | an exit or BAdI implementation that only checks or derives values           |
 *   | `custom-cds-view`                 | the program's reading list over tables with a released CDS view             |
 *   | `custom-analytical-query`         | the same list, when it aggregates (`COLLECT`, `SUM(`, `GROUP BY` …)         |
 *   | `adapt-ui`                        | an exit that only hides, locks or requires screen fields                    |
 *   | `custom-business-configuration`   | an own table the program only reads, by key (settings)                      |
 *   | `custom-business-object`          | an own table the program only reads as a list (master data)                 |
 *
 * **Each candidate is said with its limit, never as a promise** (`limits`):
 * whether the key-user BAdI or the view is released for key-user use in the
 * target edition and release is answered from SAP's synced catalog only where
 * it says so — the repository holds SAP's list of objects released for ABAP
 * Cloud, not the key-user scope — and is otherwise *not determined*, with the
 * check to make. No BAdI, business context or cube view is named that the
 * source and the synced catalog do not name.
 *
 * **The moment a part needs a write, an external call or more logic than the
 * tool allows, it is no candidate** (`rejected`, with each blocker and its
 * line). Where the code does not show enough to decide — logic in a class the
 * source does not contain, a VOFM routine — the part is *not determined*,
 * never a candidate. A program may split: some parts key user, some code
 * (`scope: 'partial'`). Where every part is a candidate and the whole program
 * was read, the program is key user as a whole (`scope: 'whole-program'`), and
 * a key-user extension is clean core level A by construction
 * (`levelByConstruction`): it uses released extension points only.
 *
 * The limits on statements per part (`KEY_USER_LOGIC_MAX_STATEMENTS`,
 * `KEY_USER_LIST_MAX_STATEMENTS`) are Clean-Core.io's rule for "more logic
 * than the tool allows", not SAP's: they are stated as such wherever they
 * reject a part.
 *
 * Not a finding and not part of what a run signs as findings: like
 * `statedRequirements` it sits beside the findings and is recomputed from the
 * stored source (`AbapEvidenceReport.keyUser`). The step list a key user
 * follows is built from it in `lib/key-user-steps.ts`.
 *
 * Server-side: it reads the synced catalog through `catalog-service.ts`.
 */

import { readStatements, maskLiterals, type AbapStatement } from './statement-reader';
import { readHookImplementations, type HookImplementation } from './engine-rules';
import { readTableDependencies } from './table-dependencies';
import { getSapObjectStates, isSapDatabaseTable, resolveApi } from './catalog-service';
import { isCustomerObject } from './abcd-classification';
import releasedInterfaceList from './generated/released-interfaces.latest.json';
import releasedClassList from './generated/released-classes.latest.json';

/* ------------------------------------------------------------------ types */

/** The key-user tool a candidate names. The app a key user opens is `KEY_USER_APPS`. */
export type KeyUserTool =
  | 'custom-field'
  | 'custom-logic'
  | 'custom-cds-view'
  | 'custom-analytical-query'
  | 'adapt-ui'
  | 'custom-business-configuration'
  | 'custom-business-object';

/** In the order a key user builds them: the fields and objects first, then what uses them. */
export const KEY_USER_TOOLS: readonly KeyUserTool[] = Object.freeze([
  'custom-field',
  'custom-business-configuration',
  'custom-business-object',
  'custom-logic',
  'custom-cds-view',
  'custom-analytical-query',
  'adapt-ui',
]);

/** The app of each tool, in the words of the roadmap row 3.0.19. */
export const KEY_USER_APPS: Readonly<Record<KeyUserTool, string>> = Object.freeze({
  'custom-field': 'Custom Fields',
  'custom-logic': 'Custom Logic',
  'custom-cds-view': 'Custom CDS Views',
  'custom-analytical-query': 'Custom Analytical Queries',
  'adapt-ui': 'Adapt UI',
  'custom-business-configuration': 'Custom Business Objects (configuration)',
  'custom-business-object': 'Custom Business Objects',
});

/** What part of the program a candidate or a rejection is about. */
export type KeyUserPartKind = 'field' | 'hook' | 'list' | 'table';

export interface KeyUserPart {
  kind: KeyUserPartKind;
  /** The table, the hook (`IF_X~METHOD`, `USEREXIT_…`), or the program name. */
  name: string;
}

/** Lines of the source, 1-based. `replaced`: the lines the tool takes over; `uses`: lines that rely on it. */
export interface KeyUserAnchor {
  lineStart: number;
  lineEnd: number;
  role: 'replaced' | 'uses';
  /** What stands there, in a few words. */
  what: string;
}

/** One thing the key user enters: a field, a rule, a list field, a filter, a screen change. */
export interface KeyUserItem {
  kind: 'field' | 'derivation' | 'check' | 'condition' | 'list-field' | 'filter' | 'aggregation' | 'ui-change' | 'data-source';
  /** Upper-cased where it is an ABAP name. */
  name: string;
  /** One sentence, ready to show. */
  detail: string;
  lines: number[];
  /**
   * For a derivation or a check: the branch conditions it stands under, outermost
   * first, as written (`ELSE` spelled out as "none of …"); absent at the top level.
   */
  condition?: string;
}

export type KeyUserLimitKind =
  | 'release-not-determined'
  | 'context-not-determined'
  | 'definition-not-in-source'
  | 'data-source'
  | 'authorization'
  | 'value-written-by-code'
  | 'own-rule';

/** What the candidate depends on that the code cannot settle — with the check that settles it. */
export interface KeyUserLimit {
  kind: KeyUserLimitKind;
  text: string;
  /** The check to make, in the system or in the definition; null where the text is the whole answer. */
  check: string | null;
}

/**
 * What SAP's synced catalog says about the SAP object the tool builds on.
 * `released-abap-cloud`: listed as released for ABAP Cloud — which is not the
 * key-user scope, so the key-user release stays a limit. `not-listed`: the
 * object is not in the list. `not-determined`: the code names no SAP object
 * to look up. `own-object`: the tool builds a new object of the customer's.
 */
export interface KeyUserRelease {
  state: 'released-abap-cloud' | 'not-listed' | 'not-determined' | 'own-object';
  /** The SAP objects looked up, upper-cased. */
  objects: string[];
  text: string;
}

export interface KeyUserCandidate {
  /** `KU-1`, `KU-2` … in source order. */
  id: string;
  tool: KeyUserTool;
  app: string;
  part: KeyUserPart;
  /**
   * The object the tool works on: the SAP table and its released view for a
   * field, a list or custom logic; the own table for a business object or
   * configuration. `null` where the code does not name it.
   */
  object: { name: string; standardTable: string | null; releasedViews: string[] };
  items: KeyUserItem[];
  anchors: KeyUserAnchor[];
  limits: KeyUserLimit[];
  release: KeyUserRelease;
}

export type KeyUserBlockerCode =
  | 'database-write'
  | 'external-call'
  | 'commit'
  | 'function-call'
  | 'program-call'
  | 'subroutine'
  | 'file'
  | 'native-sql'
  | 'own-dialog'
  | 'unreleased-api'
  | 'modification'
  | 'too-much-logic'
  | 'logic-not-in-source'
  | 'no-released-view'
  | 'own-table-written'
  | 'no-list-output'
  | 'vofm-routine';

/** Why one part leaves the key-user route, at its line. */
export interface KeyUserBlocker {
  code: KeyUserBlockerCode;
  line: number;
  text: string;
}

export interface KeyUserRejection {
  /** `KU-R1`, `KU-R2` … in source order. */
  id: string;
  /** The tool the part would have been, had nothing blocked it. */
  wouldBe: KeyUserTool;
  part: KeyUserPart;
  /** `code`: it stays developer work; `not-determined`: the source does not show enough to decide. */
  verdict: 'code' | 'not-determined';
  /** One sentence: what blocks it and what it stays. */
  reason: string;
  blockers: KeyUserBlocker[];
  anchors: KeyUserAnchor[];
}

export type KeyUserScope = 'whole-program' | 'partial' | 'none';

export interface KeyUserReading {
  candidates: KeyUserCandidate[];
  rejected: KeyUserRejection[];
  /**
   * `whole-program`: every part is a candidate and the whole source was read;
   * `partial`: some parts are candidates, some stay code or are not determined;
   * `none`: no part is a candidate.
   */
  scope: KeyUserScope;
  parts: { total: number; keyUser: number; code: number; notDetermined: number };
  /** `A` only for `whole-program`: a key-user extension uses released extension points only. */
  levelByConstruction: 'A' | null;
  /** One sentence for the route report, naming the counts and the scope. */
  sentence: string;
}

/* ------------------------------------------------------------------ rules */

/** Clean-Core.io's rule, not SAP's: an exit or BAdI with more executable statements than this is more logic than custom logic holds. */
export const KEY_USER_LOGIC_MAX_STATEMENTS = 40;
/** Clean-Core.io's rule, not SAP's: a list with more executable statements than this is more logic than a query expresses. */
export const KEY_USER_LIST_MAX_STATEMENTS = 80;

const RELEASED_INTERFACES: ReadonlySet<string> = new Set(
  (releasedInterfaceList as { interfaces: string[] }).interfaces.map((n) => n.toUpperCase()),
);
const RELEASED_CLASSES: ReadonlySet<string> = new Set(
  (releasedClassList as { classes: string[] }).classes.map((n) => n.toUpperCase()),
);

const DECLARATIONS = new Set([
  'DATA', 'TYPES', 'CONSTANTS', 'FIELD-SYMBOLS', 'STATICS', 'TABLES', 'RANGES', 'CLASS-DATA', 'PARAMETERS', 'PARAMETER',
  'SELECT-OPTIONS', 'SELECTION-SCREEN', 'INCLUDE', 'TYPE-POOLS', 'REPORT', 'PROGRAM', 'INTERFACES', 'METHODS', 'CLASS-METHODS',
  'ALIASES', 'EVENTS', 'PUBLIC', 'PROTECTED', 'PRIVATE', 'DEFINE', 'END-OF-DEFINITION',
]);
/** Event blocks and routine frames: structure, not logic. */
const FRAMES = new Set([
  'START-OF-SELECTION', 'END-OF-SELECTION', 'INITIALIZATION', 'AT', 'TOP-OF-PAGE', 'END-OF-PAGE', 'LOAD-OF-PROGRAM',
  'FORM', 'ENDFORM', 'METHOD', 'ENDMETHOD', 'FUNCTION', 'ENDFUNCTION', 'MODULE', 'ENDMODULE', 'CLASS', 'ENDCLASS',
  'INTERFACE', 'ENDINTERFACE', 'GET', 'FUNCTION-POOL',
]);

/** Finding kinds that take a part off the key-user route, and what they mean there. */
const BLOCKING_KINDS: Readonly<Record<string, { code: KeyUserBlockerCode; text: string }>> = Object.freeze({
  'standard-table-write': { code: 'database-write', text: 'writes an SAP table' },
  'custom-table-write': { code: 'database-write', text: 'writes an own table' },
  'update-task': { code: 'database-write', text: 'writes in an update task' },
  'rfc-call': { code: 'external-call', text: 'calls a function module by RFC' },
  'parallel-processing': { code: 'external-call', text: 'starts parallel tasks by RFC' },
  'abap-proxy': { code: 'external-call', text: 'calls another system through an ABAP proxy' },
  'legacy-mail': { code: 'external-call', text: 'sends mail' },
  'commit-work': { code: 'commit', text: 'commits the transaction' },
  bdc: { code: 'program-call', text: 'drives a transaction by batch input' },
  'batch-input': { code: 'program-call', text: 'writes through batch input' },
  submit: { code: 'program-call', text: 'starts another program' },
  'native-sql': { code: 'native-sql', text: 'runs native SQL' },
  'gui-download': { code: 'file', text: 'transfers a file to or from the PC' },
  'dataset-io': { code: 'file', text: 'reads or writes a file on the application server' },
  dynpro: { code: 'own-dialog', text: 'has screens of its own' },
  modification: { code: 'modification', text: 'modifies SAP code' },
  'unreleased-api': { code: 'unreleased-api', text: 'uses an API SAP does not release' },
  'classic-api': { code: 'unreleased-api', text: 'uses a classic API SAP does not release for ABAP Cloud' },
});

/** Output a list hands to the reader: replaced by the query's own list, never a blocker of the list. */
const OUTPUT_CALL = /\b(?:REUSE_ALV_\w+|CL_SALV_\w+|CL_GUI_ALV_GRID|CL_SALV_TABLE)\b/i;
const AGGREGATION = /^(?:COLLECT\b|SUM\b|AT\s+END\s+OF\b)|\b(?:SUM|COUNT|AVG|MIN|MAX)\s*\(|\bGROUP\s+BY\b/i;
const CONFIG_NAME = /(?:CFG|CONF|CUST|PARAM|SETT?|RULE|CTRL|TOL|LIMIT|THRESH)/i;

/* ------------------------------------------------------------------ input */

export interface KeyUserInput {
  code: string;
  fileName: string;
  /** The run's findings — what blocks a part is read from them, not detected a second time. */
  findings: ReadonlyArray<{ id: string; kind: string; lineStart: number; lineEnd?: number; objectName?: string }>;
  /**
   * The kinds of construct the engine did not assess (`coverage.gaps`). Any of
   * them — an include not uploaded, a dynamic call — keeps the reading from
   * `whole-program`, except classic list output where the list itself is a
   * candidate: the query replaces exactly that output.
   */
  coverageGaps: readonly string[];
}

interface Range { lineStart: number; lineEnd: number }

const within = (line: number, r: Range) => line >= r.lineStart && line <= r.lineEnd;
const upper = (s: string) => s.toUpperCase();
const unique = <T,>(xs: Iterable<T>): T[] => [...new Set(xs)];
const listWords = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The released CDS views SAP's catalog names for an SAP table, and whether each is listed as released. */
function releasedViewsOf(table: string): { views: string[]; released: boolean } {
  const entry = resolveApi(table);
  const ddls = (entry?.successors ?? []).filter((s) => s.tadir === 'DDLS').map((s) => upper(s.name));
  const curated = entry && entry.type === 'CDS View' && entry.view ? [upper(entry.view)] : [];
  const views = unique([...ddls, ...curated]);
  // An SAP CDS view read directly is its own released view.
  if (!views.length && getSapObjectStates(table).releaseState === 'released') return { views: [upper(table)], released: true };
  const released = views.some((v) => getSapObjectStates(v).releaseState === 'released');
  return { views, released };
}

/** Which variables hold rows of which SAP table: `TYPE vbak`, `TABLE OF vbap`, `TABLES vbak`, `INTO @DATA(x)` from one table. */
function typedRows(statements: readonly AbapStatement[], isStandard: (t: string) => boolean): Map<string, string> {
  const map = new Map<string, string>();
  const typeRe = /([\w<>~/-]+)\s+(?:TYPE|LIKE)\s+(?:(?:STANDARD|SORTED|HASHED)\s+TABLE\s+OF\s+|TABLE\s+OF\s+|LINE\s+OF\s+|RANGE\s+OF\s+|REF\s+TO\s+)?([\w/]+)/gi;
  for (const s of statements) {
    const code = maskLiterals(s.text);
    if (s.keyword === 'TABLES') {
      for (const name of code.replace(/^TABLES\s*:?/i, '').split(/[,.\s]+/).filter(Boolean)) {
        if (isStandard(upper(name))) map.set(upper(name), upper(name));
      }
      continue;
    }
    for (const m of code.matchAll(typeRe)) {
      const table = upper(m[2]);
      const name = upper(m[1]).replace(/^(?:DATA|FIELD-SYMBOLS|IMPORTING|EXPORTING|CHANGING|RETURNING|VALUE\()\s*/i, '');
      if (isStandard(table)) map.set(name.replace(/\)$/, ''), table);
    }
  }
  // Rows that come from a typed table or from a select of one SAP table.
  for (let pass = 0; pass < 2; pass++) {
    for (const s of statements) {
      const code = maskLiterals(s.text);
      const loop = /^LOOP\s+AT\s+([\w<>~/-]+)\s+(?:INTO\s+(?:DATA\()?([\w<>~/-]+)\)?|ASSIGNING\s+(?:FIELD-SYMBOL\()?(<[\w-]+>)\)?)/i.exec(code);
      if (loop && map.has(upper(loop[1]))) map.set(upper(loop[2] ?? loop[3]), map.get(upper(loop[1]))!);
      if (s.keyword === 'SELECT') {
        const from = /\bFROM\s+([\w/]+)(?:\s+AS\s+\w+)?(?!\s*(?:INNER|LEFT|RIGHT|CROSS|JOIN))/i.exec(code);
        const into = /\bINTO\s+(?:CORRESPONDING\s+FIELDS\s+OF\s+)?(?:TABLE\s+)?@?(?:DATA\()?([\w<>~/-]+)\)?/i.exec(code);
        if (from && into && isStandard(upper(from[1])) && !/\bJOIN\b/i.test(code)) map.set(upper(into[1]), upper(from[1]));
      }
    }
  }
  return map;
}

/* --------------------------------------------------------------- reading */

/** The key-user reading of one program — see the file comment. Deterministic; no model, no network. */
export function readKeyUserCandidates(input: KeyUserInput): KeyUserReading {
  const statements = readStatements(input.code);
  const hooks = readHookImplementations(statements, input.fileName, { engineReads: true });
  const deps = readTableDependencies(input.code).dependencies.filter((d) => d.access !== 'reference' && !d.possibleTargetOf && /^[\w/]+$/.test(d.table));
  const isStandard = (t: string) => !isCustomerObject(t) && isSapDatabaseTable(t);
  const rows = typedRows(statements, isStandard);

  const candidates: Omit<KeyUserCandidate, 'id'>[] = [];
  const rejected: Omit<KeyUserRejection, 'id'>[] = [];

  /* ---------- the parts: exits and BAdIs, grouped by implementation; the rest is the list ---------- */
  const hookGroups = groupHooks(hooks);
  const hookRanges: Range[] = hooks.map((h) => ({ lineStart: h.lineStart, lineEnd: h.lineEnd }));
  const inHook = (line: number) => hookRanges.some((r) => within(line, r));
  const definitionRanges = blockRanges(statements);
  const inDefinition = (line: number) => definitionRanges.some((r) => within(line, r));
  const findingsAt = (range: (line: number) => boolean) => input.findings.filter((f) => range(f.lineStart));

  /* ---------- custom fields: ZZ/YY components of SAP tables ---------- */
  const fieldUses = new Map<string, Map<string, number[]>>();
  const addField = (table: string, field: string, line: number) => {
    const byField = fieldUses.get(table) ?? new Map<string, number[]>();
    byField.set(field, unique([...(byField.get(field) ?? []), line]));
    fieldUses.set(table, byField);
  };
  for (const s of statements) {
    const code = maskLiterals(s.text);
    for (const m of code.matchAll(/([\w<>/]+)-((?:ZZ|YY)\w*)\b/gi)) {
      const base = upper(m[1]);
      const table = rows.get(base) ?? (isStandard(base) ? base : null);
      if (table) addField(table, upper(m[2]), s.lineStart);
    }
    for (const m of code.matchAll(/\b([\w/]+)~((?:ZZ|YY)\w*)\b/gi)) {
      if (isStandard(upper(m[1]))) addField(upper(m[1]), upper(m[2]), s.lineStart);
    }
    // `UPDATE vbak SET zz_x = …`: the field is written straight into the SAP table.
    if (s.keyword === 'UPDATE' || s.keyword === 'MODIFY') {
      const target = /^(?:UPDATE|MODIFY)\s+([\w/]+)\s+SET\b(.*)$/i.exec(code);
      if (target && isStandard(upper(target[1]))) {
        for (const m of target[2].matchAll(/(?<![\w~-])((?:ZZ|YY)\w*)\s*=/gi)) addField(upper(target[1]), upper(m[1]), s.lineStart);
      }
    }
    if (s.keyword === 'SELECT' && !/\bJOIN\b/i.test(code)) {
      const from = /\bFROM\s+([\w/]+)/i.exec(code);
      const fieldList = code.split(/\bINTO\b/i)[0];
      if (from && isStandard(upper(from[1]))) {
        for (const m of fieldList.matchAll(/(?<![\w~-])((?:ZZ|YY)\w*)\b/gi)) addField(upper(from[1]), upper(m[1]), s.lineStart);
      }
    }
  }
  const writesOfTable = (table: string) => input.findings.filter((f) => f.kind === 'standard-table-write' && upper(f.objectName ?? '') === table);
  for (const [table, byField] of fieldUses) {
    const fields = [...byField.keys()].sort();
    const lines = unique([...byField.values()].flat()).sort((a, b) => a - b);
    const { views } = releasedViewsOf(table);
    const object = views.length ? `${table} (released view ${views[0]})` : table;
    const limits: KeyUserLimit[] = [
      {
        kind: 'context-not-determined',
        text: `Which business context of the Custom Fields app covers ${object} is not determined from the code.`,
        check: `In Custom Fields, look up the business context for ${object} in the target release and confirm it offers the usages the program needs (the UI, the CDS views and reports, custom logic).`,
      },
      {
        kind: 'definition-not-in-source',
        text: `Type and length of ${listWords(fields)} stand in the append or customer include of ${table}, which this source does not contain.`,
        check: `Take them from the definition of ${table} in the source system (its append structure) before the field is created.`,
      },
    ];
    const writes = writesOfTable(table);
    if (writes.length) {
      limits.push({
        kind: 'value-written-by-code',
        text: `The program writes ${table} itself (line ${writes.map((w) => w.lineStart).join(', ')}): the field is a key-user candidate, the write is not.`,
        check: null,
      });
    }
    candidates.push({
      tool: 'custom-field',
      app: KEY_USER_APPS['custom-field'],
      part: { kind: 'field', name: table },
      object: { name: table, standardTable: table, releasedViews: views },
      items: fields.map((field) => ({
        kind: 'field',
        name: field,
        detail: `${field} on ${table}, used at line ${byField.get(field)!.join(', ')}.`,
        lines: byField.get(field)!,
      })),
      anchors: lines.map((line) => ({ lineStart: line, lineEnd: line, role: 'uses' as const, what: `uses ${listWords(fields.filter((f) => byField.get(f)!.includes(line)))}` })),
      limits,
      release: {
        state: 'not-determined',
        objects: [table],
        text: `A custom field is a new field of the customer's on ${table}; whether a business context offers it is checked in the app, not in SAP's catalog.`,
      },
    });
  }

  /* ---------- own tables: configuration and business objects ---------- */
  const ownTables = unique(deps.filter((d) => isCustomerObject(d.table)).map((d) => d.table));
  const ownTableTool = new Map<string, KeyUserTool>();
  for (const table of ownTables) {
    const accesses = deps.filter((d) => d.table === table);
    const writes = accesses.filter((d) => d.access === 'write');
    const reads = accesses.filter((d) => d.access === 'read');
    const bySingle = reads.length > 0 && reads.every((d) => /^SELECT\s+SINGLE\b/i.test(d.snippet.trim()));
    const tool: KeyUserTool = bySingle || CONFIG_NAME.test(table) ? 'custom-business-configuration' : 'custom-business-object';
    const anchors = accesses.map((d) => ({ lineStart: d.line, lineEnd: d.line, role: (d.access === 'write' ? 'replaced' : 'uses') as KeyUserAnchor['role'], what: `${d.access === 'write' ? 'writes' : 'reads'} ${table}` }));
    if (writes.length) {
      rejected.push({
        wouldBe: tool,
        part: { kind: 'table', name: table },
        verdict: 'code',
        reason: `${table} is written by the program (line ${writes.map((w) => w.line).join(', ')}): a key-user object can hold the data, but maintaining it from program logic is a write, which stays developer work.`,
        blockers: writes.map((w) => ({ code: 'own-table-written' as const, line: w.line, text: `writes ${table}` })),
        anchors,
      });
      continue;
    }
    ownTableTool.set(table, tool);
    const fields = unique(reads.flatMap((d) => fieldsOfSelect(d.snippet, table))).sort();
    candidates.push({
      tool,
      app: KEY_USER_APPS[tool],
      part: { kind: 'table', name: table },
      object: { name: table, standardTable: null, releasedViews: [] },
      items: [
        ...fields.map((field) => ({ kind: 'field' as const, name: field, detail: `${field}, read at line ${reads.filter((d) => fieldsOfSelect(d.snippet, table).includes(field)).map((d) => d.line).join(', ')}.`, lines: reads.filter((d) => fieldsOfSelect(d.snippet, table).includes(field)).map((d) => d.line) })),
      ],
      anchors,
      limits: [
        {
          kind: 'definition-not-in-source',
          text: `The fields, keys and size of ${table} are in its definition, which this source does not contain${fields.length ? `; the program reads ${listWords(fields)}` : ''}.`,
          check: `Take the fields and their types from the definition of ${table}; a ${tool === 'custom-business-configuration' ? 'configuration' : 'custom business object'} suits a small table with simple fields — confirm that ${table} is one.`,
        },
        {
          kind: 'own-rule',
          text: tool === 'custom-business-configuration'
            ? `Read as settings: ${bySingle ? 'every read is a single row by key' : `the name ${table} reads as settings`}. Who maintains the values after the move is to be decided.`
            : `Read as a list of records (master data): the program reads several rows at line ${reads.map((d) => d.line).join(', ')}.`,
          check: null,
        },
      ],
      release: { state: 'own-object', objects: [], text: `${table} becomes an object of the customer's; no SAP release applies.` },
    });
  }

  /* ---------- exits and BAdIs: custom logic or Adapt UI ---------- */
  for (const group of hookGroups) {
    const range: Range = { lineStart: group[0].lineStart, lineEnd: group[group.length - 1].lineEnd };
    const members = group;
    const first = members[0];
    const partName = first.kind === 'badi' ? `${first.name.split('~')[0]}${first.owner ? ` (${first.owner})` : ''}` : first.name;
    const part: KeyUserPart = { kind: 'hook', name: partName };
    const body = statements.filter((s) => members.some((m) => s.lineStart > m.lineStart && s.lineEnd < m.lineEnd));
    const executable = body.filter((s) => !DECLARATIONS.has(s.keyword) && !FRAMES.has(s.keyword));
    const anchors: KeyUserAnchor[] = members.map((m) => ({ lineStart: m.lineStart, lineEnd: m.lineEnd, role: 'replaced', what: `${m.kind === 'badi' ? 'BAdI method' : m.kind === 'vofm' ? 'VOFM routine' : 'exit'} ${m.name}` }));
    const uiOnly = executable.length > 0 && executable.every(isScreenStatement) && executable.some((s) => /^SCREEN-\w+\s*=/i.test(s.text.trim()));
    const wouldBe: KeyUserTool = uiOnly ? 'adapt-ui' : 'custom-logic';
    if (first.kind === 'vofm') {
      rejected.push({
        wouldBe, part, verdict: 'not-determined',
        reason: `${first.name} is a VOFM routine (a pricing, copy or requirement routine): whether a key-user BAdI is called at the same point is not determined from the code, so it is no candidate.`,
        blockers: [{ code: 'vofm-routine', line: first.lineStart, text: `VOFM routine ${first.name}` }],
        anchors,
      });
      continue;
    }
    const blockers = [
      ...blockersFromFindings(findingsAt((line) => members.some((m) => within(line, m)))),
      ...statementBlockers(executable, 'hook', definedClasses(statements)),
    ];
    const delegated = members.filter((m) => m.delegatedTo);
    for (const m of delegated.filter((d) => !blockers.some((b) => b.code === 'logic-not-in-source' && within(b.line, d)))) blockers.push({ code: 'logic-not-in-source', line: m.lineStart, text: `hands its work to ${m.delegatedTo}, whose logic this source does not contain` });
    if (executable.length > KEY_USER_LOGIC_MAX_STATEMENTS) {
      blockers.push({ code: 'too-much-logic', line: range.lineStart, text: `${executable.length} executable statements, more than the ${KEY_USER_LOGIC_MAX_STATEMENTS} Clean-Core.io takes custom logic to hold (our rule, not SAP's)` });
    }
    const reads = deps.filter((d) => d.access === 'read' && within(d.line, range));
    const limits: KeyUserLimit[] = [];
    for (const d of reads) {
      if (isCustomerObject(d.table)) {
        limits.push({ kind: 'data-source', text: `Reads ${d.table} (line ${d.line}), which becomes ${ownTableTool.has(d.table) ? `the ${KEY_USER_APPS[ownTableTool.get(d.table)!]} object of the same name` : 'an object of its own'}.`, check: `Confirm in Custom Logic that the BAdI may read that object for the target release.` });
      } else if (isStandard(d.table)) {
        const v = releasedViewsOf(d.table);
        if (!v.released) blockers.push({ code: 'no-released-view', line: d.line, text: `reads ${d.table}, for which SAP's synced catalog names no released CDS view` });
        else limits.push({ kind: 'data-source', text: `Reads ${d.table} (line ${d.line}); the released view SAP's catalog names is ${v.views[0]}.`, check: `Confirm in Custom Logic that ${v.views[0]} may be read there for the target release.` });
      }
    }
    if (blockers.length) {
      const notDetermined = blockers.every((b) => b.code === 'logic-not-in-source');
      rejected.push({
        wouldBe, part, verdict: notDetermined ? 'not-determined' : 'code',
        reason: notDetermined
          ? `${partName}: the logic stands in a class this source does not contain, so whether custom logic covers it is not determined.`
          : `${partName} ${listWords(unique(dedupe(blockers).map((b) => b.text)))} — more than custom logic allows, so it stays developer work.`,
        blockers: dedupe(blockers),
        anchors,
      });
      continue;
    }
    const contextTables = unique(body.flatMap((s) => [...maskLiterals(s.text).matchAll(/([\w<>/]+)-\w+/g)].map((m) => rows.get(upper(m[1])) ?? (isStandard(upper(m[1])) ? upper(m[1]) : undefined)).filter((t): t is string => Boolean(t))));
    const declaredTypes = unique(statements.filter((s) => /^(?:METHODS|CLASS-METHODS)\b/i.test(s.keyword)).flatMap((s) => [...maskLiterals(s.text).matchAll(/\bTYPE\s+([\w/]+)/gi)].map((m) => upper(m[1])).filter(isStandard)));
    const standardTable = contextTables[0] ?? declaredTypes[0] ?? null;
    const views = standardTable ? releasedViewsOf(standardTable).views : [];
    const release = hookRelease(first, standardTable);
    candidates.push({
      tool: wouldBe,
      app: KEY_USER_APPS[wouldBe],
      part,
      object: { name: standardTable ?? partName, standardTable, releasedViews: views },
      items: uiOnly ? screenItems(executable) : logicItems(executable),
      anchors,
      limits: [
        {
          kind: 'release-not-determined',
          text: release.text,
          check: wouldBe === 'adapt-ui'
            ? `Open the SAP Fiori app that replaces the screen in the target release and confirm in Adapt UI that the fields can be hidden, made read-only or mandatory there.`
            : `In Custom Logic, find the BAdI of the business context${standardTable ? ` for ${standardTable}${views.length ? ` (${views[0]})` : ''}` : ''} that is called at the same point (${hookPoint(first)}) in the target release; if there is none, this part stays developer extensibility.`,
        },
        ...limits,
      ],
      release,
    });
  }

  /* ---------- the list: the program's own reading and output ---------- */
  const listStatements = statements.filter((s) => !inHook(s.lineStart) && !inDefinition(s.lineStart));
  const listExecutable = listStatements.filter((s) => !DECLARATIONS.has(s.keyword) && !FRAMES.has(s.keyword));
  const listReads = deps.filter((d) => d.access === 'read' && !inHook(d.line));
  const output = listExecutable.filter((s) => /^(?:WRITE|ULINE|SKIP|NEW-LINE|FORMAT)\b/i.test(s.text) || OUTPUT_CALL.test(maskLiterals(s.text)));
  const programName = /^(?:REPORT|PROGRAM)\s+([\w/]+)/i.exec(statements.find((s) => s.keyword === 'REPORT' || s.keyword === 'PROGRAM')?.text ?? '')?.[1];
  if (listExecutable.length > 0) {
    const part: KeyUserPart = { kind: 'list', name: upper(programName ?? input.fileName.replace(/\.[^.]*$/, '')) };
    const aggregates = listExecutable.filter((s) => AGGREGATION.test(maskLiterals(s.text).trim()));
    const wouldBe: KeyUserTool = aggregates.length ? 'custom-analytical-query' : 'custom-cds-view';
    const listFindings = findingsAt((line) => !inHook(line) && !inDefinition(line))
      .filter((f) => !((f.kind === 'unreleased-api' || f.kind === 'classic-api') && OUTPUT_CALL.test(f.objectName ?? '')));
    const blockers: KeyUserBlocker[] = [
      ...blockersFromFindings(listFindings),
      ...statementBlockers(listExecutable, 'list', definedClasses(statements)),
    ];
    const counted = listExecutable.filter((s) => !output.includes(s));
    if (counted.length > KEY_USER_LIST_MAX_STATEMENTS) {
      blockers.push({ code: 'too-much-logic', line: counted[0].lineStart, text: `${counted.length} executable statements, more than the ${KEY_USER_LIST_MAX_STATEMENTS} Clean-Core.io takes a query to express (our rule, not SAP's)` });
    }
    if (listReads.length === 0 || output.length === 0) {
      blockers.push({
        code: 'no-list-output',
        line: (listExecutable[0] ?? statements[0]).lineStart,
        text: listReads.length === 0 ? 'reads no table, so it is no list a query replaces' : 'shows no list (no WRITE or ALV output), so it is no list a query replaces',
      });
    }
    const views: string[] = [];
    const sourceItems: KeyUserItem[] = [];
    const limits: KeyUserLimit[] = [];
    for (const table of unique(listReads.map((d) => d.table))) {
      const lines = listReads.filter((d) => d.table === table).map((d) => d.line);
      if (isCustomerObject(table)) {
        if (ownTableTool.has(table)) {
          sourceItems.push({ kind: 'data-source', name: table, detail: `${table}, as the ${KEY_USER_APPS[ownTableTool.get(table)!]} object of the same name.`, lines });
          limits.push({ kind: 'data-source', text: `Reads ${table}, which becomes a key-user object of its own.`, check: `Confirm that ${wouldBe === 'custom-analytical-query' ? 'Custom Analytical Queries' : 'Custom CDS Views'} can use that object as a data source for the target release.` });
        } else {
          blockers.push({ code: 'own-table-written', line: lines[0], text: `reads ${table}, which stays developer work` });
        }
        continue;
      }
      const v = releasedViewsOf(table);
      if (!v.released) {
        blockers.push({ code: 'no-released-view', line: lines[0], text: `reads ${table}, for which SAP's synced catalog names no released CDS view` });
        continue;
      }
      const view = v.views.find((x) => getSapObjectStates(x).releaseState === 'released') ?? v.views[0];
      views.push(view);
      sourceItems.push({ kind: 'data-source', name: view, detail: `${view} for ${table} (released per SAP's synced catalog).`, lines });
    }
    const usedFields = [...fieldUses.entries()].flatMap(([table, byField]) => [...byField.entries()].filter(([, lines]) => lines.some((l) => !inHook(l))).map(([f]) => `${table}-${f}`));
    if (usedFields.length) {
      limits.push({ kind: 'data-source', text: `Shows the custom field${usedFields.length > 1 ? 's' : ''} ${listWords(usedFields)}.`, check: `In Custom Fields, enable the field for the CDS views and reports of its business context, so the ${wouldBe === 'custom-analytical-query' ? 'query' : 'view'} can read it.` });
    }
    const authority = input.findings.filter((f) => f.kind === 'authority-check' && !inHook(f.lineStart));
    if (authority.length) {
      limits.push({ kind: 'authorization', text: `The program checks authorizations itself (line ${authority.map((a) => a.lineStart).join(', ')}).`, check: `Confirm that the access control of the released view${views.length > 1 ? 's' : ''} grants what these checks grant, or restrict the query's business role accordingly.` });
    }
    if (blockers.length) {
      const verdict = blockers.every((b) => b.code === 'logic-not-in-source') ? 'not-determined' : 'code';
      rejected.push({
        wouldBe, part, verdict,
        reason: `The program's own logic ${listWords(unique(dedupe(blockers).map((b) => b.text)))} — so it is no reading list a ${wouldBe === 'custom-analytical-query' ? 'custom analytical query' : 'custom CDS view'} replaces, and it stays developer work.`,
        blockers: dedupe(blockers),
        anchors: dedupe(blockers).map((b) => ({ lineStart: b.line, lineEnd: b.line, role: 'replaced' as const, what: b.text })),
      });
    } else {
      const selects = listStatements.filter((s) => s.keyword === 'SELECT');
      const filters = listStatements.filter((s) => s.keyword === 'PARAMETERS' || s.keyword === 'PARAMETER' || s.keyword === 'SELECT-OPTIONS');
      limits.unshift({
        kind: 'release-not-determined',
        text: `${listWords(unique(views))} ${unique(views).length === 1 ? 'is' : 'are'} released for ABAP Cloud per SAP's synced catalog; whether the app offers ${unique(views).length === 1 ? 'it' : 'them'} as a data source in the target edition and release is not determined.`,
        check: wouldBe === 'custom-analytical-query'
          ? `In Custom Analytical Queries, find the released analytical (cube) view over ${listWords(unique(views))} for the target release; which one is not determined from the code.`
          : `In Custom CDS Views, confirm that ${listWords(unique(views))} ${unique(views).length === 1 ? 'is' : 'are'} offered as a data source for the target release.`,
      });
      candidates.push({
        tool: wouldBe,
        app: KEY_USER_APPS[wouldBe],
        part,
        object: { name: part.name, standardTable: listReads.find((d) => !isCustomerObject(d.table))?.table ?? null, releasedViews: unique(views) },
        items: [
          ...sourceItems,
          ...selects.flatMap((s) => listFields(s).map((f) => ({ kind: 'list-field' as const, name: f, detail: `${f}, selected at line ${s.lineStart}.`, lines: [s.lineStart] }))),
          ...filters.map((s) => ({ kind: 'filter' as const, name: upper(/^(?:PARAMETERS?|SELECT-OPTIONS)\s*:?\s*([\w/]+)/i.exec(s.text)?.[1] ?? ''), detail: `Selection ${s.text.replace(/\.$/, '')}.`, lines: [s.lineStart] })),
          ...aggregates.map((s) => ({ kind: 'aggregation' as const, name: s.keyword, detail: `Aggregates at line ${s.lineStart}: ${s.text.replace(/\.$/, '')}.`, lines: [s.lineStart] })),
        ],
        anchors: [
          ...selects.map((s) => ({ lineStart: s.lineStart, lineEnd: s.lineEnd, role: 'replaced' as const, what: 'selection' })),
          ...aggregates.map((s) => ({ lineStart: s.lineStart, lineEnd: s.lineEnd, role: 'replaced' as const, what: 'aggregation' })),
          ...output.map((s) => ({ lineStart: s.lineStart, lineEnd: s.lineEnd, role: 'replaced' as const, what: 'list output' })),
        ]
          .filter((a, i, all) => all.findIndex((b) => b.lineStart === a.lineStart && b.lineEnd === a.lineEnd && b.what === a.what) === i)
          .sort((a, b) => a.lineStart - b.lineStart),
        limits,
        release: {
          state: 'released-abap-cloud',
          objects: unique(views),
          text: `Released for ABAP Cloud per SAP's synced catalog: ${listWords(unique(views))}. The key-user scope is not part of that list.`,
        },
      });
    }
  }

  /* ---------- the reading ---------- */
  const firstLine = (x: { anchors: KeyUserAnchor[] }) => Math.min(...x.anchors.map((a) => a.lineStart), Number.MAX_SAFE_INTEGER);
  const sortedCandidates = candidates.sort((a, b) => firstLine(a) - firstLine(b)).map((c, i) => ({ id: `KU-${i + 1}`, ...c }));
  const sortedRejected = rejected.sort((a, b) => firstLine(a) - firstLine(b)).map((r, i) => ({ id: `KU-R${i + 1}`, ...r }));
  const code = sortedRejected.filter((r) => r.verdict === 'code').length;
  const notDetermined = sortedRejected.length - code;
  const listIsCandidate = sortedCandidates.some((c) => c.part.kind === 'list');
  const complete = input.coverageGaps.every((g) => g === 'classic-list-output' && listIsCandidate);
  const scope: KeyUserScope = sortedCandidates.length === 0
    ? 'none'
    : sortedRejected.length === 0 && complete ? 'whole-program' : 'partial';
  const parts = { total: sortedCandidates.length + sortedRejected.length, keyUser: sortedCandidates.length, code, notDetermined };
  return {
    candidates: sortedCandidates,
    rejected: sortedRejected,
    scope,
    parts,
    levelByConstruction: scope === 'whole-program' ? 'A' : null,
    sentence: readingSentence(scope, parts, sortedCandidates, complete),
  };
}

/* --------------------------------------------------------------- helpers */

function readingSentence(scope: KeyUserScope, parts: KeyUserReading['parts'], candidates: readonly KeyUserCandidate[], complete: boolean): string {
  const tools = unique(candidates.map((c) => c.app));
  const rest = [parts.code ? `${parts.code} stay${parts.code === 1 ? 's' : ''} code` : '', parts.notDetermined ? `${parts.notDetermined} ${parts.notDetermined === 1 ? 'is' : 'are'} not determined` : ''].filter(Boolean).join(', ');
  if (scope === 'none') {
    return parts.total === 0
      ? 'No part of the program is a key-user candidate: the code shows no customer field on an SAP table, no exit or BAdI, no reading list and no own table.'
      : `No part of the program is a key-user candidate: of ${parts.total} part(s), ${rest}.`;
  }
  if (scope === 'whole-program') {
    return `Every part of the program is a key-user candidate (${parts.keyUser}: ${listWords(tools)}), each with its limit: built with key-user tools, the extension is clean core level A by construction, because key-user extensions use released extension points only.`;
  }
  if (!rest) {
    return `${parts.keyUser} of ${parts.total} part(s) are key-user candidates (${listWords(tools)}), each with its limit; part of the program was not assessed by the engine, so the program is not called key user as a whole.`;
  }
  return `${parts.keyUser} of ${parts.total} part(s) are key-user candidates (${listWords(tools)}), each with its limit; ${rest}${complete ? '' : ', and part of the program was not assessed by the engine'}. The program splits: only the code part is built.`;
}

/** Hooks grouped into one implementation each: the methods of one BAdI class, or one exit. */
function groupHooks(hooks: readonly HookImplementation[]): HookImplementation[][] {
  const groups = new Map<string, HookImplementation[]>();
  for (const h of hooks) {
    const key = h.kind === 'badi' ? `badi:${h.name.split('~')[0]}:${h.ownerBlock ?? 0}` : `${h.kind}:${h.name}`;
    groups.set(key, [...(groups.get(key) ?? []), h]);
  }
  return [...groups.values()].map((g) => g.sort((a, b) => a.lineStart - b.lineStart)).sort((a, b) => a[0].lineStart - b[0].lineStart);
}

/** `CLASS … DEFINITION … ENDCLASS` and `INTERFACE … ENDINTERFACE`: declarations, no logic. */
function blockRanges(statements: readonly AbapStatement[]): Range[] {
  const out: Range[] = [];
  let open: number | null = null;
  for (const s of statements) {
    if (open === null && ((/^CLASS\s+[\w/]+\s+DEFINITION\b/i.test(s.text) && !/\b(?:DEFERRED|LOAD)\b/i.test(s.text)) || /^INTERFACE\s+[\w/]+(?:\s+PUBLIC)?\s*\.?$/i.test(s.text.trim()))) open = s.lineStart;
    else if (open !== null && (s.keyword === 'ENDCLASS' || s.keyword === 'ENDINTERFACE')) {
      out.push({ lineStart: open, lineEnd: s.lineEnd });
      open = null;
    }
  }
  return out;
}

/** Local and global classes the source defines: a call of one is logic in this source. */
function definedClasses(statements: readonly AbapStatement[]): ReadonlySet<string> {
  return new Set(statements.map((s) => /^CLASS\s+([\w/]+)\s+(?:DEFINITION|IMPLEMENTATION)\b/i.exec(s.text)?.[1]).filter((n): n is string => Boolean(n)).map(upper));
}

function blockersFromFindings(findings: ReadonlyArray<{ kind: string; lineStart: number; objectName?: string }>): KeyUserBlocker[] {
  return findings.flatMap((f) => {
    const b = BLOCKING_KINDS[f.kind];
    return b ? [{ code: b.code, line: f.lineStart, text: `${b.text}${f.objectName ? ` (${upper(f.objectName)})` : ''} at line ${f.lineStart}` }] : [];
  });
}

/** What a statement does that key-user tools do not, beyond what the findings already say. */
function statementBlockers(executable: readonly AbapStatement[], where: 'hook' | 'list', ownClasses: ReadonlySet<string>): KeyUserBlocker[] {
  const out: KeyUserBlocker[] = [];
  for (const s of executable) {
    const code = maskLiterals(s.text).trim();
    const raw = s.text;
    const at = s.lineStart;
    if (/^CALL\s+FUNCTION\b/i.test(code)) {
      const name = /CALL\s+FUNCTION\s+'([\w/]+)'/i.exec(raw)?.[1]?.toUpperCase() ?? 'a computed name';
      if (where === 'list' && OUTPUT_CALL.test(name)) continue;
      out.push(/\bDESTINATION\b|\bSTARTING\s+NEW\s+TASK\b|\bIN\s+BACKGROUND\s+TASK\b/i.test(code)
        ? { code: 'external-call', line: at, text: `calls ${name} in another session or system at line ${at}` }
        : { code: 'function-call', line: at, text: `calls the function module ${name} at line ${at}` });
    } else if (/^(?:SUBMIT|CALL\s+TRANSACTION|LEAVE\s+TO\s+TRANSACTION)\b/i.test(code)) {
      out.push({ code: 'program-call', line: at, text: `starts another program or transaction at line ${at}` });
    } else if (/^(?:COMMIT|ROLLBACK)\s+WORK\b/i.test(code)) {
      out.push({ code: 'commit', line: at, text: `ends the transaction at line ${at}` });
    } else if (/^(?:OPEN|CLOSE|READ|DELETE)\s+DATASET\b|^TRANSFER\b/i.test(code)) {
      out.push({ code: 'file', line: at, text: `handles a file on the application server at line ${at}` });
    } else if (/^EXEC\s+SQL\b/i.test(code)) {
      out.push({ code: 'native-sql', line: at, text: `runs native SQL at line ${at}` });
    } else if (/^CALL\s+SCREEN\b/i.test(code)) {
      out.push({ code: 'own-dialog', line: at, text: `opens a screen of its own at line ${at}` });
    } else if (/^PERFORM\b/i.test(code)) {
      if (where === 'hook') out.push({ code: 'subroutine', line: at, text: `calls a subroutine at line ${at}, which custom logic has no place for` });
      else if (/\bIN\s+PROGRAM\b|\(\s*[\w/]+\s*\)/i.test(code)) out.push({ code: 'program-call', line: at, text: `calls a subroutine of another program at line ${at}` });
    }
    if (/\b(?:CL_HTTP_CLIENT|CL_WEB_HTTP_CLIENT_MANAGER|IF_HTTP_CLIENT|CL_HTTP_DESTINATION_PROVIDER)\b/i.test(code)) {
      out.push({ code: 'external-call', line: at, text: `calls another system over HTTP at line ${at}` });
    }
    if (where === 'hook') {
      for (const m of code.matchAll(/\b([\w/]+)\s*=>\s*\w+|\bNEW\s+([\w/]+)\s*\(|\bCALL\s+METHOD\s+([\w/]+)\s*=>/gi)) {
        const cls = upper(m[1] ?? m[2] ?? m[3]);
        if (ownClasses.has(cls) || /^(?:IF_|CX_)/.test(cls) || RELEASED_CLASSES.has(cls) || RELEASED_INTERFACES.has(cls)) continue;
        if (isCustomerObject(cls) || /^LCL_/.test(cls)) out.push({ code: 'logic-not-in-source', line: at, text: `calls ${cls}, whose logic this source does not contain` });
        else out.push({ code: 'unreleased-api', line: at, text: `calls ${cls}, which SAP's synced list does not release for ABAP Cloud` });
      }
    }
  }
  return out;
}

/** One blocker per line: the finding's reading first, a statement's own only where no finding stands there. */
function dedupe(blockers: readonly KeyUserBlocker[]): KeyUserBlocker[] {
  const seen = new Set<string>();
  return blockers.filter((b) => {
    const key = String(b.line);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.line - b.line);
}

/** What SAP's synced list says about the BAdI interface an implementation names; an exit names none. */
function hookRelease(hook: HookImplementation, standardTable: string | null): KeyUserRelease {
  if (hook.kind === 'badi') {
    const intf = hook.name.split('~')[0];
    if (RELEASED_INTERFACES.has(intf)) {
      return { state: 'released-abap-cloud', objects: [intf], text: `${intf} is in SAP's synced list of interfaces released for ABAP Cloud — released for developer extensibility; whether it is a key-user BAdI the Custom Logic app offers is not determined.` };
    }
    if (isCustomerObject(intf) || /^LIF_/.test(intf)) {
      return { state: 'not-determined', objects: [intf], text: `${intf} is the customer's own BAdI interface: the Custom Logic app offers SAP's key-user BAdIs only, and which of them is called at the same point${standardTable ? ` for ${standardTable}` : ''} is not determined from the code.` };
    }
    return { state: 'not-listed', objects: [intf], text: `${intf} is not in SAP's synced list of interfaces released for ABAP Cloud: the classic BAdI does not carry over, and which key-user BAdI is called at the same point is not determined from the code.` };
  }
  const what = hook.kind === 'user-exit' ? 'user exit' : 'customer exit';
  return { state: 'not-determined', objects: [hook.name], text: `${hook.name} is a ${what}, which no key-user tool implements: which key-user BAdI is called at the same point${standardTable ? ` for ${standardTable}` : ''} is not determined from the code.` };
}

/** Where the hook is called, as far as its name says. */
function hookPoint(hook: HookImplementation): string {
  const name = hook.name.toUpperCase();
  if (/SAVE|POST|BEFORE_UPDATE|PREPARE/.test(name)) return 'before the document is saved';
  if (/CHECK|VALIDAT/.test(name)) return 'when the document is checked';
  if (/FIELD_MODIFICATION|SCREEN|PBO/.test(name)) return 'when the screen is built';
  if (/MOVE_FIELD|DERIV|FILL|DEFAULT/.test(name)) return 'when the fields are filled';
  return 'the point the exit is called at';
}

/** A statement of a screen-only exit: `LOOP AT SCREEN`, a branch on `screen-name`, an assignment to `screen-…`, `MODIFY SCREEN`. */
function isScreenStatement(s: AbapStatement): boolean {
  const t = maskLiterals(s.text).trim().replace(/\.$/, '');
  return /^LOOP\s+AT\s+SCREEN\b/i.test(t)
    || /^(?:ENDLOOP|ELSE|ENDIF|ENDCASE|CONTINUE)$/i.test(t)
    || /^MODIFY\s+SCREEN\b/i.test(t)
    || /^(?:IF|ELSEIF)\b.*\bSCREEN-(?:NAME|GROUP[1-4])\b/i.test(t)
    || /^CASE\s+SCREEN-(?:NAME|GROUP[1-4])$/i.test(t)
    || /^WHEN\b/i.test(t)
    || /^SCREEN-\w+\s*=\s*'?\d'?$/i.test(t);
}

/** The screen changes an Adapt UI step makes: per field (or group), hide, read-only, mandatory. */
function screenItems(executable: readonly AbapStatement[]): KeyUserItem[] {
  const items = new Map<string, KeyUserItem>();
  let fields: string[] = [];
  for (const s of executable) {
    const t = s.text.trim().replace(/\.$/, '');
    const cond = /^(?:IF|ELSEIF|WHEN)\b/i.test(t) ? [...t.matchAll(/'([^']+)'/g)].map((m) => m[1].toUpperCase()) : null;
    if (cond) fields = cond;
    const set = /^SCREEN-(\w+)\s*=\s*'?(\d)'?$/i.exec(t);
    if (!set) continue;
    const [attr, value] = [set[1].toUpperCase(), set[2]];
    const action = (attr === 'ACTIVE' && value === '0') || (attr === 'INVISIBLE' && value === '1') ? 'hide'
      : attr === 'INPUT' && value === '0' ? 'make read-only'
      : attr === 'REQUIRED' && value !== '0' ? 'make mandatory'
      : null;
    if (!action) continue;
    for (const field of fields.length ? fields : ['(all fields of the screen)']) {
      const key = `${field}:${action}`;
      const prior = items.get(key);
      items.set(key, { kind: 'ui-change', name: field, detail: `${action[0].toUpperCase()}${action.slice(1)} ${field}.`, lines: unique([...(prior?.lines ?? []), s.lineStart]) });
    }
  }
  return [...items.values()];
}

/** The rules a custom logic step carries: the values it derives, the checks it makes, the conditions they stand under. */
function logicItems(executable: readonly AbapStatement[]): KeyUserItem[] {
  const out: KeyUserItem[] = [];
  // The open branches: per IF or CASE, the conditions of the arms before and the arm that is open now.
  const open: Array<{ before: string[]; now: string; caseOf?: string }> = [];
  const under = () => (open.length ? open.map((b) => b.now).join(' AND ') : undefined);
  const withCondition = (item: KeyUserItem): KeyUserItem => {
    const condition = under();
    return condition ? { ...item, condition } : item;
  };
  for (const s of executable) {
    const t = s.text.trim().replace(/\.$/, '');
    const code = maskLiterals(t);
    const head = /^(IF|ELSEIF|CASE|WHEN|ELSE|ENDIF|ENDCASE|CHECK)\b\s*(.*)$/i.exec(t);
    const word = head ? head[1].toUpperCase() : '';
    if (word === 'IF') {
      open.push({ before: [], now: head![2] });
      out.push({ kind: 'condition', name: word, detail: t, lines: [s.lineStart] });
    } else if (word === 'ELSEIF' && open.length) {
      const b = open[open.length - 1];
      b.before.push(b.now);
      b.now = head![2];
      out.push({ kind: 'condition', name: word, detail: t, lines: [s.lineStart] });
    } else if (word === 'CASE') {
      open.push({ before: [], now: '', caseOf: head![2] });
    } else if (word === 'WHEN' && open.length) {
      const b = open[open.length - 1];
      if (b.now) b.before.push(b.now);
      b.now = /^OTHERS$/i.test(head![2].trim()) ? `${b.caseOf} is none of the values above` : `${b.caseOf} = ${head![2]}`;
      out.push({ kind: 'condition', name: word, detail: t, lines: [s.lineStart] });
    } else if (word === 'ELSE' && open.length) {
      const b = open[open.length - 1];
      b.before.push(b.now);
      b.now = `none of: ${b.before.join('; ')}`;
    } else if ((word === 'ENDIF' || word === 'ENDCASE') && open.length) {
      open.pop();
    } else if (word === 'CHECK') {
      out.push({ kind: 'condition', name: word, detail: t, lines: [s.lineStart] });
    } else if (/^(?:MESSAGE|RAISE)\b/i.test(code) || /\b(?:APPEND|INSERT)\b.*\bMESSAGES?\b/i.test(code)) {
      out.push(withCondition({ kind: 'check', name: s.keyword, detail: t, lines: [s.lineStart] }));
    } else {
      const assign = /^([\w<>/]+(?:-[\w]+)+)\s*=(?!=)/.exec(code);
      if (assign) out.push(withCondition({ kind: 'derivation', name: upper(assign[1]), detail: t, lines: [s.lineStart] }));
      else if (/^(?:\w+)\s*=(?!=)/.test(code) && /^(?:EV_|ES_|RV_|CV_|CS_|E_|C_)/i.test(code)) out.push(withCondition({ kind: 'check', name: upper(code.split('=')[0].trim()), detail: t, lines: [s.lineStart] }));
    }
  }
  return out;
}

/** The fields a `SELECT` names for one table (its field list and its `WHERE`), upper-cased. */
function fieldsOfSelect(snippet: string, table: string): string[] {
  const code = maskLiterals(snippet).replace(/\s+/g, ' ');
  const list = /^SELECT\s+(?:SINGLE\s+)?(?:DISTINCT\s+)?(.*?)\s+FROM\s/i.exec(code)?.[1] ?? '';
  const where = /\bWHERE\s+(.*)$/i.exec(code)?.[1] ?? '';
  const names = [
    ...(list.trim() === '*' ? [] : list.split(/[\s,]+/)),
    ...[...where.matchAll(/([\w~]+)\s*(?:=|<>|<=|>=|<|>|\bEQ\b|\bIN\b|\bBETWEEN\b)/gi)].map((m) => m[1]),
  ].map((n) => (n.toUpperCase().startsWith(`${table}~`) ? n.slice(table.length + 1) : n).replace(/^@/, '')).filter((n) => /^[A-Za-z_][\w]*$/.test(n) && !/^(?:INTO|TABLE|DATA|AND|OR|NOT|UP|TO|ROWS|AS|SINGLE|FROM|WHERE)$/i.test(n));
  return unique(names.map(upper));
}

/** The fields a list selects, `TABLE~FIELD` resolved to `TABLE-FIELD`. */
function listFields(s: AbapStatement): string[] {
  const code = maskLiterals(s.text).replace(/\s+/g, ' ');
  const list = /^SELECT\s+(?:SINGLE\s+)?(?:DISTINCT\s+)?(.*?)\s+FROM\s/i.exec(code)?.[1] ?? '';
  if (list.trim() === '*') return ['*'];
  return unique(list.split(/,\s*|\s+/).filter((n) => /^[\w~]+$/.test(n) && !/^(?:AS|SUM|COUNT|MAX|MIN|AVG)$/i.test(n)).map((n) => upper(n.replace('~', '-'))));
}

