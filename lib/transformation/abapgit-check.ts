/**
 * The abapGit half of the formats check of the RAP track (roadmap 3.0.12,
 * importable package): every `<name>.<type>.xml` metadata file, and the
 * repository settings `.abapgit.xml`, held against the structure abapGit's
 * serializer writes and its deserializer reads — and every object source
 * against the presence of its metadata file, without which abapGit does not
 * create the object.
 *
 * What is checked, per file (the sources are cited in `abapgit-files.ts`):
 *
 *   - the XML is well formed (elements, attributes, text; this check reads no
 *     DTD, CDATA or processing instruction beyond the declaration);
 *   - the root is `<abapGit version="v1.0.0" serializer="LCL_OBJECT_<TYPE>"
 *     serializer_version="v1.0.0">` holding `asx:abap` → `asx:values` (abapGit's
 *     reader: zcl_abapgit_xml `parse`);
 *   - the type's elements: the name element equals the file's object name in
 *     upper case, within the type's length; the description within 60
 *     characters; the elements abapGit's deserializer requires (SRVD: DESCRIPTION,
 *     two-letter LANGUAGE and MASTER_LANGUAGE); the type's own fixed values
 *     (`TYPE` BDEF/BDO, SRVD/SRV, SRVB/SVB); a table's fields each typed by a
 *     data element or a built-in type with its length; a binding's service
 *     definition is one of the package;
 *   - the object's source file is there (`.clas.abap`, `.ddls.asddls`, …).
 *
 * What it does not check, and the record says so by passing nothing more: that
 * an SAP system activates the object. Only an import does.
 *
 * Results use the shape of the AFF check (`aff-check.ts`), so one `formats`
 * count holds both: AFF JSON files against SAP's schemas, abapGit XML files
 * here. Pure: no imports beyond the AFF check and types.
 */

import { affCheck, affCount, affFailures, affFileNameOf, AFF_NOT_RUN, type AffFile, type AffFileResult, type AffSchemaSource } from './aff-check';
import { DESCRIPTION_MAX, NAME_MAX } from './abapgit-files';
import type { CheckCount, CheckFailure } from './orchestrator';

/* ------------------------------------------------------------ XML reader */

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e]));

/** The document element of a small XML file, or the reason it is not well formed. */
export function parseXml(text: string): { root: XmlElement } | { error: string } {
  let s = text.replace(/^﻿/, '');
  s = s.replace(/^\s*<\?xml[^?]*\?>/, '');
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!--[\s\S]*?-->|([^<]+)|(<)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m[6]) return { error: `unexpected "<" at offset ${m.index}` };
    if (m[5] !== undefined) {
      if (stack.length === 0) {
        if (m[5].trim()) return { error: 'text outside the document element' };
        continue;
      }
      stack[stack.length - 1].text += decode(m[5]);
      continue;
    }
    if (m[0].startsWith('<!--')) continue;
    const [, close, name, attrText, selfClose] = m;
    if (close) {
      const open = stack.pop();
      if (!open || open.name !== name) return { error: `closing </${name}> does not match ${open ? `<${open.name}>` : 'any open element'}` };
      continue;
    }
    if (root && stack.length === 0) return { error: 'more than one document element' };
    const attrs: Record<string, string> = {};
    for (const a of attrText.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3] ?? '');
    const el: XmlElement = { name, attrs, children: [], text: '' };
    if (stack.length) stack[stack.length - 1].children.push(el);
    else root = el;
    if (!selfClose) stack.push(el);
  }
  if (stack.length) return { error: `<${stack[stack.length - 1].name}> is not closed` };
  if (!root) return { error: 'no document element' };
  return { root };
}

const child = (el: XmlElement | undefined, name: string) => el?.children.find((c) => c.name === name);
const value = (el: XmlElement | undefined, name: string) => child(el, name)?.text.trim();

/* -------------------------------------------------------------- structure */

