/**
 * Names of the generated package: functions, files, titles, ABAP methods.
 * Pure, no imports.
 */

const RESERVED = new Set(
  'break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public await async of arguments eval undefined NaN Infinity'.split(' '),
);

export function words(name: string): string[] {
  return name
    .replace(/^\/[\w]+\//, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

export function camelName(name: string): string {
  const w = words(name);
  if (w.length === 0) return 'step';
  let out = w[0] + w.slice(1).map((x) => x[0].toUpperCase() + x.slice(1)).join('');
  if (!/^[a-z_$]/i.test(out)) out = `n${out}`;
  if (RESERVED.has(out)) out = `${out}Step`;
  return out;
}

export function pascalName(name: string): string {
  const c = camelName(name);
  return c[0].toUpperCase() + c.slice(1);
}

export const kebab = (name: string) => words(name).join('-') || 'step';

export function titleOf(name: string): string {
  const w = words(name);
  if (w.length === 0) return 'Step';
  const s = w.join(' ');
  return s[0].toUpperCase() + s.slice(1);
}

/**
 * Method names ABAP gives a special meaning (an instance constructor may not have CHANGING parameters and
 * is called by NEW with its IMPORTING ones), and the names the RAP scaffold writes itself.
 */
const RAP_SPECIAL = new Set(['constructor', 'class_constructor', 'run_steps', 'run_process', 'get_instance_authorizations']);

/** The ABAP method name of a routine: lower snake case, at most 30 characters, never a special method's name. */
export function rapNameOf(name: string): string {
  const base = (words(name).join('_') || 'step').slice(0, 30);
  return RAP_SPECIAL.has(base) ? `${base.slice(0, 25)}_unit` : base;
}

