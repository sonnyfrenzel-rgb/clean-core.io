import { test, expect } from '@playwright/test';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readCallGraph } from '../lib/abap/call-graph';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { buildProcessSkeleton, buildProcessSkeletonFrom } from '../lib/abap/process-skeleton';
import { deriveBusinessRules, deriveBusinessRulesFrom } from '../lib/abap/business-rule-set';
import { tokenize, parseDeclarations } from '../lib/abap/declaration-parser';
import type { AbapStatement } from '../lib/abap/statement-reader';

/**
 * What the deterministic engine does with a source that is large or deep —
 * three findings of the b88c77b audit, each measured before it was fixed.
 *
 * The engine reads whatever `legacyCode` holds, and `firestore.rules:145` lets
 * that be 1 MB. None of the three needed a crafted exploit: a long program, a
 * deep chain of `PERFORM`s, or a program whose statements run over many lines
 * is enough.
 *
 *   1. **`findCycles` recursed once per link of the PERFORM chain**
 *      (`call-graph.ts`). A 410 kB source with a 6000-link chain ended in
 *      `RangeError: Maximum call stack size exceeded` after 499 ms, and took
 *      `readCallGraph`, the process facts and the business rules with it — the
 *      Business view of that project answered 500 for good. The walk of the
 *      process skeleton, which follows the same chain, fell over at the same
 *      input: `formRegion` → `walkRange` → `walkStatement` → `walkPerform`
 *      recursing four frames per link, out of stack between 800 and 1200 links.
 *      The first is now iterative and has no limit at all; the second has a
 *      named floor at 200 links which the skeleton reports rather than passes
 *      over in silence.
 *
 *   2. **`deriveBusinessRules` searched a list once per candidate**
 *      (`business-rule-set.ts`): the statements for a `CHECK`, the branches of
 *      2.1, the nodes of the skeleton, the containers of the block structure —
 *      and `collapseSmallRegions` in `process-skeleton.ts` filtered every node
 *      of the source once per region and per pass. `deriveBusinessRules`,
 *      facts and skeleton included, on generated ABAP: 1.1 MB 5450 ms →
 *      1358 ms, 2.2 MB 18 911 ms → 4396 ms. It is not linear yet — twice the
 *      source still costs some three times the work — but the four searches
 *      that grew with the square of it are gone.
 *
 *   3. **`tokenize` rescanned the whole buffer on every line**
 *      (`declaration-parser.ts`). 10 000 lines that never reach a period —
 *      378 kB — took 111 716 ms, and `buildAbapEvidence` on the same input
 *      482 379 ms. Eight minutes of CPU for one request, repeatable, on a
 *      payload that is quota-free by fingerprint. Now 47 ms and 447 ms.
 *
 * **Not vacuous, and byte for byte the same.** The three readings were compared
 * against the implementations at `98f374d` over 92 real ABAP sources in this
 * repository (`public/starter-examples`, `tests/korpus`, `docs/korpus`) — call
 * graph, process skeleton, business rules and class declarations, hashed —
 * and `tokenize` additionally over 60 000 generated inputs built from the
 * characters that decide where a statement ends. Not one differed. The hashes
 * pinned below are those values: a change that makes the engine find something
 * else fails here, which is the point — this is the evidence half of the
 * product, and a faster reading that reads something else is a defect.
 */

const EXAMPLES = join(process.cwd(), 'public/starter-examples');
const read = (name: string) => readFileSync(join(EXAMPLES, name), 'utf8');
const LEGACY = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';

const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/* ------------------------------------------------------------------ sources */

/**
 * `depth` subroutines, each performing the next — the shape of finding 1. The
 * first and the last carry a threshold, so the rules of the source are not
 * empty and the reading can be checked rather than only survived.
 */
function deepPerformChain(depth: number): string {
  const name = (i: number) => `step_${String(i).padStart(4, '0')}`;
  const out: string[] = ['REPORT z_deep_chain.', '', 'START-OF-SELECTION.', `  PERFORM ${name(1)}.`, ''];
  for (let i = 1; i <= depth; i++) {
    out.push(`FORM ${name(i)}.`, `  WRITE / '${name(i)}'.`);
    if (i === 1 || i === depth) out.push(`  IF gv_amount > ${1000 + i}.`, "    WRITE / 'over'.", '  ENDIF.');
    if (i < depth) out.push(`  PERFORM ${name(i + 1)}.`);
    out.push('ENDFORM.', '');
  }
  return out.join('\n');
}

