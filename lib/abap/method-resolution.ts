/**
 * Welche Implementierung ein Methodenaufruf erreicht — an einer Stelle, für
 * das Skelett und den Fachsatz.
 *
 * `process-skeleton.ts` hat diese Auflösung zuerst gebaut (D2, 27.09.2026);
 * `business-statement.ts` brauchte dieselbe, als die QA (b7e191a72212) zeigte,
 * dass ein `lo_external->save( )` die Wirkung der zufällig gleichnamigen
 * lokalen Methode `save` zugeschrieben bekam. Zwei Auflösungen hätten sich
 * früher oder später widersprochen; deshalb steht die Regel hier, und beide
 * rufen sie.
 *
 * **Die Klasse kommt aus dem Aufruf, nie aus einer Vermutung.** `cls=>m`
 * nennt sie; `me->m` und ein bloßes `m` meinen die Klasse, in der der Aufruf
 * steht; `lo->m` meint die Klasse, mit der `lo` deklariert ist, wenn der
 * Quelltext genau eine nennt; `super->m` die Oberklasse der eigenen. Von dort
 * geht es die Vererbungskette hinauf, die der Quelltext schreibt. Nennt der
 * Aufruf keine Klasse, entscheidet der Name allein nur, wenn der Aufrufer das
 * ausdrücklich zulässt (`byNameAlone`) — das Skelett tut es und zeichnet einen
 * mehrdeutigen Aufruf undurchsichtig; der Fachsatz tut es nicht, weil er sonst
 * einer fremden Methode eine lokale Wirkung zuschreibt.
 *
 * Dieses Modul kennt weder das Skelett noch den Fachsatz.
 */

import { maskLiterals, type AbapStatement } from './statement-reader';

/** Eine Methode, die der Quelltext implementiert. */
export interface MethodTarget {
  /** `CLASS=>METHOD`, groß geschrieben — der Schlüssel der Routine. */
  key: string;
  cls: string;
  /** Wie die Implementierung ihn schreibt, groß: `RUN`, `ZIF_X~RUN`. */
  name: string;
  /** Der Teil hinter `~`, oder der Name selbst. */
  short: string;
}