/** The source files abapGit reads beside an object's XML (its serializers' `add_string`/`read_string` extensions). */
export const ABAPGIT_SOURCE_OF: Readonly<Record<string, string | null>> = {
  clas: 'clas.abap',
  intf: 'intf.abap',
  ddls: 'ddls.asddls',
  dcls: 'dcls.asdcls',
  bdef: 'bdef.asbdef',
  srvd: 'srvd.srvdsrv',
  srvb: null,
  tabl: null,
  devc: null,
};

/** One problem with a file, or null. */
/** `files` null: the file is checked alone, without the rules that need the rest of the package. */
type Rule = (ctx: { values: XmlElement; name: string; files: ReadonlySet<string> | null }) => string | null;

const nameIs = (path: string[], type: string): Rule => ({ values, name }) => {
  let el: XmlElement | undefined = values;
  for (const p of path) el = child(el, p);
  const v = el?.text.trim();
  const field = path[path.length - 1];
  if (!v) return `<${path.join('/')}> is missing`;
  if (v !== name.toUpperCase()) return `<${field}> is ${v}, the file names ${name.toUpperCase()}`;
  const max = NAME_MAX[type];
  if (max && v.length > max) return `the name ${v} is longer than ${max} characters, the most a ${type} name may have`;
  return null;
};

const required = (path: string[], check?: (v: string) => string | null): Rule => ({ values }) => {
  let el: XmlElement | undefined = values;
  for (const p of path) el = child(el, p);
  const v = el?.text.trim();
  const where = `<${path.join('/')}>`;
  if (!el || !v) return `${where} is missing or empty`;
  return check ? check(v) : null;
};

const description = (v: string) => (v.length > DESCRIPTION_MAX ? `the description has ${v.length} characters, more than ${DESCRIPTION_MAX}` : null);
const exactly = (want: string) => (v: string) => (v === want ? null : `is ${v}, abapGit's serializer writes ${want}`);
const twoLetters = (v: string) => (/^[A-Z]{2}$/.test(v) ? null : `must be two letters (abapGit refuses the object otherwise), not "${v}"`);
const oneLetter = (v: string) => (/^[A-Z0-9]$/.test(v) ? null : `must be one language key, not "${v}"`);
const oneOf = (...allowed: string[]) => (v: string) => (allowed.includes(v) ? null : `is ${v}, not one of ${allowed.join(', ')}`);
const prefixed = (path: string[], rule: (v: string) => string | null) => (v: string) => {
  const e = rule(v);
  return e ? `<${path.join('/')}> ${e}` : null;
};
const req = (path: string[], rule?: (v: string) => string | null) => required(path, rule ? prefixed(path, rule) : undefined);

const BUILTIN_LENGTH: Readonly<Record<string, boolean>> = { CLNT: true, CHAR: true, NUMC: true, DATS: true, INT1: true, INT2: true, INT4: true, INT8: true, DEC: true, CURR: true, QUAN: true, CUKY: true, UNIT: true, RAW: true, TIMS: true, LANG: true, STRG: false, RSTR: false };

const tableFields: Rule = ({ values }) => {
  const fields = child(values, 'DD03P_TABLE')?.children.filter((c) => c.name === 'DD03P') ?? [];
  if (fields.length === 0) return '<DD03P_TABLE> has no field';
  if (!fields.some((f) => value(f, 'KEYFLAG') === 'X')) return 'the table has no key field';
  const seen = new Set<string>();
  for (const f of fields) {
    const name = value(f, 'FIELDNAME');
    if (!name) return 'a <DD03P> has no <FIELDNAME>';
    if (seen.has(name)) return `the field ${name} is there twice`;
    seen.add(name);
    if (name.length > 30) return `the field name ${name} is longer than 30 characters`;
    const element = value(f, 'ROLLNAME');
    const type = value(f, 'DATATYPE');
    if (element) {
      if (value(f, 'COMPTYPE') !== 'E') return `the field ${name} names the data element ${element} without <COMPTYPE>E</COMPTYPE>`;
      continue;
    }
    if (!type) return `the field ${name} has neither a data element (<ROLLNAME>) nor a built-in type (<DATATYPE>)`;
    if (!(type in BUILTIN_LENGTH)) return `the field ${name} has the type ${type}, which this check does not know`;
    if (!value(f, 'INTTYPE') || !value(f, 'INTLEN')) return `the field ${name} has no <INTTYPE>/<INTLEN>`;
    if (BUILTIN_LENGTH[type] && !/^\d{6}$/.test(value(f, 'LENG') ?? '')) return `the field ${name} (${type}) has no six-digit <LENG>`;
  }
  return null;
};