/**
 * The 37 kB program this product ships, with `count` validation routines added,
 * each guarded by two `CHECK`s that carry a threshold.
 *
 * The tail is generated because it has to be: no shipped example and no corpus
 * case writes a `CHECK` whose condition holds a literal, so none of them
 * reaches the statement lookup finding 2 is about. The base is verbatim.
 */
function legacyWithCheckGuards(count: number): string {
  const out: string[] = [read(LEGACY), ''];
  for (let i = 1; i <= count; i++) {
    const n = String(i).padStart(4, '0');
    out.push(
      `FORM validate_amount_${n}.`,
      `  DATA lv_amount_${n} TYPE p DECIMALS 2.`,
      `  DATA lv_country_${n} TYPE land1.`,
      `  SELECT SINGLE netwr land1 FROM vbak INTO (lv_amount_${n}, lv_country_${n}) WHERE vbeln = gv_vbeln.`,
      `  CHECK lv_amount_${n} > ${1000 + i}.`,
      `  CHECK lv_country_${n} = 'DE'.`,
      `  IF lv_amount_${n} > ${50000 + i}.`,
      `    WRITE / 'over limit ${n}'.`,
      '  ENDIF.',
      'ENDFORM.',
      '',
    );
  }
  return out.join('\n');
}

/** Lines that never end a statement: the buffer of `tokenize` never empties. */
function withoutAPeriod(lines: number): string {
  const out: string[] = ['CLASS zcl_demo DEFINITION'];
  for (let i = 1; i < lines; i++) out.push(`  lv_value_${i} = lv_value_${i - 1} + ${i}`);
  return out.join('\n');
}

const CHAIN_DEPTH = 6000;
const chain = deepPerformChain(CHAIN_DEPTH);

/* ------------------------------------- 1. a chain deeper than the call stack */

test.describe('a PERFORM chain deeper than the call stack', () => {
  test(`readCallGraph reads all ${CHAIN_DEPTH} links instead of running out of stack`, () => {
    expect(Buffer.byteLength(chain, 'utf8'), 'well under the 1 MB a legacyCode field may hold')
      .toBeLessThan(1024 * 1024);

    const report = readCallGraph(chain);
    expect(report.forms).toHaveLength(CHAIN_DEPTH);
    expect(report.performs).toHaveLength(CHAIN_DEPTH);
    expect(report.edges).toHaveLength(CHAIN_DEPTH);
    expect(report.recursion, 'a chain is not a cycle').toEqual([]);
    expect(report.unreachable, 'every link is performed by the one above it').toEqual([]);
    expect(report.neverPerformed).toEqual([]);
  });

  test('the cycles it reports are the cycles it reported before', () => {
    const mutual = [
      'REPORT z_cycle.', 'START-OF-SELECTION.', '  PERFORM a.',
      'FORM a.', '  PERFORM b.', 'ENDFORM.',
      'FORM b.', '  PERFORM a.', 'ENDFORM.',
      'FORM c.', '  PERFORM c.', 'ENDFORM.',
    ].join('\n');
    // Two cycles, each in call order, a self-call as one entry — the walk was
    // made iterative, not different.
    expect(readCallGraph(mutual).recursion).toEqual([['A', 'B'], ['C']]);
  });

  test('deriveBusinessRules still answers, and still finds both thresholds', () => {
    const set = deriveBusinessRules(chain);
    expect(set.program).toBe('Z_DEEP_CHAIN');
    expect(set.counts.candidates).toBe(2);
    expect(set.rules.map((r) => r.id)).toEqual(['BR-001', 'BR-002']);
    expect(set.rules[0].label).toBe('gv_amount > 1001');
    expect(set.rules[1].label).toBe(`gv_amount > ${1000 + CHAIN_DEPTH}`);
  });

  test('the skeleton says where it stopped opening routines instead of drawing less in silence', () => {
    const skeleton = buildProcessSkeleton(chain);
    const cut = skeleton.notes.filter((n) => n.reason === 'expansion-depth-reached');
    expect(cut, 'one note, at the first link past the floor').toHaveLength(1);
    expect(cut[0].detail).toContain('STEP_0201 is performed 200 calls deep');
    expect(cut[0].detail).toContain('chain that starts at STEP_0001');
    expect(cut[0].lineStart, 'the note carries the range of the routine it did not open')
      .toBeGreaterThan(0);
    // The floor is about the walk, not about the reading: the routines below it
    // are read, they are not drawn, and nothing calls them unreached.
    expect(skeleton.notDrawn.unreached).toEqual([]);
  });

  test('a chain short enough for the floor is drawn whole', () => {
    const shallow = buildProcessSkeleton(deepPerformChain(150));
    expect(shallow.notes.filter((n) => n.reason === 'expansion-depth-reached')).toEqual([]);
  });
});

