import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  SHIPPED_EXAMPLES,
  readExample,
  secondOpinion,
  secondOpinionOnShippedExamples,
  agreementCounts,
  abaplintVersion,
  disagreementId,
  type Disagreement,
  type AgreementCounts,
} from './helpers/abaplint-second-opinion';
import { readStatements } from '../lib/abap/statement-reader';
import { readControlFlow } from '../lib/abap/control-flow';

/**
 * A second, independent reading of the ABAP this product ships.
 *
 * Everything the engine claims about ABAP was checked against our own reading of
 * ABAP. More cases written by the same hand raise coverage, not independence: a
 * misreading shared by the parser and by the tests survives every one of them,
 * and two shipped defects proved it — an indented `*` swallowed the price
 * tolerance `IF` of `Z_MM_PO_APPROVAL.abap`, and a period inside a decimal
 * truncated a condition. Both passed the whole suite.
 *
 * `@abaplint/core` is an ABAP parser written by people who are not us. Where it
 * and `lib/abap/` disagree, one of them is wrong, and that is evidence no
 * further test of ours can produce. It found four more defects of the same
 * class, all of them one root cause: `|…|` string templates were understood by
 * the statement scanner and by none of the three helpers around it.
 *
 * **This spec is a ratchet, not a wall.** It does not demand agreement. It pins
 * the disagreements that exist, each with a verdict and a reason, and fails when
 * a new one appears, when a recorded one changes, or when one is resolved
 * without being struck off. A spec demanding zero disagreements on day one gets
 * deleted the first time someone meets a defensible difference; a spec that pins
 * the known set makes every future drift visible.
 *
 * **abaplint is a second opinion, not the truth.** Three of the recorded
 * differences are deliberate: our reader is charitable towards source a compiler
 * would reject, because it reads what users upload rather than what SAP
 * accepted. The baseline says which is which, and why.
 */
interface Baseline {
  abaplintVersion: string;
  agreement: AgreementCounts[];
  disagreements: Array<Disagreement & { verdict: string; reason: string }>;
}

const BASELINE: Baseline = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/helpers/abaplint-baseline.json'), 'utf8'),
) as Baseline;

/** One reading of every shipped example, shared by every test below. */
const LIVE = secondOpinionOnShippedExamples();
const LIVE_BY_ID = new Map(LIVE.map((d) => [disagreementId(d), d]));
const BASE_BY_ID = new Map(BASELINE.disagreements.map((d) => [disagreementId(d), d]));

const describe = (d: Disagreement) =>
  `  ${d.file}:${d.line} [${d.area}] ${d.key}\n` +
  `      source   : ${d.source}\n` +
  `      ours     : ${d.ours}\n` +
  `      abaplint : ${d.abaplint}`;

test.describe('the second opinion is actually taken', () => {
  test('abaplint reads all eight shipped examples as ABAP programs', () => {
    // A harness that silently parses nothing reports no disagreements, and so
    // does one that works. This is the difference between the two.
    for (const name of SHIPPED_EXAMPLES) {
      const counts = agreementCounts(name, readExample(name));
      expect(counts.statementsAbaplint, `${name}: abaplint produced no statements`).toBeGreaterThan(40);
      expect(counts.statementsOurs, `${name}: our reader produced no statements`).toBeGreaterThan(40);
    }
    expect(SHIPPED_EXAMPLES).toHaveLength(8);
  });

  test('the baseline was recorded against the abaplint that is installed', () => {
    // A finding is a finding of one reading by one version. When the version
    // moves, the findings are re-read rather than assumed to still hold.
    expect(
      abaplintVersion(),
      'abaplint was upgraded — re-read the findings before trusting this baseline',
    ).toBe(BASELINE.abaplintVersion);
  });
});

