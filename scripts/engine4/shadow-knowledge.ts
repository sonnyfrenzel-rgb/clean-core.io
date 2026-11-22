/**
 * Shadow of the knowledge tree (`lib/knowledge/`) and the graded reference table (`lib/engine4/graded.ts`) against
 * today's catalog (`lib/abap/catalog-service.ts`): for every name the reference table finds, the facts
 * `sapFacts()` reads must be the facts `getSapObjectStates()` reads (release state, classification state,
 * successor, SAP's or the customer's) — the proof that both engines read one knowledge, not two copies. Also
 * counts every reference by standing, and lists the C/D-graded ones today names nowhere.
 *
 *   npx tsx scripts/engine4/shadow-knowledge.ts [--corpus <MANIFEST.json> --group <g>]
 *
 * Never reads the holdout.
 */
import { getSapObjectStates, gradeSapObject } from '../../lib/abap/catalog-service';
import { readSource } from '../../lib/engine4/index';
import { references } from '../../lib/engine4/references';
import { gradeReferences, standingCounts, type GradedReference } from '../../lib/engine4/graded';
import { corpusFromArgs, type CorpusFile } from './shadow';

export interface KnowledgeShadow {
  files: number;
  graded: number;
  factsCompared: number;
  factsIdentical: number;
  mismatches: string[];
  standings: ReturnType<typeof standingCounts>;
  /** Standing against today's level letter (for the review only; the letter never enters engine 4). */
  standingByLevel: Record<string, Record<string, number>>;
}

export function runKnowledgeShadow(corpus: CorpusFile[]): KnowledgeShadow {
  const r: KnowledgeShadow = { files: 0, graded: 0, factsCompared: 0, factsIdentical: 0, mismatches: [], standings: {}, standingByLevel: {} };
  const all: GradedReference[] = [];
  for (const file of corpus) {
    r.files += 1;
    const { statements, tree } = readSource(file.source);
    const graded = gradeReferences(references(statements, tree));
    r.graded += graded.length;
    all.push(...graded);
    for (const g of graded) {
      if (!g.facts) continue;
      r.factsCompared += 1;
      const today = getSapObjectStates(g.facts.name);
      const same =
        today.releaseState === g.facts.releaseState &&
        today.classificationState === g.facts.classificationState &&
        Boolean(today.hasSuccessor) === g.facts.successors.length > 0 &&
        Boolean(today.isSapObject) === g.facts.isSapObject &&
        Boolean(today.isCustomerObject) === g.facts.isCustomerObject;
      if (same) r.factsIdentical += 1;
      else if (r.mismatches.length < 20) r.mismatches.push(`${file.name}:${g.row} ${g.facts.name}: today ${JSON.stringify(today)}, knowledge ${JSON.stringify(g.facts)}`);
      const level = gradeSapObject(g.facts.name).grade;
      const row = (r.standingByLevel[g.standing] ??= {});
      row[level] = (row[level] ?? 0) + 1;
    }
  }
  r.standings = standingCounts(all);
  return r;
}

if (require.main === module) {
  const r = runKnowledgeShadow(corpusFromArgs());
  console.log(`files ${r.files}, graded references ${r.graded}; facts identical to today's catalog ${r.factsIdentical} / ${r.factsCompared}`);
  for (const m of r.mismatches.slice(0, 10)) console.log(`  mismatch ${m}`);
  console.log('standing per kind: customer / released / classicApi / notReleased / unlisted / unknown');
  for (const [k, v] of Object.entries(r.standings)) console.log(`  ${k}: ${v.customer} / ${v.released} / ${v.classicApi} / ${v.notReleased} / ${v.unlisted} / ${v.unknown}`);
  console.log('standing against today\'s level letter:');
  for (const [s, v] of Object.entries(r.standingByLevel)) console.log(`  ${s}: ${JSON.stringify(v)}`);
}