const bindingService: Rule = ({ values, files }) => {
  const ref = child(child(child(child(child(child(child(values, 'SRVB'), 'CONTENT'), 'SERVICES'), 'item'), 'SERVICE_CONTENT'), 'item'), 'SRVD_REF');
  const srvd = value(ref, 'NAME');
  if (!srvd) return '<SRVB/CONTENT/SERVICES/item/SERVICE_CONTENT/item/SRVD_REF/NAME> is missing';
  if (value(ref, 'TYPE') !== 'SRVD/SRV') return '<SRVD_REF/TYPE> is not SRVD/SRV';
  if (files && !files.has(`${srvd.toLowerCase()}.srvd.xml`) && !files.has(`${srvd.toLowerCase()}.srvd.json`)) return `the binding names the service definition ${srvd}, which is not in the package`;
  return null;
};

/** What abapGit's serializer writes for each type, as rules over `asx:values`. */
export const ABAPGIT_STRUCTURE: Readonly<Record<string, Rule[]>> = {
  CLAS: [
    nameIs(['VSEOCLASS', 'CLSNAME'], 'CLAS'),
    req(['VSEOCLASS', 'LANGU'], oneLetter),
    req(['VSEOCLASS', 'DESCRIPT'], description),
    req(['VSEOCLASS', 'STATE'], exactly('1')),
    req(['VSEOCLASS', 'UNICODE'], oneOf('X', '2', '5')),
  ],
  INTF: [
    nameIs(['VSEOINTERF', 'CLSNAME'], 'INTF'),
    req(['VSEOINTERF', 'LANGU'], oneLetter),
    req(['VSEOINTERF', 'DESCRIPT'], description),
    req(['VSEOINTERF', 'STATE'], exactly('1')),
    req(['VSEOINTERF', 'UNICODE'], oneOf('X', '2', '5')),
  ],
  DDLS: [nameIs(['DDLS', 'DDLNAME'], 'DDLS'), req(['DDLS', 'DDLANGUAGE'], oneLetter), req(['DDLS', 'DDTEXT'], description), req(['DDLS', 'SOURCE_TYPE'])],
  DCLS: [nameIs(['DCLS', 'DCLNAME'], 'DCLS'), req(['DCLS', 'DCLLANGUAGE'], oneLetter), req(['DCLS', 'DDTEXT'], description)],
  BDEF: [
    nameIs(['BDEF', 'NAME'], 'BDEF'),
    req(['BDEF', 'TYPE'], exactly('BDEF/BDO')),
    req(['BDEF', 'DESCRIPTION'], description),
    req(['BDEF', 'LANGUAGE'], twoLetters),
  ],
  SRVD: [
    nameIs(['SRVD', 'NAME'], 'SRVD'),
    req(['SRVD', 'TYPE'], exactly('SRVD/SRV')),
    req(['SRVD', 'DESCRIPTION'], description),
    req(['SRVD', 'LANGUAGE'], twoLetters),
    req(['SRVD', 'MASTER_LANGUAGE'], twoLetters),
  ],
  SRVB: [
    nameIs(['SRVB', 'METADATA', 'NAME'], 'SRVB'),
    req(['SRVB', 'METADATA', 'TYPE'], exactly('SRVB/SVB')),
    req(['SRVB', 'METADATA', 'DESCRIPTION'], description),
    req(['SRVB', 'CONTENT', 'BIND_TYPE']),
    req(['SRVB', 'CONTENT', 'BIND_TYPE_VERSION'], oneOf('V2', 'V4')),
    bindingService,
  ],
  TABL: [
    ({ values, name }) => {
      const tab = value(child(values, 'DD02V'), 'TABNAME');
      if (!tab) return '<DD02V/TABNAME> is missing';
      if (tab !== name.toUpperCase()) return `<DD02V/TABNAME> is ${tab}, the file names ${name.toUpperCase()}`;
      if (value(child(values, 'DD02V'), 'TABCLASS') === 'TRANSP' && tab.length > NAME_MAX.TABL) return `the transparent table name ${tab} is longer than ${NAME_MAX.TABL} characters`;
      if (value(child(values, 'DD09L'), 'TABNAME') !== tab) return '<DD09L/TABNAME> does not name the table';
      return null;
    },
    req(['DD02V', 'DDLANGUAGE'], oneLetter),
    req(['DD02V', 'TABCLASS']),
    req(['DD02V', 'DDTEXT'], description),
    // abaplint's xml_consistency: a transparent table has a delivery class and a size category.
    req(['DD02V', 'CONTFLAG']),
    req(['DD09L', 'TABKAT']),
    tableFields,
  ],
  DEVC: [req(['DEVC', 'CTEXT'], description)],
};