test.describe('what the two readings agree on', () => {
  test('statement, branch, subroutine and call counts, per file, both sides', () => {
    const live = SHIPPED_EXAMPLES.map((name) => agreementCounts(name, readExample(name)));
    expect(live).toEqual(BASELINE.agreement);
  });

  test('abaplint confirms the branch and call counts the engine specs pin', () => {
    // `abap-control-flow.spec.ts` pins 86 IF + 2 CASE for the legacy program and
    // 40 + 1 for the purchasing one. Those numbers were ours alone until now.
    const legacy = agreementCounts(
      'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap',
      readExample('ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap'),
    );
    expect(legacy.branchesOurs).toBe(88);
    expect(legacy.branchesAbaplint).toBe(88);
    expect(legacy.formsOurs).toBe(42);
    expect(legacy.formsAbaplint).toBe(42);
    expect(legacy.performsOurs).toBe(50);
    expect(legacy.performsAbaplint).toBe(50);

    const po = agreementCounts('Z_MM_PO_APPROVAL.abap', readExample('Z_MM_PO_APPROVAL.abap'));
    expect(po.branchesOurs).toBe(41);
    expect(po.branchesAbaplint).toBe(41);
    expect(po.statementsOurs).toBe(444);
    expect(po.statementsAbaplint).toBe(444);
    expect(po.formsOurs).toBe(35);
    expect(po.formsAbaplint).toBe(35);
    expect(po.performsOurs).toBe(34);
    expect(po.performsAbaplint).toBe(34);
  });

  test('not one branch, FORM or PERFORM in the eight files is read differently', () => {
    // The disagreements that exist are all about statement boundaries and about
    // lines abaplint refuses. Where a gateway or a call would be drawn, the two
    // engines agree on every line of every shipped example.
    const structural = LIVE.filter((d) => d.area === 'branch' || d.area === 'subroutine');
    expect(structural.map(describe).join('\n'), 'a branch or call is now read differently').toEqual('');
  });
});

test.describe('the ratchet', () => {
  test('no disagreement appeared that is not recorded', () => {
    const added = LIVE.filter((d) => !BASE_BY_ID.has(disagreementId(d)));
    expect(
      added.map(describe).join('\n'),
      'abaplint and lib/abap now disagree about something new. Decide which side is '
        + 'wrong, fix ours only if you can show it on the source line, and record the '
        + 'rest in tests/helpers/abaplint-baseline.json with a verdict and a reason.',
    ).toEqual('');
  });

  test('no recorded disagreement changed shape in silence', () => {
    const changed: string[] = [];
    for (const live of LIVE) {
      const recorded = BASE_BY_ID.get(disagreementId(live));
      if (!recorded) continue;
      if (recorded.ours === live.ours && recorded.abaplint === live.abaplint && recorded.source === live.source) continue;
      changed.push(
        `  ${disagreementId(live)}\n`
        + `      was  ours=${recorded.ours} | abaplint=${recorded.abaplint}\n`
        + `      now  ours=${live.ours} | abaplint=${live.abaplint}`,
      );
    }
    expect(
      changed.join('\n'),
      'a recorded disagreement is still there but says something else. The reason on '
        + 'file describes the old shape and may no longer be true.',
    ).toEqual('');
  });

  test('no recorded disagreement was resolved without being struck off', () => {
    const resolved = BASELINE.disagreements.filter((d) => !LIVE_BY_ID.has(disagreementId(d)));
    expect(
      resolved.map((d) => `  ${disagreementId(d)} — recorded as ${d.verdict}`).join('\n'),
      'good news, and it has to be written down: these disagreements are gone. Remove '
        + 'them from tests/helpers/abaplint-baseline.json so the next one is visible.',
    ).toEqual('');
  });

  test('every recorded disagreement carries a verdict and a reason of substance', () => {
    // A baseline whose entries say nothing is an allowlist, and an allowlist is
    // how a finding becomes a fact of life.
    expect(BASELINE.disagreements.length).toBeGreaterThan(0);
    for (const entry of BASELINE.disagreements) {
      expect(['ours-right', 'abaplint-right', 'both-defensible'], `${disagreementId(entry)}`)
        .toContain(entry.verdict);
      expect(entry.reason.length, `${disagreementId(entry)} has no reason worth the name`)
        .toBeGreaterThan(80);
    }
    // Nothing is recorded as our bug: a disagreement we believe we are wrong
    // about is a fix, not a baseline entry.
    expect(
      BASELINE.disagreements.filter((d) => d.verdict === 'ours-right').map(disagreementId),
      'recorded as ours-right — then abaplint has a bug worth reporting upstream, say so in the reason',
    ).toEqual([]);
  });
});

/**
 * What the second opinion found in our reading of ABAP, and what it did not.
 *
 * `|…|` is a literal like `'…'` and `` `…` ``. The scanner in `readStatements`
 * knew that; `stripInlineComment`, `chainColon` and `topLevelCommas` each kept
 * their own copy of the rule and none of the three had learned it. The four
 * cases below are what that cost, each one abaplint reading the line correctly
 * while we did not. The rule now lives once, in `createLiteralScanner`.
 */
