import { maskLiterals, readStatements, type AbapStatement } from './statement-reader';

/**
 * Classic programming models in the uploaded code — roadmap 3.0.12, from the
 * review of the DSAG ABAP guideline (owner decision 13.10.2026).
 *
 * Three technologies a custom development may still be built on, each with a
 * successor in SAP's current programming model:
 *
 *   - **BOPF** (`/BOBF/…` classes and interfaces, or a CDS view whose
 *     `@ObjectModel` annotations generate a BOPF business object). Successor:
 *     a RAP business object.
 *   - **Classic SAP Gateway services** built in transaction SEGW: the
 *     generated data and model provider classes (`…_DPC_EXT`, `…_MPC_EXT`)
 *     on `/IWBEP/CL_MGW_ABS_DATA` / `/IWBEP/CL_MGW_ABS_MODEL`. Successor: a RAP
 *     service definition and an OData V4 service binding.
 *   - **DDIC-based CDS views** (`@AbapCatalog.sqlViewName`, `DEFINE VIEW`
 *     without `ENTITY`). Successor: the CDS view entity (`DEFINE VIEW ENTITY`).
 *
 * The wording is checked against SAP's own data, not taken from the guideline
 * alone. SAP's classification file lists the BOPF and Gateway framework
 * classes and interfaces (`/BOBF/IF_FRW_DETERMINATION`,
 * `/BOBF/IF_TRA_SERVICE_MANAGER`, `/IWBEP/CL_MGW_ABS_DATA`, …) as `classicAPI`
 * — clean core level B, usable from classic ABAP. So BOPF and SEGW are not
 * called obsolete here: they are classic technology that ABAP Cloud does not
 * offer, and new development goes to RAP. Only the DDIC-based CDS view is
 * called obsolete, because SAP's ABAP language documentation calls it that.
 *
 * DSAG ABAP guideline: core-data-services/index.md § DDIC-based views - OBSOLET
 * DSAG ABAP guideline: clean-core/solution-approach.md § Neue Konzepte (BOPF → RAP)
 * DSAG ABAP guideline: clean-core/problems-and-challenges.md (BOPF, SEGW projects)
 *
 * Pure: source in, uses out.
 */

export type LegacyTechnologyKind = 'bopf' | 'gateway-classic-service' | 'ddic-cds-view';

export interface LegacyTechnologyUse {
  kind: LegacyTechnologyKind;
  lineStart: number;
  /** Every line the same object is used on, the first included. */
  lines: number[];
  /**
   * The SAP object the use names (`/BOBF/IF_FRW_DETERMINATION`,
   * `/IWBEP/CL_MGW_ABS_DATA`) — graded by the level lookup — or undefined
   * where the use names none of SAP's objects.
   */
  sapObject?: string;
  objectType?: 'Class' | 'Interface';
  /** The customer object the use belongs to: the provider class, the CDS view. */
  customObject?: string;
  /** Every framework object of the same technology the source names, in order of first use. */
  objects?: string[];
  /** For a DDIC-based view: the SQL view name of the annotation. */
  sqlViewName?: string;
  /** The statement or source line, whitespace collapsed. */
  text: string;
}

const MGW_SUPER = /^\/IWBEP\/CL_MGW_(?:PUSH_)?ABS_(?:DATA|MODEL)$/i;

/**
 * `engineReads` — from engine 3.0.18 (`ENGINE_READS_FROM`): every CDS view
 * whose annotations generate a BOPF object is reported, not only the first.
 */
export function readLegacyTechnology(
  source: string,
  statements: AbapStatement[] = readStatements(source),
  options: { engineReads?: boolean } = {},
): LegacyTechnologyUse[] {
  const uses: LegacyTechnologyUse[] = [];

  /* -------------------------------------------------------------- BOPF */
  const bopf = new Map<string, LegacyTechnologyUse>();
  /* ------------------------------------------- classic Gateway (SEGW) */
  const providers: LegacyTechnologyUse[] = [];
  const mgw = new Map<string, LegacyTechnologyUse>();

  for (const statement of statements) {
    if (statement.nativeSql) continue;
    const code = maskLiterals(statement.text);

    for (const m of code.matchAll(/\/BOBF\/[A-Z0-9_]+/gi)) {
      const name = m[0].toUpperCase();
      const held = bopf.get(name);
      if (held) {
        if (!held.lines.includes(statement.lineStart)) held.lines.push(statement.lineStart);
        continue;
      }
      bopf.set(name, {
        kind: 'bopf',
        lineStart: statement.lineStart,
        lines: [statement.lineStart],
        sapObject: name,
        ...(/^\/BOBF\/(?:CL|CX)_/.test(name) ? { objectType: 'Class' as const } : /^\/BOBF\/IF_/.test(name) ? { objectType: 'Interface' as const } : {}),
        text: statement.text,
      });
    }

    const definition = /^CLASS\s+([\w/]+)\s+DEFINITION\b[\s\S]*?\bINHERITING\s+FROM\s+([\w/]+)/i.exec(code);
    if (definition) {
      const own = definition[1].toUpperCase();
      const parent = definition[2].toUpperCase();
      if (MGW_SUPER.test(parent) || (/_(?:DPC|MPC)_EXT$/.test(own) && /_(?:DPC|MPC)$/.test(parent))) {
        providers.push({
          kind: 'gateway-classic-service',
          lineStart: statement.lineStart,
          lines: [statement.lineStart],
          customObject: own,
          ...(MGW_SUPER.test(parent) ? { sapObject: parent, objectType: 'Class' as const } : {}),
          text: statement.text,
        });
        continue;
      }
    }
    for (const m of code.matchAll(/\/IWBEP\/(?:CL|IF|CX)_MGW_[A-Z0-9_]+/gi)) {
      const name = m[0].toUpperCase();
      const held = mgw.get(name);
      if (held) {
        if (!held.lines.includes(statement.lineStart)) held.lines.push(statement.lineStart);
        continue;
      }
      mgw.set(name, {
        kind: 'gateway-classic-service',
        lineStart: statement.lineStart,
        lines: [statement.lineStart],
        sapObject: name,
        objectType: /^\/IWBEP\/IF_/.test(name) ? 'Interface' : 'Class',
        text: statement.text,
      });
    }
  }
  // One use per technology and source: a BOPF implementation names a dozen
  // framework types, and a finding per type repeated one fact a dozen times.
  const folded = fold([...bopf.values()]);
  if (folded) uses.push(folded);
  // A provider class says it all; the framework names used inside it would
  // repeat the same finding. Without a provider class in the upload, the
  // framework names are the evidence.
  if (providers.length) uses.push(...providers);
  else {
    const gateway = fold([...mgw.values()]);
    if (gateway) uses.push(gateway);
  }

  /* -------------------------------------------- CDS source (DDL) lines */
  uses.push(...readCdsSource(source, options.engineReads === true));

  return uses.sort((a, b) => a.lineStart - b.lineStart);
}