/** The not-run and failure words of this check. */
export const ABAPGIT_NOT_RUN = {
  source: "source files have no file format to check here (their object's metadata file is checked; abaplint reads the source)",
  unknownType: "the structure abapGit's serializer writes for this object type is not modelled here",
} as const;

function checkObjectXml(path: string, name: string, type: string, content: string, files: ReadonlySet<string> | null): AffFileResult {
  const fail = (message: string): AffFileResult => ({ path, type, status: 'failed', schemaPath: '', instancePath: '', message: `abapGit's serializer format (LCL_OBJECT_${type.toUpperCase()}): ${message}` });
  const rules = ABAPGIT_STRUCTURE[type.toUpperCase()];
  if (!rules) return { path, type, status: 'not-run', reason: ABAPGIT_NOT_RUN.unknownType };
  const doc = parseXml(content);
  if ('error' in doc) return fail(`not well-formed XML (${doc.error})`);
  const root = doc.root;
  if (root.name !== 'abapGit') return fail(`the root element is <${root.name}>, abapGit reads <abapGit> only ("abapGit element not found")`);
  if (root.attrs.version !== 'v1.0.0') return fail(`<abapGit version="${root.attrs.version ?? ''}">: abapGit reads version v1.0.0 only`);
  if (root.attrs.serializer !== `LCL_OBJECT_${type.toUpperCase()}`) return fail(`serializer="${root.attrs.serializer ?? ''}", abapGit's serializer of ${type.toUpperCase()} is LCL_OBJECT_${type.toUpperCase()}`);
  if (root.attrs.serializer_version !== 'v1.0.0') return fail(`serializer_version="${root.attrs.serializer_version ?? ''}", not v1.0.0`);
  const abap = child(root, 'asx:abap');
  const values = child(abap, 'asx:values');
  if (!abap || abap.attrs['xmlns:asx'] !== 'http://www.sap.com/abapxml' || !values) return fail('no <asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values> inside <abapGit>');
  for (const rule of rules) {
    const e = rule({ values, name, files });
    if (e) return fail(e);
  }
  const source = ABAPGIT_SOURCE_OF[type];
  if (source && files && !files.has(`${name}.${source}`)) return fail(`the source file ${name}.${source} is missing`);
  return { path, type, status: 'passed' };
}

/**
 * Whether one metadata file, on its own, has the structure abapGit's serializer
 * writes for its type (no package-level rule: source file, bound service). The
 * delivery's STATUS reads it to say so of each file.
 */
export function abapGitXmlHolds(path: string, content: string): boolean {
  const n = affFileNameOf(path);
  return !!n && n.rest === 'xml' && checkObjectXml(path, n.name.toLowerCase(), n.type, content, null).status === 'passed';
}

/** The fields of `.abapgit.xml` (zif_abapgit_dot_abapgit `ty_dot_abapgit`). */
const DOT_ABAPGIT_FIELDS = new Set(['NAME', 'MASTER_LANGUAGE', 'I18N_LANGUAGES', 'USE_LXE', 'WITHOUT_TRANSLATION', 'STARTING_FOLDER', 'FOLDER_LOGIC', 'IGNORE', 'REQUIREMENTS', 'VERSION_CONSTANT', 'ABAP_LANGUAGE_VERSION', 'ORIGINAL_SYSTEM']);