test.describe('the four defects abaplint found in the statement reader', () => {
  const agreesCompletely = (label: string, lines: string[]) => {
    const source = lines.join('\n') + '\n';
    expect(secondOpinion(label, source).map(describe).join('\n'), label).toEqual('');
    return source;
  };

  test('a colon inside a string template is not a chain operator', () => {
    // Read as a chain, the statement was split at the colon and the colon was
    // dropped from the text: `lv = |Status { 5 }|`, which is not the source.
    const source = agreesCompletely('template-colon', [
      'REPORT z.',
      'DATA lv TYPE string.',
      'lv = |Status: { 5 }|.',
      'WRITE lv.',
    ]);
    const statement = readStatements(source)[2];
    expect(statement.text).toBe('lv = |Status: { 5 }|');
    expect(statement.fromChain).toBe(false);
  });

  test('a comma inside a string template does not split one statement into two', () => {
    // `lv = |a: b, c|.` became two statements, `lv = |a b` and `lv = |a c|`,
    // neither of which stands anywhere in the source.
    const source = agreesCompletely('template-comma', [
      'REPORT z.',
      'DATA lv TYPE string.',
      'lv = |a: b, c|.',
      'WRITE lv.',
    ]);
    const statements = readStatements(source);
    expect(statements).toHaveLength(4);
    expect(statements[2].text).toBe('lv = |a: b, c|');
  });

  test('an IF whose condition holds a templated colon keeps its gateway', () => {
    // The worst of the four: the split marked the IF `fromChain`, and
    // `control-flow.ts` refuses to draw a chained branch. The gateway vanished
    // from the diagram and `notHandled` blamed a chain that was never written.
    const source = agreesCompletely('template-colon-in-if', [
      'REPORT z.',
      'DATA lv TYPE string.',
      'IF lv = |Status: ok|.',
      '  WRITE lv.',
      'ENDIF.',
    ]);
    const flow = readControlFlow(source);
    expect(flow.notHandled).toEqual([]);
    expect(flow.branches).toHaveLength(1);
    expect(flow.branches[0].arms[0].condition).toBe('lv = |Status: ok|');
  });

  test('a double quote inside a string template does not open a comment', () => {
    // The `"` ended the line at `lv = |say`, so the template never closed, and
    // the statement below it was swallowed into the same one: `lv = |say WRITE lv`.
    const source = agreesCompletely('template-double-quote', [
      'REPORT z.',
      'DATA lv TYPE string.',
      'lv = |say "hi" now|.',
      'WRITE lv.',
    ]);
    const statements = readStatements(source);
    expect(statements).toHaveLength(4);
    expect(statements[2].text).toBe('lv = |say "hi" now|');
    expect(statements[3].text).toBe('WRITE lv');
  });

  test('the constructs around them are read the same way by both engines', () => {
    // The fix touched the scanner every statement goes through. These are the
    // neighbours of the four cases above: each one agrees completely.
    agreesCompletely('nested-template', ['REPORT z.', 'DATA lv TYPE string.', 'lv = |a { |b.c| } d.|.', 'WRITE lv.']);
    agreesCompletely('quote-in-literal', ['REPORT z.', "WRITE 'say \"hi\".'.", 'WRITE 1.']);
    agreesCompletely('escaped-quote', ['REPORT z.', "WRITE 'it''s.'.", 'WRITE 1.']);
    agreesCompletely('backtick-with-quote', ['REPORT z.', 'DATA lv TYPE string.', 'lv = `say "hi" now`.', 'WRITE lv.']);
    agreesCompletely('chain-colon-not-first', ['REPORT z.', 'DATA: a TYPE i, b TYPE i.', 'WRITE: / a, / b.']);
    agreesCompletely('chain-perform', ['REPORT z.', 'PERFORM: read, check.', 'FORM read.', 'ENDFORM.', 'FORM check.', 'ENDFORM.']);
    agreesCompletely('indented-star-continuation', [
      'REPORT z.',
      'DATA: p TYPE p DECIMALS 2, r TYPE p DECIMALS 2, d TYPE p DECIMALS 2.',
      'd = ( p - r )',
      '  * 100 / r.',
      'IF d > 5.',
      '  WRITE d.',
      'ENDIF.',
    ]);
    agreesCompletely('case-type-of', [
      'REPORT z.',
      'DATA lo TYPE REF TO object.',
      'CASE TYPE OF lo.',
      '  WHEN TYPE cl_abap_typedescr.',
      '    WRITE 1.',
      '  WHEN OTHERS.',
      '    WRITE 2.',
      'ENDCASE.',
    ]);
    agreesCompletely('multi-line-condition', [
      'REPORT z.',
      'DATA: a TYPE i, b TYPE i, c TYPE i.',
      'IF a = 1',
      '   AND b = 2',
      '   AND c = 3.',
      '  WRITE a.',
      'ENDIF.',
    ]);
  });
});

