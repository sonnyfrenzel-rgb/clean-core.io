/**
 * Engine 4.0, layer L3: the naming conventions an upload is read by — pure data
 * and small pure helpers, no imports (ADR-125 (1)).
 *
 * Every entry is a convention of the ABAP workbench or of abapGit, written down
 * from how those tools name things (prior art: SAP's include naming, abapGit's
 * file names, SAP/abap-file-formats), not copied from any source. The table is
 * the place a new convention goes, so `layout.ts` never grows a special case.
 */

/** What a part of an object is for. Drives the reading order when no main program says it. */
export type PartRole =
  | 'main'
  | 'top'
  | 'selection'
  | 'localClasses'
  | 'functionModules'
  | 'functionModule'
  | 'forms'
  | 'pbo'
  | 'pai'
  | 'events'
  | 'localImplementations'
  | 'tests'
  | 'classLocalDefinitions'
  | 'classMacros'
  | 'classPublic'
  | 'classProtected'
  | 'classPrivate'
  | 'classLocalImplementations'
  | 'classMethod'
  | 'classTests'
  | 'include';

/**
 * Reading rank of a role when the order has to be built from conventions: a
 * function group without `SAPL…`, a class without its class pool, a report's
 * includes nobody names. Lower reads first. Declarations before use, as SAP's
 * generated frames do: TOP, then local class definitions, then the function
 * modules, then routines and modules.
 */
export const ROLE_RANK: Record<PartRole, number> = {
  classLocalDefinitions: 0,
  classMacros: 1,
  top: 2,
  main: 3,
  classPublic: 4,
  classProtected: 5,
  classPrivate: 6,
  selection: 7,
  localClasses: 8,
  functionModules: 9,
  functionModule: 10,
  classLocalImplementations: 11,
  classMethod: 12,
  forms: 13,
  pbo: 14,
  pai: 15,
  events: 16,
  localImplementations: 17,
  include: 18,
  tests: 19,
  classTests: 20,
};

/**
 * The three-character suffix of an include of a program, a module pool or a
 * function group (`LZFOOTOP`, `MZPMO01`, `ZREP_F01`): the workbench proposes
 * `TOP` for global data, `UXX`/`Unn` for the function modules of a group,
 * `Fnn` for subroutines, `Onn`/`Inn` for PBO/PAI modules, `Enn` for events,
 * `Cnn`/`Dnn` for local classes, `Pnn` for their implementations and `Tnn`
 * for tests. `SEL`, `SCR` and `CLS` are common customer suffixes for the
 * selection screen and local classes. A `_` before the suffix is tolerated
 * (`ZREP_F01`, `MZPM_STOER_TOP`).
 */
const SUFFIX_RULES: Array<{ rx: RegExp; role: PartRole }> = [
  { rx: /^TOP$/, role: 'top' },
  { rx: /^(?:SEL|SCR)$/, role: 'selection' },
  { rx: /^(?:CLS|[CD]\d\d)$/, role: 'localClasses' },
  { rx: /^UXX$/, role: 'functionModules' },
  { rx: /^U\d\d$/, role: 'functionModule' },
  { rx: /^F\d\d$/, role: 'forms' },
  { rx: /^O\d\d$/, role: 'pbo' },
  { rx: /^I\d\d$/, role: 'pai' },
  { rx: /^E\d\d$/, role: 'events' },
  { rx: /^P\d\d$/, role: 'localImplementations' },
  { rx: /^T\d\d$/, role: 'tests' },
];

/** `ZREP_F01` → stem `ZREP`, role `forms`; null for a name without a known suffix. */
export function includeSuffixOf(name: string): { stem: string; suffix: string; role: PartRole } | null {
  const m = /^(.+?)_?(TOP|SEL|SCR|CLS|UXX|[CDEFIOPTU]\d\d)$/.exec(name);
  if (!m || m[1].length < 2) return null;
  const rule = SUFFIX_RULES.find((r) => r.rx.test(m[2]));
  return rule ? { stem: m[1], suffix: m[2], role: rule.role } : null;
}

