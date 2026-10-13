/**
 * The file-format check of the RAP track (roadmap 3.0.12, owner 13.10.2026):
 * every generated ABAP object file whose type SAP's ABAP file formats define a
 * JSON schema for is validated against that schema
 * (github.com/SAP/abap-file-formats, MIT; schemas `file-formats/<type>/<type>-v<n>.json`).
 *
 * AFF describes an object as `<name>.<type>.json` (the metadata, validated
 * here) beside its source (`.clas.abap`, `.ddls.acds`, `.bdef.abdl`, …). Only
 * the `.json` file has a schema; a source file, or an abapGit XML file, has
 * none — it is "not run", never "passed".
 *
 * Three outcomes per file, the same words as the other checks
 * (`check-words.ts`):
 *
 *   - passed — the file is JSON and the schema of its type and format
 *     version holds;
 *   - failed — not JSON, or the first schema error, with its schema path
 *     (`#/properties/header/properties/description/maxLength`) and the
 *     place in the file (`/header/description`);
 *   - not run — no schema applies (source, abapGit XML), the schema of the
 *     type is not available in this build, or the schema uses a keyword this
 *     check does not evaluate.
 *
 * The validator is a small interpreter for the keywords the AFF schemas use
 * (surveyed over all 106 schemas at e42c8003): `type`, `properties`,
 * `required`, `additionalProperties`, `const`, `enum`, `items`, `minItems`,
 * `maxItems`, `uniqueItems`, `minLength`, `maxLength`, `pattern`, `minimum`,
 * `maximum`; the rest are annotations. No code generation (the page's CSP has
 * no `unsafe-eval`) and no dependency. A schema with any other keyword is not
 * evaluated at all, so an unknown rule can never pass silently.
 *
 * Pure: no imports beyond types.
 */

import type { CheckCount, CheckFailure } from './orchestrator';

export interface AffFile {
  path: string;
  content: string;
}

/** The schema of an object type in a format version, or null when this build does not have it. */
export type AffSchemaSource = (type: string, formatVersion: string) => unknown | null;

export type AffFileResult =
  | { path: string; type: string; status: 'passed' }
  | { path: string; type: string; status: 'failed'; schemaPath: string; instancePath: string; message: string }
  | { path: string; type: string; status: 'not-run'; reason: string };

/** `zcl_x_logic.clas.locals_imp.abap` → name, type, the rest of the extension; null for a file that is no object file. */
export function affFileNameOf(path: string): { name: string; type: string; rest: string } | null {
  const base = path.replace(/\\/g, '/').split('/').pop() ?? '';
  const m = base.match(/^([^.]+)\.([a-z0-9]{4})\.(.+)$/);
  return m ? { name: m[1], type: m[2], rest: m[3] } : null;
}

/* ------------------------------------------------------------- validator */