/**
 * Where the two engines genuinely model ABAP differently.
 *
 * Recorded rather than chased. Each of these is a place abaplint is stricter
 * than this product needs, or reads something this engine deliberately does not.
 * They are asserted so that closing one is a decision somebody takes, and so
 * that the reason on file cannot quietly stop being true.
 */
test.describe('the differences that are not defects', () => {
  const keysOf = (label: string, lines: string[]) =>
    secondOpinion(label, lines.join('\n') + '\n').map((d) => `${d.area}:${d.key}`).sort();

  test('an unquoted decimal literal: abaplint ends the statement, we read the number', () => {
    // abaplint is right about the language. ABAP numeric literals are integers;
    // a decimal value is written `'0.5'`, and `IF lv > 0.5.` is a syntax error
    // that a real system reads as `IF lv > 0.` followed by `5.`. Our reader
    // joins it back together on purpose, because the alternative is to hand a
    // gateway the condition `lv > 0`. It fires only on source that cannot
    // compile, and on none of the eight shipped examples — there is not one
    // unquoted decimal among them. Left as it stands; the operator decides.
    expect(keysOf('decimal-literal', [
      'REPORT z.',
      'DATA lv TYPE p DECIMALS 2.',
      'lv = 12.50.',
      'IF lv > 0.5.',
      '  WRITE lv.',
      'ENDIF.',
    ])).toEqual([
      'parse:unknown@L3',
      'parse:unknown@L4',
      'statement:L3-3',
      'statement:L4-4',
    ]);

    // The quoted form every compiling program uses is read identically by both.
    expect(keysOf('decimal-literal-quoted', [
      'REPORT z.',
      'DATA lv TYPE p DECIMALS 2.',
      "lv = '12.50'.",
      "IF lv > '0.5'.",
      '  WRITE lv.',
      'ENDIF.',
    ])).toEqual([]);
  });

  test('native SQL: abaplint gives ENDEXEC its own statement, we do not', () => {
    // Between `EXEC SQL.` and `ENDEXEC.` there are no ABAP periods, so our
    // reader finds no boundary until `ENDEXEC.` supplies one and returns a
    // single statement for both lines. abaplint models it better. Nothing reads
    // a branch, a call or a database write out of a native-SQL statement, and
    // the `nativeSql` flag still bounds the region, so the cost is an anchor
    // nobody asks for. Not changed.
    expect(keysOf('exec-sql', [
      'REPORT z.',
      'DATA lv TYPE i.',
      'EXEC SQL.',
      '  SELECT COUNT(*) INTO :lv FROM vbak',
      'ENDEXEC.',
      'IF lv > 0.',
      '  WRITE lv.',
      'ENDIF.',
    ])).toEqual(['statement:L4-4', 'statement:L4-5', 'statement:L5-5']);
  });

  test('macros: abaplint expands the body at the call site, we report it unhandled', () => {
    // The compiler expands a macro wherever it is used. abaplint does the same
    // and finds an `IF` at the call site; our reader does not expand, and says
    // so — `control-flow.ts` reports the branch in the body under `notHandled`
    // with reason `macro-body` rather than drawing a gateway at a place the
    // code does not run. Honest, and less capable. Expansion is a feature, not
    // a fix, and nothing in the eight shipped examples needs it.
    expect(keysOf('define-macro', [
      'REPORT z.',
      'DEFINE mac.',
      '  IF 1 = 1.',
      '    WRITE 1.',
      '  ENDIF.',
      'END-OF-DEFINITION.',
      'mac.',
    ])).toEqual(['branch:if@L3', 'branch:if@L7', 'statement:L7-7']);
  });
});