/**
 * Many uses of one technology as one: anchored at the first, graded on the
 * first class or interface (types such as `/BOBF/T_FRW_KEY` are in neither of
 * SAP's files), every line kept.
 */
function fold(all: LegacyTechnologyUse[]): LegacyTechnologyUse | null {
  if (!all.length) return null;
  const first = [...all].sort((a, b) => a.lineStart - b.lineStart)[0];
  const graded = all.find((u) => u.objectType) ?? first;
  return {
    ...first,
    sapObject: graded.sapObject,
    ...(graded.objectType ? { objectType: graded.objectType } : {}),
    lines: [...new Set(all.flatMap((u) => u.lines))].sort((a, b) => a - b),
    objects: all.map((u) => u.sapObject!).filter(Boolean),
  };
}

/** CDS DDL source with its `//` and `/* … *\/` comments blanked, line for line. */
function cdsCodeLines(source: string): string[] {
  const out: string[] = [];
  let block = false;
  for (const raw of source.split(/\r?\n/)) {
    let line = '';
    let inString = false;
    for (let i = 0; i < raw.length; i++) {
      const two = raw.slice(i, i + 2);
      if (block) {
        if (two === '*/') { block = false; i++; line += '  '; } else line += ' ';
        continue;
      }
      if (!inString && two === '/*') { block = true; i++; line += '  '; continue; }
      if (!inString && two === '//') break;
      if (raw[i] === "'") inString = !inString;
      line += raw[i];
    }
    out.push(line);
  }
  return out;
}

function readCdsSource(source: string, perView: boolean): LegacyTechnologyUse[] {
  const lines = cdsCodeLines(source);
  const uses: LegacyTechnologyUse[] = [];
  const nameAfter = (from: number, re: RegExp): string | undefined => {
    for (let j = from; j < Math.min(lines.length, from + 40); j++) {
      const m = re.exec(lines[j]);
      if (m) return m[1].toUpperCase();
    }
    return undefined;
  };
  for (let i = 0; i < lines.length; i++) {
    const annotation = /^\s*@AbapCatalog\.sqlView(Append)?Name\s*:\s*'([^']*)'/i.exec(lines[i]);
    if (annotation) {
      const extend = annotation[1] !== undefined;
      const view = extend
        ? nameAfter(i, /\bextend\s+view\s+(?!entity\b)([\w/]+)/i)
        : nameAfter(i, /\bdefine\s+(?:root\s+)?view\s+(?!entity\b)([\w/]+)/i);
      uses.push({
        kind: 'ddic-cds-view',
        lineStart: i + 1,
        lines: [i + 1],
        ...(view ? { customObject: view } : {}),
        sqlViewName: annotation[2].toUpperCase(),
        text: lines[i].trim(),
      });
      continue;
    }
    // A CDS view whose annotations generate a BOPF business object.
    if (/^\s*@ObjectModel\.(?:transactionalProcessingEnabled|writeActivePersistence|writeDraftPersistence)\s*:/i.test(lines[i])) {
      const view = nameAfter(i, /\bdefine\s+(?:root\s+)?view\s+(?:entity\s+)?([\w/]+)/i);
      // One use per view (from 3.0.18): a second annotation of the same view
      // adds nothing, a second view is a second object. Before, the first
      // annotation of the source stood for all of them.
      if (uses.some((u) => u.kind === 'bopf' && !u.sapObject && (!perView || u.customObject === view))) continue;
      uses.push({
        kind: 'bopf',
        lineStart: i + 1,
        lines: [i + 1],
        ...(view ? { customObject: view } : {}),
        text: lines[i].trim(),
      });
    }
  }
  return uses;
}
