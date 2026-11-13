/**
 * Which methods are technique rather than process — roadmap 3.1.0, AB-15a (owner decision 06.11.2026).
 *
 * An object-oriented program spreads its process over methods, and some of them carry none of it: the constructor
 * that wires the objects together, a getter or setter, the method that shows the result, a small initialiser. The
 * business reading folds them into the step beside them or names them by the one thing they do; the technical
 * reading and every anchor keep them. Read by name only — the name the developer chose — so the list is short and
 * says only what such a name always means in ABAP: `constructor` and `class_constructor` are the language's own,
 * `get_`/`set_` are the getter/setter convention, `show`/`display`/`output`/`print` write the result out,
 * `refresh` alone or of the screen (`refresh_alv`) redraws it — `refresh_credit_limit` may well be a step of the process.
 *
 * Pure: no imports.
 */

/** The method's own name: `LIF_STORE~ROW` → `ROW`, `LCL_APP=>RUN` → `RUN`, `lo_app->show( )` → `show`. */
export function ownMethodName(label: string): string {
  const bare = String(label ?? '').replace(/\([\s\S]*$/, '').trim();
  return bare.split(/~|=>|->/).pop() ?? bare;
}

/** The interface a method name carries (`LIF_STORE~ROW` → `LIF_STORE`), or null. */
export function interfaceOfMethod(label: string): string | null {
  const m = /([\w/]+)~[\w/]+\s*(?:\(|$)/.exec(String(label ?? '').trim());
  return m ? m[1] : null;
}

const TECHNICAL_METHOD = /^(?:constructor|class_constructor|get_\w+|set_\w+|show(?:_\w+)?|display(?:_\w+)?|output(?:_\w+)?|print(?:_\w+)?|render(?:_\w+)?|init|initialize|init_\w+|free|cleanup|refresh(?:_(?:alv|grid|display|screen|view|output))?|to_string)$/i;

/** Is a method, by its own name, technique rather than a step of the process? */
export function isTechnicalMethodName(label: string): boolean {
  return TECHNICAL_METHOD.test(ownMethodName(label));
}

/** The language's own set-up method: `constructor`, `class_constructor`. */
export function isConstructorName(label: string): boolean {
  return /^(?:class_)?constructor$/i.test(ownMethodName(label));
}