const ANNOTATIONS = new Set(['$comment', '$id', '$schema', 'title', 'description', 'default', 'enumTitles', 'enumDescriptions', 'format', 'examples', 'deprecated', 'readOnly', 'writeOnly']);
const ASSERTIONS = new Set(['type', 'properties', 'required', 'additionalProperties', 'const', 'enum', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum']);

const pointer = (seg: string | number) => String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The first keyword in the schema this check does not evaluate (with its path), or null. */
export function unsupportedKeywordOf(schema: unknown, at = '#'): string | null {
  if (typeof schema === 'boolean') return null;
  if (!isObject(schema)) return `${at} (not a schema)`;
  for (const [k, v] of Object.entries(schema)) {
    if (ANNOTATIONS.has(k)) continue;
    if (!ASSERTIONS.has(k)) return `${at}/${pointer(k)}`;
    if (k === 'pattern') {
      try {
        new RegExp(String(v), 'u');
      } catch {
        return `${at}/pattern (not an ECMAScript pattern)`;
      }
    }
    if (k === 'properties') {
      if (!isObject(v)) return `${at}/properties (not an object)`;
      for (const [p, s] of Object.entries(v)) {
        const hit = unsupportedKeywordOf(s, `${at}/properties/${pointer(p)}`);
        if (hit) return hit;
      }
    }
    if (k === 'items' || (k === 'additionalProperties' && typeof v !== 'boolean')) {
      const hit = unsupportedKeywordOf(v, `${at}/${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => k in b && deepEqual(a[k], b[k]));
  }
  return false;
}

function typeOk(t: string, v: unknown): boolean {
  switch (t) {
    case 'object':
      return isObject(v);
    case 'array':
      return Array.isArray(v);
    case 'string':
      return typeof v === 'string';
    case 'boolean':
      return typeof v === 'boolean';
    case 'null':
      return v === null;
    case 'number':
      return typeof v === 'number' && Number.isFinite(v);
    case 'integer':
      return typeof v === 'number' && Number.isInteger(v);
    default:
      return false;
  }
}

export interface SchemaError {
  schemaPath: string;
  instancePath: string;
  message: string;
}

/** The first error of `value` against `schema` (depth first, in the schema's key order), or null when it holds. */
export function firstSchemaError(schema: unknown, value: unknown, at = '#', where = ''): SchemaError | null {
  const err = (kw: string, message: string): SchemaError => ({ schemaPath: `${at}/${kw}`, instancePath: where || '/', message });
  if (schema === true) return null;
  if (schema === false) return { schemaPath: at, instancePath: where || '/', message: 'no value is allowed here' };
  if (!isObject(schema)) return null;
  const s = schema;
  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? s.type.map(String) : [String(s.type)];
    if (!types.some((t) => typeOk(t, value))) return err('type', `must be ${types.join(' or ')}`);
  }
  if ('const' in s && !deepEqual(s.const, value)) return err('const', `must be ${JSON.stringify(s.const)}`);
  if (Array.isArray(s.enum) && !s.enum.some((e) => deepEqual(e, value))) return err('enum', `must be one of ${s.enum.map((e) => JSON.stringify(e)).join(', ')}`);
  if (typeof value === 'string') {
    const len = [...value].length;
    if (typeof s.minLength === 'number' && len < s.minLength) return err('minLength', `must be at least ${s.minLength} characters`);
    if (typeof s.maxLength === 'number' && len > s.maxLength) return err('maxLength', `must be at most ${s.maxLength} characters`);
    if (typeof s.pattern === 'string' && !new RegExp(s.pattern, 'u').test(value)) return err('pattern', `must match ${s.pattern}`);
  }
  if (typeof value === 'number') {
    if (typeof s.minimum === 'number' && value < s.minimum) return err('minimum', `must be at least ${s.minimum}`);
    if (typeof s.maximum === 'number' && value > s.maximum) return err('maximum', `must be at most ${s.maximum}`);
  }
  if (Array.isArray(value)) {
    if (typeof s.minItems === 'number' && value.length < s.minItems) return err('minItems', `must have at least ${s.minItems} items`);
    if (typeof s.maxItems === 'number' && value.length > s.maxItems) return err('maxItems', `must have at most ${s.maxItems} items`);
    if (s.uniqueItems === true) {
      for (let i = 1; i < value.length; i++) {
        if (value.slice(0, i).some((x) => deepEqual(x, value[i]))) return err('uniqueItems', `item ${i} repeats an earlier item`);
      }
    }
    if (s.items !== undefined) {
      for (let i = 0; i < value.length; i++) {
        const e = firstSchemaError(s.items, value[i], `${at}/items`, `${where}/${i}`);
        if (e) return e;
      }
    }
  }
  if (isObject(value)) {
    const props = isObject(s.properties) ? s.properties : {};
    if (Array.isArray(s.required)) {
      for (const r of s.required) if (!(String(r) in value)) return err('required', `must have the property "${String(r)}"`);
    }
    for (const [k, sub] of Object.entries(props)) {
      if (!(k in value)) continue;
      const e = firstSchemaError(sub, value[k], `${at}/properties/${pointer(k)}`, `${where}/${pointer(k)}`);
      if (e) return e;
    }
    if (s.additionalProperties !== undefined && s.additionalProperties !== true) {
      for (const k of Object.keys(value)) {
        if (k in props) continue;
        if (s.additionalProperties === false) return { schemaPath: `${at}/additionalProperties`, instancePath: `${where}/${pointer(k)}`, message: `the property "${k}" is not defined by the format` };
        const e = firstSchemaError(s.additionalProperties, value[k], `${at}/additionalProperties`, `${where}/${pointer(k)}`);
        if (e) return e;
      }
    }
  }
  return null;
}

/* ----------------------------------------------------------------- check */

/** The not-run reasons, short and without file names, so the count can say them once. */
export const AFF_NOT_RUN = {
  source: 'source files have no AFF schema (only the <name>.<type>.json metadata file has one)',
  abapGitXml: 'abapGit XML metadata, not the AFF JSON format — no AFF schema applies',
  noSchema: 'the AFF schema of the object type is not available in this build',
  subFile: 'AFF sub-object and settings files (`.tabl.settings.json`, `.fugr.<x>.func.json`, `.docu.json`) are not checked yet',
} as const;

/** Every generated ABAP object file, checked against the AFF schema of its type. Files that are no object file are left out. */
export function affCheck(files: readonly AffFile[], source: AffSchemaSource): AffFileResult[] {
  const out: AffFileResult[] = [];
  for (const f of files) {
    const n = affFileNameOf(f.path);
    if (!n) continue;
    const path = f.path.replace(/\\/g, '/');
    if (n.rest !== 'json') {
      out.push({ path, type: n.type, status: 'not-run', reason: n.rest === 'xml' ? AFF_NOT_RUN.abapGitXml : n.rest.endsWith('.json') ? AFF_NOT_RUN.subFile : AFF_NOT_RUN.source });
      continue;
    }
    let data: unknown;
    try {
      data = JSON.parse(f.content);
    } catch (e) {
      out.push({ path, type: n.type, status: 'failed', schemaPath: '', instancePath: '', message: `not valid JSON (${e instanceof Error ? e.message : String(e)})` });
      continue;
    }
    const version = isObject(data) && typeof data.formatVersion === 'string' ? data.formatVersion : '1';
    const schema = source(n.type, version);
    if (schema === null || schema === undefined) {
      out.push({ path, type: n.type, status: 'not-run', reason: AFF_NOT_RUN.noSchema });
      continue;
    }
    const unsupported = unsupportedKeywordOf(schema);
    if (unsupported) {
      out.push({ path, type: n.type, status: 'not-run', reason: `the AFF schema uses a keyword this check does not evaluate (${unsupported})` });
      continue;
    }
    const e = firstSchemaError(schema, data);
    out.push(e ? { path, type: n.type, status: 'failed', ...e } : { path, type: n.type, status: 'passed' });
  }
  return out;
}

/** The results as one check of kind `formats` (no scope: the files are engine-written, the fills write no metadata). */
export function affCount(results: readonly AffFileResult[], ms: number): CheckCount {
  const notRun = results.filter((r) => r.status === 'not-run');
  const reasons = [...new Set(notRun.map((r) => (r.status === 'not-run' ? r.reason : '')))];
  return {
    kind: 'formats',
    total: results.length,
    passed: results.filter((r) => r.status === 'passed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    notRun: notRun.length,
    notRunReason: reasons.length ? reasons.join('; ').slice(0, 300) : null,
    ms,
  };
}

/** A failing file as a finding in engine-written code: the file, the schema path of the first error, the place in the file. */
export function affFailures(results: readonly AffFileResult[]): CheckFailure[] {
  return results.flatMap((r) =>
    r.status === 'failed'
      ? [{ unitId: null, check: 'formats' as const, failure: `${r.path} does not match the ABAP file format of ${r.type.toUpperCase()}${r.schemaPath ? ` at ${r.schemaPath} (${r.instancePath})` : ''}: ${r.message}` }]
      : [],
  );
}

/** The `formats` hook of the runner verifier (`verify.ts`): the count and the findings of one candidate. */
export function affFormatsCheck(source: AffSchemaSource): (files: readonly AffFile[]) => { count: CheckCount; failures: CheckFailure[] } {
  return (files) => {
    const results = affCheck(files, source);
    return { count: affCount(results, 0), failures: affFailures(results) };
  };
}
