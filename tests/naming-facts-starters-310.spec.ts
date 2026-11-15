import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { EXAMPLES_DIR } from './helpers/starter-example-files';
import {
  NAMING_FACTS_PROMPT_MARK,
  NAMING_FORMAT_VERSION,
  NAMING_MADE_FROM_FACTS,
  applyNaming,
  buildNamingPrompt,
  namingContextOf,
  namingFactsApply,
  namingPaused,
  namingRecordApplies,
  validateNamingAnswer,
  type ProcessNamingRecord,
} from '../lib/process-naming';
import { aiNamesOfNaming } from '../lib/bpmn/export';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';

/**
 * Roadmap 3.1.0 item 1 (plan AB-1, "Done when"), on every example the site offers, server-free: the model is not
 * called; its answer is written here from the engine's own facts, which is the most a name may say.
 *
 *   - read for engine 3.1.0, every example's naming context carries the facts, the prompt hands them over and the
 *     pause lets it through;
 *   - a name built from a node's facts passes the checker, the record the route stores from such a context
 *     (`madeFrom: 'engine-facts'`) is applied, and exactly its names are the AI names of the BPMN download;
 *   - a run signed by 3.0.21 keeps its picture: its context carries no facts, its map is the 3.0.21 map node for
 *     node, nothing is asked for it, and a naming made for the 3.1.0 reading never lands on it unless the two
 *     readings are the same map.
 */

const EXAMPLES = fs.readdirSync(EXAMPLES_DIR).filter((f) => /\.(abap|txt)$/i.test(f)).sort();
const read = (file: string) => fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8').replace(/\r\n/g, '\n');

function storedFrom(digest: string, names: Array<{ id: string; technicalName: string; name: string }>): ProcessNamingRecord {
  return {
    formatVersion: NAMING_FORMAT_VERSION,
    digest,
    names,
    lanes: [],
    discarded: { total: 0, byRule: {} },
    origin: {
      source: 'model',
      receipt: 'verified',
      provider: 'google-gemini',
      modelId: 'gemini-receipt-model',
      byok: false,
      issuedAt: Date.parse('2026-11-12T09:30:00.000Z'),
      textSha256: 'a'.repeat(64),
    },
    namedAt: '2026-11-12T09:30:05.000Z',
    madeFrom: NAMING_MADE_FROM_FACTS,
  };
}

test('the site offers the seven examples this spec reads', () => {
  expect(EXAMPLES).toHaveLength(7);
});

for (const file of EXAMPLES) {
  test.describe(file, () => {
    const source = read(file);

    test('engine 3.1.0: facts on the context, handed over in the prompt, not paused', () => {
      expect(namingFactsApply('3.1.0')).toBe(true);
      const ctx = namingContextOf(source, { engineVersion: '3.1.0' });
      expect(ctx.facts).toBeDefined();
      expect(namingPaused(ctx)).toBe(false);
      expect(buildNamingPrompt(ctx)).toContain(NAMING_FACTS_PROMPT_MARK);
      // Every node is listed; most have at least one fact to build a name from.
      expect([...ctx.facts!.keys()].sort()).toEqual(ctx.skeleton.nodes.map((n) => n.id).sort());
      expect([...ctx.facts!.values()].filter((f) => f.length > 0).length).toBeGreaterThan(0);
    });

    test('a name built from the facts passes, is stored as made from them, applied, and is what the download marks', () => {
      const ctx = namingContextOf(source, { engineVersion: '3.1.0' });
      // The engine's own reading, cited: the most a model may say about a step.
      const answer = ctx.skeleton.nodes
        .map((n) => ({ node: n, fact: (ctx.facts!.get(n.id) ?? []).find((f) => f.kind === 'engine') }))
        .filter((x) => x.fact)
        .map((x) => ({ id: x.node.id, name: x.fact!.text, facts: [x.fact!.id] }));
      const validated = validateNamingAnswer(ctx, JSON.stringify({ names: answer, lanes: [] }));
      expect(validated.discarded.byRule['not-in-facts'] ?? 0, 'a name made of its own engine fact was refused as invented').toBe(0);
      expect(validated.names.length).toBeGreaterThan(0);

      const record = storedFrom(ctx.digest, validated.names);
      expect(namingRecordApplies(record)).toBe(true);
      const view = applyNaming(ctx, record);
      expect(view.state).toBe('named');
      expect(view.counts.named).toBe(validated.names.length);
      for (const node of view.nodes) {
        // Every name carries the AI mark (`proposed`); every node without one carries none.
        expect(node.nameProvenance).toBe(node.businessName === null ? null : 'proposed');
      }
      const ai = aiNamesOfNaming(ctx, record);
      expect(ai).toBeDefined();
      expect(Object.keys(ai!.names).sort()).toEqual(validated.names.map((n) => n.id).sort());
      expect(ai!.authorship.modelId).toBe('gemini-receipt-model');
    });

    test('a run signed by 3.0.21 keeps its picture: no facts, its own map, nothing asked', () => {
      expect(namingFactsApply('3.0.21')).toBe(false);
      const old = namingContextOf(source, { engineVersion: '3.0.21' });
      expect(old.facts).toBeUndefined();
      expect(namingPaused(old)).toBe(true);
      expect(old.skeleton.nodes.map((n) => [n.id, n.label])).toEqual(
        buildProcessSkeleton(source, { engineVersion: '3.0.21' }).nodes.map((n) => [n.id, n.label]),
      );
      const now = namingContextOf(source, { engineVersion: '3.1.0' });
      const record = storedFrom(now.digest, []);
      const onOld = applyNaming(old, record);
      if (old.digest === now.digest) expect(onOld.state).toBe('named');
      else expect(onOld.state).toBe('stale');
      expect(onOld.nodes.every((n) => n.businessName === null)).toBe(true);
    });
  });
}