export interface ClassModel {
  impls: readonly MethodTarget[];
  /** `CLASS x DEFINITION INHERITING FROM y`, groß geschrieben. */
  superOf: ReadonlyMap<string, string>;
  /** Die Klassen, mit denen eine Referenzvariable deklariert ist, groß geschrieben. */
  refTypes: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface MethodResolution {
  key: string | null;
  ambiguous: boolean;
  /** Ob die Klasse aus dem Aufruf feststand — nicht nur aus dem Namen erraten. */
  byClass: boolean;
}

/**
 * Welche Klasse eine Referenzvariable hält, soweit der Quelltext es wörtlich
 * sagt: `TYPE REF TO`, `DATA(x) = NEW cls( )`, `x = NEW cls( )`,
 * `CREATE OBJECT x TYPE cls`, `CAST cls( … )`. Ein Name mit zwei
 * verschiedenen Typen (zwei Geltungsbereiche) bleibt ungelöst.
 */
export function readReferenceTypes(statements: readonly AbapStatement[]): Map<string, Set<string>> {
  const refTypes = new Map<string, Set<string>>();
  const add = (variable: string, type: string) => {
    const name = variable.toUpperCase().replace(/^ME->/, '');
    const set = refTypes.get(name) ?? new Set<string>();
    set.add(type.toUpperCase());
    refTypes.set(name, set);
  };
  for (const statement of statements) {
    if (statement.nativeSql) continue;
    const code = maskLiterals(statement.text);
    for (const m of code.matchAll(/([\w/]+)\s+TYPE\s+REF\s+TO\s+([\w/]+)/gi)) add(m[1], m[2]);
    const inline = /^(?:DATA|FINAL)\(([\w/]+)\)\s*=\s*(?:NEW|CAST)\s+([\w/]+)\(/i.exec(code);
    if (inline) add(inline[1], inline[2]);
    const assigned = /^((?:ME->)?[\w/]+)\s*=\s*(?:NEW|CAST)\s+([\w/]+)\(/i.exec(code);
    if (assigned) add(assigned[1], assigned[2]);
    const created = /^CREATE\s+OBJECT\s+((?:ME->)?[\w/]+)\s+TYPE\s+([\w/]+)/i.exec(code);
    if (created) add(created[1], created[2]);
  }
  return refTypes;
}

/**
 * Die Implementierung, die ein Aufruf erreicht, oder warum es keine gibt.
 *
 * `qualifier` ist, was vor dem letzten Pfeil steht (`)` für ein Objekt, das
 * sich nicht benennen lässt), `ownClass` die Klasse, in deren
 * `IMPLEMENTATION` der Aufruf steht.
 */
export function resolveMethodTarget(
  model: ClassModel,
  qualifier: string | null,
  op: '->' | '=>' | null,
  name: string,
  ownClass: string | null,
  options: { byNameAlone: boolean },
): MethodResolution {
  const wanted = name.toUpperCase();
  const byName = (impl: MethodTarget) => impl.name === wanted || impl.short === wanted;
  const unique = (found: MethodTarget[], byClass: boolean): MethodResolution =>
    found.length === 1
      ? { key: found[0].key, ambiguous: false, byClass }
      : { key: null, ambiguous: found.length > 1, byClass };

  let cls: string | null = null;
  // Ob die Klasse der deklarierte Typ einer Referenzvariablen ist.
  let fromReference = false;
  const q = qualifier?.toUpperCase() ?? null;
  if (op === '=>' && q) cls = q;
  else if (op === null || q === 'ME') cls = ownClass;
  else if (q && q !== ')' && q !== 'SUPER') {
    const types = model.refTypes.get(q);
    if (types?.size === 1) {
      cls = [...types][0];
      fromReference = true;
    }
  }

  if (q === 'SUPER') cls = ownClass ? model.superOf.get(ownClass) ?? null : null;

  // Der deklarierte Typ ist nicht der Laufzeittyp: `lo TYPE REF TO lcl_base`
  // kann eine Instanz von `lcl_sub` halten, und `lo->run( )` erreicht dann
  // dessen Redefinition. Redefiniert eine Unterklasse, die der Quelltext
  // schreibt, die Methode, ist das Ziel nicht eindeutig (QA full review of
  // v2.20.0, 5b0e06b9c4ea).
  if (cls && fromReference) {
    const base = cls;
    const below = (at: string): boolean => {
      const seen = new Set<string>([at]);
      for (let up = model.superOf.get(at); up && !seen.has(up); up = model.superOf.get(up)) {
        if (up === base) return true;
        seen.add(up);
      }
      return false;
    };
    if (model.impls.some((impl) => impl.cls !== base && byName(impl) && below(impl.cls))) {
      return { key: null, ambiguous: true, byClass: true };
    }
  }

  if (cls) {
    // Die Kette hinauf, die der Quelltext schreibt: eine geerbte Methode ist
    // weiter die Methode der Klasse. Der Qualifier fällt nie weg — eine
    // bekannte Klasse, die unter diesem Namen nichts implementiert, heißt
    // „nicht hier", nicht „die gleichnamige Methode einer anderen Klasse"
    // (QA-Review be3f06343260, 045fbec9b5a4).
    const seen = new Set<string>();
    for (let at: string | undefined = cls; at && !seen.has(at); at = model.superOf.get(at)) {
      seen.add(at);
      const own = model.impls.filter((impl) => impl.cls === at && impl.name === wanted);
      if (own.length) return unique(own, true);
      const alias = model.impls.filter((impl) => impl.cls === at && byName(impl));
      if (alias.length) return unique(alias, true);
    }
    // Eine Schnittstellenreferenz: die Implementierungen schreiben `lif_x~m`.
    const viaInterface = model.impls.filter((impl) => impl.name === `${cls}~${wanted}`);
    if (viaInterface.length) return unique(viaInterface, true);
    return { key: null, ambiguous: false, byClass: true };
  }
  if (!options.byNameAlone) return { key: null, ambiguous: false, byClass: false };
  return unique(model.impls.filter(byName), false);
}