/**
 * The program an include stem belongs to by the workbench's naming: a function
 * group `ZFOO` has the main program `SAPLZFOO` and the includes `LZFOO…`; a
 * module pool `SAPMZFOO` has the includes `MZFOO…`; a customer exit's
 * include `ZXQQMU20` sits in SAP's exit group `XQQM`. Any other stem is a
 * report's own name (`ZREP_F01` → `ZREP`).
 */
export function hostOfStem(stem: string): { type: 'functionGroup' | 'program'; object: string; program: string } {
  // A customer-exit include `ZX<group>Unn` belongs to SAP's exit function group `X<group>` (`ZXQQMU20` → `XQQM`).
  if (/^ZX./.test(stem)) return { type: 'functionGroup', object: `X${stem.slice(2)}`, program: `SAPLX${stem.slice(2)}` };
  if (/^SAPL./.test(stem)) return { type: 'functionGroup', object: stem.slice(4), program: stem };
  if (/^SAPM./.test(stem)) return { type: 'program', object: stem, program: stem };
  if (/^L[A-Z/]/.test(stem)) return { type: 'functionGroup', object: stem.slice(1), program: `SAP${stem}` };
  if (/^M[YZ]/.test(stem)) return { type: 'program', object: `SAP${stem}`, program: `SAP${stem}` };
  return { type: 'program', object: stem, program: stem };
}

/**
 * The includes of a global class's pool, as SAP names them (`ZCL_X=====CCDEF`,
 * the class name padded with `=` to 30 characters, then the suffix) and as
 * abapGit names its files (`zcl_x.clas.locals_def.abap`). `CU`/`CO`/`CI` (the
 * three sections) and `CMnnn` (one method) only count with the `=` padding:
 * written as `_CU` they are too easily a customer's own name.
 */
const CLASS_SUFFIXES: Array<{ suffix: string; role: PartRole; padded?: boolean }> = [
  { suffix: 'CCDEF', role: 'classLocalDefinitions' },
  { suffix: 'CCMAC', role: 'classMacros' },
  { suffix: 'CCIMP', role: 'classLocalImplementations' },
  { suffix: 'CCAU', role: 'classTests' },
  { suffix: 'CP', role: 'main', padded: true },
  { suffix: 'CU', role: 'classPublic', padded: true },
  { suffix: 'CO', role: 'classProtected', padded: true },
  { suffix: 'CI', role: 'classPrivate', padded: true },
];

const ABAPGIT_CLASS_PARTS: Record<string, PartRole> = {
  LOCALS_DEF: 'classLocalDefinitions',
  MACROS: 'classMacros',
  LOCALS_IMP: 'classLocalImplementations',
  TESTCLASSES: 'classTests',
};

/** `ZCL_X=====CCDEF` → class `ZCL_X`, role; `ZCL_X.LOCALS_IMP` (abapGit) likewise; else null. */
export function classIncludeOf(name: string): { object: string; role: PartRole } | null {
  const dot = /^([^.]+)\.([A-Z_]+)$/.exec(name);
  if (dot && ABAPGIT_CLASS_PARTS[dot[2]]) return { object: dot[1], role: ABAPGIT_CLASS_PARTS[dot[2]] };
  const method = /^(.+?)=+CM[0-9A-Z]{3}$/.exec(name);
  if (method) return { object: method[1], role: 'classMethod' };
  for (const { suffix, role, padded } of CLASS_SUFFIXES) {
    const rx = padded ? new RegExp(`^(.+?)=+${suffix}$`) : new RegExp(`^(.+?)(?:=+|_)${suffix}$`);
    const m = rx.exec(name);
    if (m) return { object: m[1], role };
  }
  return null;
}

