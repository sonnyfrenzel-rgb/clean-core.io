import type { ProcessSkeleton, SkeletonNode } from './abap/process-skeleton';
import { humaniseRoutine, messageWordsAt, plainContext, plainLabels } from './abap/plain-language';
import { TABLE_TERMS_EN } from './abap/plain-glossary';
import { ENGINE_READS_3022_FROM } from './abap/engine-reads-3022-gate';

/**
 * The facts the naming stage may build a business name from (concept "Business-Lesbarkeit" H7 and H6, owner decision
 * of 06.11.2026: "AI together with the engine").
 *
 * The naming model used to see a node's technical token and its conditions, and nothing the engine had proved about
 * it — so it guessed, or copied the token. Here every node gets the engine's own evidence, each with an id:
 *
 *   - `engine` — the deterministic plain label of 3.0.22 (`plain-language.ts`), which already carries an internal
 *     table's source, the result check of a BAPI, a positive question, a stop's own message text;
 *   - `table` — a database table the step reads or writes, with its glossary word (`plain-glossary.ts`);
 *   - `message` — the program's own words on a `MESSAGE` at the node, quoted;
 *   - `part` — the routine the node stands in, in words.
 *
 * No new source of words: every fact is a part of the source the stage already had, or the glossary the engine
 * already ships (privacy text §3: "the source code or the parts of it the stage needs").
 *
 * **The checker (H6).** A name the model writes is accepted only when every content word of it is covered by a fact
 * of its node, its technical token or its conditions (`uncoveredWords`). A name that brings a word of its own — an
 * object, a role, a purpose the code does not carry — is dropped and counted (`not-in-facts`), and the map keeps the
 * engine's label. Verbs that say *how* a step is described (check, read, create …) and function words are free; a
 * business noun is not.
 *
 * Pure and deterministic.
 */

/**
 * Whether the product's naming stage gets the facts. Decided by the measurement run of 06.11.2026
 * (`tests/prozess-benchmark/naming-messung.ts`, 30 LEARN cases): see the commit that set it.
 */
export const NAMING_WITH_FACTS: boolean = false;

export type NamingFactKind = 'engine' | 'table' | 'message' | 'part';

export interface NamingFact {
  /** `f<n>`, unique across one context. The model cites a fact by this and nothing else. */
  id: string;
  kind: NamingFactKind;
  text: string;
}

export type NamingFacts = ReadonlyMap<string, readonly NamingFact[]>;

/** Facts of every node of a skeleton. */
export function namingFactsOf(skeleton: ProcessSkeleton, source: string): NamingFacts {
  const labels = plainLabels(skeleton, source, { engineVersion: ENGINE_READS_3022_FROM });
  const ctx = plainContext(source, { engineVersion: ENGINE_READS_3022_FROM });
  const regionLabel = new Map(skeleton.regions.map((r) => [r.key, r.label]));
  const out = new Map<string, NamingFact[]>();
  let n = 0;
  const id = () => `f${++n}`;
  for (const node of skeleton.nodes) {
    const facts: NamingFact[] = [];
    const label = labels.nodes.get(node.id) ?? '';
    if (label && label.toLowerCase() !== node.label.toLowerCase()) facts.push({ id: id(), kind: 'engine', text: label });
    for (const table of tablesOf(node)) {
      const term = TABLE_TERMS_EN[table.toLowerCase()];
      if (term) facts.push({ id: id(), kind: 'table', text: `${table.toUpperCase()} = ${term.singular}` });
    }
    if (node.kind === 'end-error' || node.kind === 'user-task') {
      for (const words of messageWordsAt(ctx, node.anchor?.lineStart)) facts.push({ id: id(), kind: 'message', text: `“${words}”` });
    }
    const region = regionLabel.get(node.region);
    if (region && /^[\w/]+$/.test(region)) {
      const part = humaniseRoutine(region);
      if (part && part.toLowerCase() !== region.toLowerCase()) facts.push({ id: id(), kind: 'part', text: part });
    }
    out.set(node.id, facts);
  }
  return out;
}

function tablesOf(node: SkeletonNode): string[] {
  if (node.kind !== 'read' && node.kind !== 'write') return [];
  const listed = Array.isArray(node.detail?.tables) ? (node.detail?.tables as string[]) : [node.label];
  return listed.filter((t) => /^[\w/]+$/.test(t));
}

/* ------------------------------------------------------------------ the checker (H6) */

/** Words that carry no business claim: function words, and the few nouns every step may use. */
const FREE = new Set(('a an the and or of to in on at by for with from into onto per via as is are be been was were has have had it its this that '
  + 'these those their there which what when where whether if then than not no nor any all each every both either more most other another '
  + 'one two three first last next new same own some only also still yet just up out off over under after before until while '
  + 'yes done step steps process data list lists result results entry entries record records detail details information value values '
  + 'case cases run runs error errors message messages item items line lines start end stop stops stopped ends ending finish found '
  + 'given set missing exists exist present empty valid invalid ok okay successful success failed fails failure').split(' '));

/** Verbs that describe what a step does to what the facts name — they add no object of their own. */
const VERBS = new Set(('check checks checking verify verifies validate validates confirm confirms read reads reading get gets fetch fetches '
  + 'retrieve retrieves load loads look lookup find finds select selects determine determines identify identifies create creates '
  + 'creating update updates updating change changes save saves saving store stores write writes delete deletes remove removes add adds '
  + 'post posts book books send sends notify notifies show shows display displays print prints output outputs calculate calculates '
  + 'compute computes derive derives decide decides apply applies collect collects prepare prepares process processes handle handles '
  + 'record records mark marks reject rejects approve approves release releases lock locks unlock skip skips continue continues keep '
  + 'transfer transfers convert converts assign assigns compare compares count counts sum sums total totals sort sorts filter filters '
  + 'begin begins initialize initializes clear clears reset resets ask asks request requests wait waits call calls run execute executes '
  + 'did does do report reports reported raise raises return returns need needs require requires allowed allow allows can cannot').split(' '));

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-zäöüß]+/g) ?? []).filter((w) => w.length >= 2);
}

const stem = (w: string) => w.replace(/(?:ies|es|s|ed|ing|ion|ions|ation|ations)$/, '').slice(0, 6);

/**
 * The content words of a name that no evidence covers. Empty means the name may stand. Evidence is the node's facts,
 * its technical token (`CHECK_AUTHORITY` → check, authority), its conditions and its part.
 */
export function uncoveredWords(name: string, evidence: readonly string[]): string[] {
  const have = new Set<string>();
  for (const text of evidence) {
    for (const w of words(text.replace(/[_-]+/g, ' '))) {
      have.add(w);
      have.add(stem(w));
    }
  }
  return [...new Set(words(name))].filter((w) => !FREE.has(w) && !VERBS.has(w) && !have.has(w) && !have.has(stem(w)));
}