/** `.abapgit.xml` against what abapGit reads: `asx:abap` → `asx:values` → `DATA` with its own fields only. */
export function checkDotAbapGit(path: string, content: string, sourcesUnder: (folder: string) => boolean): AffFileResult {
  const fail = (message: string): AffFileResult => ({ path, type: 'abapgit', status: 'failed', schemaPath: '', instancePath: '', message: `abapGit's repository settings: ${message}` });
  const doc = parseXml(content);
  if ('error' in doc) return fail(`not well-formed XML (${doc.error})`);
  const data = child(child(doc.root, 'asx:values'), 'DATA');
  if (doc.root.name !== 'asx:abap' || !data) return fail('not <asx:abap><asx:values><DATA>');
  const unknown = data.children.find((c) => !DOT_ABAPGIT_FIELDS.has(c.name));
  if (unknown) return fail(`<${unknown.name}> is not a field of .abapgit.xml`);
  const lang = value(data, 'MASTER_LANGUAGE');
  if (!lang || !/^[A-Z0-9]$/.test(lang)) return fail('<MASTER_LANGUAGE> must be one language key');
  const folder = value(data, 'STARTING_FOLDER');
  if (!folder || !/^\/(?:[\w-]+\/)*$/.test(folder)) return fail('<STARTING_FOLDER> must be a folder such as /src/');
  if (!sourcesUnder(folder.slice(1))) return fail(`no object file is under the starting folder ${folder}`);
  if (!['PREFIX', 'FULL', 'MIXED'].includes(value(data, 'FOLDER_LOGIC') ?? '')) return fail('<FOLDER_LOGIC> must be PREFIX, FULL or MIXED');
  return { path, type: 'abapgit', status: 'passed' };
}

/**
 * The formats check of a RAP package: AFF JSON against SAP's schemas
 * (`affCheck`), abapGit XML and `.abapgit.xml` against abapGit's structure, and
 * every object source against its metadata file — a source whose object has no
 * metadata file fails (abapGit would not create the object); one whose object
 * has it is not run here (its content is abaplint's).
 */
export function packageFormatsCheck(files: readonly AffFile[], source: AffSchemaSource): AffFileResult[] {
  const norm = files.map((f) => ({ path: f.path.replace(/\\/g, '/').replace(/^\.?\//, ''), content: f.content }));
  const names = new Set(norm.map((f) => f.path.split('/').pop()!.toLowerCase()));
  const out: AffFileResult[] = [];
  for (const f of norm) {
    if (f.path === '.abapgit.xml') {
      out.push(checkDotAbapGit(f.path, f.content, (folder) => norm.some((x) => x.path.startsWith(folder) && affFileNameOf(x.path))));
      continue;
    }
    const n = affFileNameOf(f.path);
    if (!n) continue;
    if (n.rest === 'json') {
      out.push(...affCheck([f], source));
      continue;
    }
    if (n.rest === 'xml') {
      out.push(checkObjectXml(f.path, n.name.toLowerCase(), n.type, f.content, names));
      continue;
    }
    const base = `${n.name.toLowerCase()}.${n.type}`;
    if (!names.has(`${base}.xml`) && !names.has(`${base}.json`)) {
      out.push({ path: f.path, type: n.type, status: 'failed', schemaPath: '', instancePath: '', message: `no metadata file ${base}.xml (abapGit) or ${base}.json (AFF): abapGit does not import the object` });
      continue;
    }
    out.push({ path: f.path, type: n.type, status: 'not-run', reason: ABAPGIT_NOT_RUN.source });
  }
  return out;
}

/** The runner verifier's `formats` hook over both formats (`verify.ts`): the count and the findings of one candidate. */
export function packageFormatsHook(source: AffSchemaSource): (files: readonly AffFile[]) => { count: CheckCount; failures: CheckFailure[] } {
  return (files) => {
    const results = packageFormatsCheck(files, source);
    return { count: affCount(results, 0), failures: affFailures(results) };
  };
}

export { AFF_NOT_RUN };