/** abapGit's file name `name.type[.part].abap`; `#ns#` is the namespace `/NS/`. */
export function abapGitName(file: string): { name: string; type: 'prog' | 'fugr' | 'clas' | 'intf' | 'type'; part: string | null } | null {
  const base = file.split(/[\\/]/).pop() ?? file;
  const m = /^([^.]+)\.(prog|fugr|clas|intf|type)(?:\.([^.]+))?\.abap$/i.exec(base);
  if (!m) return null;
  const ns = (s: string) => s.replace(/^#([^#]+)#/, '/$1/').toUpperCase();
  return { name: ns(m[1]), type: m[2].toLowerCase() as 'prog', part: m[3] ? ns(m[3]) : null };
}

/** File extensions the product reads as ABAP source (`OWN_CODE_SOURCE_EXTENSIONS`). */
export const SOURCE_EXTENSIONS = ['.abap', '.txt'] as const;

/**
 * Whether an object name lies in the customer namespace: `Z…`/`Y…`, a
 * `/namespace/`, and the workbench's frames around them (`LZ…`, `MZ…`,
 * `SAPLZ…`, `SAPMZ…`). An include outside it is SAP's (`DBPNPMAC`, `<ICON>`):
 * an upload is not expected to hold it, so its absence is no question to the
 * reader.
 */
export function isCustomerName(name: string): boolean {
  return /^(?:SAP[LM])?[LM]?[YZ]/.test(name) || /^(?:SAP[LM])?[LM]?\/[^/]+\//.test(name) || /^[YZ]/.test(name);
}

/**
 * The marker lines the product writes when it joins a program and its
 * includes into the one source a project stores (`lib/abap/include-resolution.ts`,
 * `INCLUDE_OPEN_MARK`/`INCLUDE_CLOSE_MARK`). Declared again here because this
 * tree imports nothing from `lib/abap/`; `tests/engine4-layout.spec.ts` fails
 * the day the two texts part.
 */
export const JOIN_OPEN_MARK = '*>>> Clean-Core.io: include';
export const JOIN_CLOSE_MARK = '*<<< Clean-Core.io: end of include';

/**
 * Macros a program sees without defining them: names only, never a body.
 *
 *  - `hrLogicalDatabase`: the macro include of the HR logical databases PNP,
 *    PNPCE and PAP (`DBPNPMAC`) is part of every program attached to one, so
 *    `RP_PROVIDE_FROM_LAST` and its siblings are defined there, not in the
 *    upload. The logical database is a program attribute, not source, so the
 *    source shows it only by its nodes: `NODES peras`, `TABLES pernr`, or a
 *    `GET pernr`/`GET peras` event; or the program names the include itself.
 *    `INFOTYPES` alone is no sign (it is used without a logical database too).
 *  - `trmac`: the hyphenated spellings live in the macro table `TRMAC`, which
 *    every program sees (an obsolete mechanism, still found in old HR code).
 *
 * Sources: the HR programming documentation of the logical databases PNP/PAP
 * ("the program using the macro must contain the include DBPNPMAC") as quoted
 * in community references; names only.
 */
export const SYSTEM_MACROS: ReadonlyArray<{ name: string; from: 'hrLogicalDatabase' | 'trmac' }> = [
  { name: 'RP_PROVIDE_FROM_LAST', from: 'hrLogicalDatabase' },
  { name: 'RP_PROVIDE_FROM_FRST', from: 'hrLogicalDatabase' },
  { name: 'RP-PROVIDE-FROM-LAST', from: 'trmac' },
  { name: 'RP-PROVIDE-FROM-FRST', from: 'trmac' },
];

/** Nodes of the HR logical databases whose declaration attaches a program to one. */
export const HR_LDB_NODES: ReadonlySet<string> = new Set(['PERNR', 'PERAS']);

/** Includes whose name alone attaches the HR macros. */
export const HR_MACRO_INCLUDES: ReadonlySet<string> = new Set(['DBPNPMAC']);