/* ------------------------------------------- 2. the rules of a large source */

/** Counts every index read of the statement list — `find` over it is visible. */
function countingStatements(statements: AbapStatement[]): { proxy: AbapStatement[]; reads: () => number } {
  let reads = 0;
  const proxy = new Proxy(statements, {
    get(target, property, receiver) {
      if (typeof property === 'string' && /^\d+$/.test(property)) reads += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  return { proxy, reads: () => reads };
}

test.describe('the business rules of a large source', () => {
  /**
   * Work counted, not seconds: how often the builder reads a statement out of
   * the list, per statement in the source. A search per candidate makes that
   * number grow with the source; a map keeps it flat. Measured before the fix:
   * 147.6, 260.9 and 471.0 reads per statement for the three sizes below, the
   * number doubling with the source exactly as a quadratic reading does.
   */
  test('reading a statement stays flat per statement as the source grows', () => {
    const perStatement = [100, 200, 400].map((routines) => {
      const source = legacyWithCheckGuards(routines);
      const facts = buildProcessFacts(source);
      const skeleton = buildProcessSkeletonFrom(facts);
      const { proxy, reads } = countingStatements(facts.statements);
      const set = deriveBusinessRulesFrom(source, { ...facts, statements: proxy }, skeleton);
      expect(set.rules.length, 'the source really does carry the rules being counted')
        .toBe(routines * 2 + 17);
      return reads() / facts.statements.length;
    });

    for (const reads of perStatement) expect(reads).toBeLessThan(10);
    // Four times the source, no more work per statement — flat, not linear.
    expect(perStatement[2]).toBeLessThan(perStatement[0] * 1.5);
  });

  test('the rules of the eight shipped programs are unchanged, byte for byte', () => {
    const pinned: Record<string, string> = {
      'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap': '8a1f534de8e3bd84b92183d2a4675a4262bf5e80f90a886456b8ea0f6dc1f162',
      'Z_BUSINESS_PARTNER_SYNC.txt': '9a1e899f8ffd59c50e81c7d18470accd28c53f9c2ee86d40ba639822f0692b1e',
      'Z_EMPLOYEE_EXPENSE_VAL.txt': '40a8fb42ed60085d1c0e96c0a2ddbc46a50ccc7aae1cce1a1d1ca8002dd96bf7',
      'Z_INVOICE_EXTRACTOR.txt': '35d9750084364efced78c549d1813632fd7e28dbf81e3ed5052601ce693a8b19',
      'Z_MATERIAL_STOCK_CALC.txt': 'c1461014e95b819f62741c8c8c914c0abba8c6cfbf5d701b2d3fc9ceabfd5d32',
      'Z_MM_PO_APPROVAL.abap': '0a209e8c7c13b96c1921e4a60784bafd768465c4304583b485fee3b991c78d6f',
      'Z_ORDER_INTEGRITY_CHECK.txt': '74408766ed94e42280d8085bfd3f67d139652bf88a8706bc91e843f191e6554f',
      'Z_SALES_ORDER_CREATOR.txt': '7b079dd80f1dc957a1c6c298de9e68cc6fb21515621ff38b0948fb8c6626f177',
    };
    for (const [name, digest] of Object.entries(pinned)) {
      expect(sha(deriveBusinessRules(read(name))), `${name} reads differently now`).toBe(digest);
    }
  });

  test('and so is the reading of a 172 kB source that does hit the indexed lookup', () => {
    const composite = legacyWithCheckGuards(400);
    const set = deriveBusinessRules(composite);
    expect(set.rules).toHaveLength(817);
    expect(sha(set)).toBe('cc443f914faeec48366e6884c49ee3966429850a8c61c8428e651929d88fe1f4');
  });
});

/* --------------------------------------- 3. a statement that runs over lines */

test.describe('a source whose statements run over many lines', () => {
  /**
   * Two sizes against each other rather than a wall-clock limit: the local
   * machine is slower than CI and CI is slower than nothing, but a reading that
   * starts over on every line costs four times as much for twice the input
   * wherever it runs. The smallest of three runs is taken, because a single
   * sample of a 30 ms measurement is mostly garbage collection. Measured before
   * the fix, 2000 → 5000 lines: 2740 ms → 23 524 ms, which is 8.6 times the
   * work for 2.5 times the input.
   */
  test('twice the lines is not four times the work', () => {
    const small = withoutAPeriod(8000);
    const large = withoutAPeriod(16000);
    tokenize(small);
    tokenize(large);

    let ratio = Infinity;
    for (let run = 0; run < 3; run++) {
      const t1 = Date.now();
      tokenize(small);
      const msSmall = Math.max(Date.now() - t1, 1);
      const t2 = Date.now();
      tokenize(large);
      const msLarge = Date.now() - t2;
      ratio = Math.min(ratio, msLarge / msSmall);
    }
    expect(ratio, 'the work grows with the square of the source again').toBeLessThan(4);
  });

  test('the statements it cuts out of the shipped programs are the same ones', () => {
    const pinned: Record<string, { statements: number; digest: string }> = {
      'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap': { statements: 698, digest: '3aef50bad44d771ff0889785ed3f341b513fe3f58e3aed06c4393e60812de640' },
      'Z_BUSINESS_PARTNER_SYNC.txt': { statements: 56, digest: '6106ee1deb8327c849b3455ab919eb8a69f24658961805fd8894aac7fe48b657' },
      'Z_EMPLOYEE_EXPENSE_VAL.txt': { statements: 55, digest: 'a5a713c52094aca21e4ce1ed1ab2c84726c6f6a23df20bb9462c8608091ac7ae' },
      'Z_INVOICE_EXTRACTOR.txt': { statements: 31, digest: '24dc545fef3689becfd96b5fef8ac7ff209fead0b2f4acc202b7789200d8fef7' },
      'Z_MATERIAL_STOCK_CALC.txt': { statements: 45, digest: 'e3f59263b3cd2a7ccb0989b5bbf6f58f58c66bba2d1d6ef0d497316d2aba833f' },
      'Z_MM_PO_APPROVAL.abap': { statements: 388, digest: 'b56c29b4d23f16a84aec1903a3c6c546120bdb6686a40055625192e7eb441d2b' },
      'Z_ORDER_INTEGRITY_CHECK.txt': { statements: 53, digest: '5c3daf720abb2939bfebcd5c06691226682dbea054cbfb703aae598818e6f9e9' },
      'Z_SALES_ORDER_CREATOR.txt': { statements: 38, digest: '6f54c75c3851fcbfa64435d14ce3b90bc74bb164c7103568268adbeb7560ee1e' },
    };
    for (const [name, expected] of Object.entries(pinned)) {
      const statements = tokenize(read(name));
      expect(statements, `${name}: a different number of statements`).toHaveLength(expected.statements);
      expect(sha(statements), `${name}: the same count, different text or lines`).toBe(expected.digest);
    }
  });

  test('and the class declarations read off them are the same too', () => {
    // The two sources in this repository that actually declare a class: the
    // hashes above would be satisfied by an empty answer everywhere else.
    const order = read('Z_ORDER_INTEGRITY_CHECK.txt');
    expect(sha(parseDeclarations(order, 'Z_ORDER_INTEGRITY_CHECK.txt')))
      .toBe('df9fadcd1831dd50cf58776e21ebe21dbaabc93c59891f8de3b9267f0c38a6c0');

    const klass = readFileSync(join(process.cwd(), 'tests/korpus/cases/CC-060/zcl_customer_api.clas.abap'), 'utf8');
    expect(tokenize(klass)).toHaveLength(12);
    expect(sha(parseDeclarations(klass, 'zcl_customer_api.clas.abap')))
      .toBe('50ba5bc586e1a39af3b190c2ecf2d047fdc980f543d85af6b23d8778f604e750');
  });
});
