import { test, expect } from '@playwright/test';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import {
  MAX_REVISION_XML,
  checkRevisionXml,
  diffProcessRevisions,
  readRevisionStats,
  revisionLine,
  type ProcessRevisionRecord,
  type ProcessRevisionSummary,
} from '../lib/process-revisions';
import {
  SAVE_REVISION_REFUSALS,
  revisionOutcomeSentence,
  type SaveRevisionOutcome,
} from '../lib/process-revisions-client';

/**
 * Roadmap 3.2 — the comparison of two revisions, with no server at all.
 *
 * The comparison is a pure function over two BPMN files, and it is tested that
 * way on purpose: what "changed" means must not depend on a browser, on a route
 * or on the order Firestore happened to return two documents in.
 *
 * The identity is the BPMN element id of roadmap 2.6. That is what makes the
 * difference between *"CHECK_BUDGET was renamed to Check budget"* and *"one step
 * disappeared and another appeared"*, and it is the one property this whole step
 * rests on — so it is asserted directly rather than implied.
 */

const NS = [
  'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"',
  'xmlns:cc="https://clean-core.io/schema/bpmn/reconstruction/1"',
].join(' ');

const trace = (attrs: string) => `<bpmn:extensionElements><cc:trace status="reconstructed" ${attrs}/></bpmn:extensionElements>`;

/** Revision 1 — five anchored flow nodes in one straight line with a decision. */
const BEFORE = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${NS} id="definitions" targetNamespace="https://clean-core.io/bpmn">
  <bpmn:process id="process" name="Requisition release" isExecutable="false">
    <bpmn:startEvent id="n1" name="Start">${trace('node="nd-1" kind="start" file="z.abap" lineStart="2" lineEnd="2"')}</bpmn:startEvent>
    <bpmn:task id="n2" name="CHECK_BUDGET">${trace('node="nd-2" kind="form" file="z.abap" lineStart="5" lineEnd="9"')}</bpmn:task>
    <bpmn:exclusiveGateway id="n3" name="IF budget ok">${trace('node="nd-3" kind="gateway" file="z.abap" lineStart="10" lineEnd="10"')}</bpmn:exclusiveGateway>
    <bpmn:task id="n4" name="POST_DOCUMENT">${trace('node="nd-4" kind="form" file="z.abap" lineStart="12" lineEnd="15"')}</bpmn:task>
    <bpmn:endEvent id="n5" name="End">${trace('node="nd-5" kind="end" file="z.abap" lineStart="18" lineEnd="18"')}</bpmn:endEvent>
    <bpmn:sequenceFlow id="f1" sourceRef="n1" targetRef="n2"/>
    <bpmn:sequenceFlow id="f2" sourceRef="n2" targetRef="n3"/>
    <bpmn:sequenceFlow id="f3" name="budget ok" sourceRef="n3" targetRef="n4"/>
    <bpmn:sequenceFlow id="f4" sourceRef="n4" targetRef="n5"/>
  </bpmn:process>
</bpmn:definitions>`;

/**
 * Revision 2 — the same model after somebody worked on it:
 * `n2` renamed, `n3` confirmed and rerouted, `n4` gone, `n6` drawn by hand.
 */
const AFTER = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${NS} id="definitions" targetNamespace="https://clean-core.io/bpmn">
  <bpmn:process id="process" name="Requisition release" isExecutable="false">
    <bpmn:startEvent id="n1" name="Start">${trace('node="nd-1" kind="start" file="z.abap" lineStart="2" lineEnd="2"')}</bpmn:startEvent>
    <bpmn:task id="n2" name="Check budget">${trace('node="nd-2" kind="form" file="z.abap" lineStart="5" lineEnd="9"')}</bpmn:task>
    <bpmn:exclusiveGateway id="n3" name="IF budget ok"><bpmn:extensionElements><cc:trace status="confirmed" node="nd-3" kind="gateway" file="z.abap" lineStart="10" lineEnd="10"/></bpmn:extensionElements></bpmn:exclusiveGateway>
    <bpmn:userTask id="n6" name="Approve by hand"><bpmn:extensionElements><cc:trace status="reconstructed" anchored="false" unanchoredReason="drawn by hand"/></bpmn:extensionElements></bpmn:userTask>
    <bpmn:endEvent id="n5" name="End">${trace('node="nd-5" kind="end" file="z.abap" lineStart="18" lineEnd="18"')}</bpmn:endEvent>
    <bpmn:sequenceFlow id="f1" sourceRef="n1" targetRef="n2"/>
    <bpmn:sequenceFlow id="f2" sourceRef="n2" targetRef="n3"/>
    <bpmn:sequenceFlow id="f3" name="budget within tolerance" sourceRef="n3" targetRef="n6"/>
    <bpmn:sequenceFlow id="f5" sourceRef="n6" targetRef="n5"/>
  </bpmn:process>
</bpmn:definitions>`;

const PROGRAM = [
  'REPORT z_revision_diff.',
  'START-OF-SELECTION.',
  '  PERFORM check_budget.',
  '  PERFORM post_document.',
  'FORM check_budget.',
  '  SELECT SINGLE * FROM eban INTO @DATA(ls_eban) WHERE banfn = @gv_banfn.',
  '  IF ls_eban-preis > 1000.',
  '    MESSAGE e001(zmm).',
  '  ENDIF.',
  'ENDFORM.',
  'FORM post_document.',
  "  UPDATE eban SET frgkz = 'X' WHERE banfn = gv_banfn.",
  'ENDFORM.',
].join('\n');

test.describe('what changed between two revisions', () => {
  test('an element is followed by its id, so a rename is a rename', () => {
    const diff = diffProcessRevisions({ revision: 1, xml: BEFORE }, { revision: 2, xml: AFTER });

    const renamed = diff.changed.find((c) => c.id === 'n2');
    expect(renamed, 'the renamed step was not reported as changed').toBeTruthy();
    expect(renamed?.fields).toEqual([
      { field: 'name', label: 'Name', before: 'CHECK_BUDGET', after: 'Check budget' },
    ]);
    // …and not as one gone and one new, which is what a comparison by label does.
    expect(diff.added.map((e) => e.id)).not.toContain('n2');
    expect(diff.removed.map((e) => e.id)).not.toContain('n2');
  });

  test('added, removed and unchanged are counted, not described', () => {
    const diff = diffProcessRevisions({ revision: 1, xml: BEFORE }, { revision: 2, xml: AFTER });

    expect(diff.added).toEqual([
      { id: 'n6', kind: 'User step', label: 'Approve by hand', anchor: null },
    ]);
    expect(diff.removed).toEqual([
      { id: 'n4', kind: 'Step', label: 'POST_DOCUMENT', anchor: 'lines 12 to 15' },
    ]);
    expect(diff.changed.map((c) => c.id).sort()).toEqual(['n2', 'n3']);
    expect(diff.unchanged, 'the start and the end were not left alone').toBe(2);
    expect(diff.identical).toBe(false);
    expect(diff.summary).toBe('1 element added, 1 removed, 2 changed, 2 unchanged.');
    expect(diff.from).toBe(1);
    expect(diff.to).toBe(2);
  });

  test('a status and a rerouted branch are both reported, on the element they belong to', () => {
    const diff = diffProcessRevisions({ revision: 1, xml: BEFORE }, { revision: 2, xml: AFTER });
    const gateway = diff.changed.find((c) => c.id === 'n3');

    expect(gateway?.kind).toBe('Decision');
    expect(gateway?.anchor).toBe('line 10');
    expect(gateway?.fields).toEqual([
      { field: 'status', label: 'Status', before: 'reconstructed', after: 'confirmed' },
      {
        field: 'flows',
        label: 'Outgoing flows',
        before: 'budget ok → POST_DOCUMENT',
        after: 'budget within tolerance → Approve by hand',
      },
    ]);
  });

  test('renaming a step is not reported a second time on the step that points at it', () => {
    // `n1` points at `n2`, and `n2` was renamed. The flow is the same flow.
    const diff = diffProcessRevisions({ revision: 1, xml: BEFORE }, { revision: 2, xml: AFTER });
    expect(diff.changed.map((c) => c.id)).not.toContain('n1');
  });

  test('the same file twice is no difference at all', () => {
    const diff = diffProcessRevisions({ revision: 1, xml: BEFORE }, { revision: 2, xml: BEFORE });
    expect(diff.identical).toBe(true);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
    expect(diff.unchanged).toBe(5);
    expect(diff.summary).toBe('No element differs between revision 1 and revision 2.');
  });

  test('and on what roadmap 2.6 actually writes', () => {
    const { xml } = buildBpmnExportFromSource(PROGRAM, {
      processName: 'Requisition release',
      sourceFileName: 'z_revision_diff.abap',
    });
    expect(diffProcessRevisions({ revision: 1, xml }, { revision: 2, xml }).identical).toBe(true);

    // One task renamed the way an editor renames it: the id stays, the name moves.
    const first = /<bpmn:task id="([^"]+)" name="([^"]+)"/.exec(xml);
    expect(first, 'the export drew no task to rename').toBeTruthy();
    const [match, id, name] = first as RegExpExecArray;
    const edited = xml.replace(match, `<bpmn:task id="${id}" name="Check the budget"`);

    const diff = diffProcessRevisions({ revision: 1, xml }, { revision: 2, xml: edited });
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].id).toBe(id);
    expect(diff.changed[0].fields).toEqual([
      { field: 'name', label: 'Name', before: name, after: 'Check the budget' },
    ]);
  });
});

test.describe('what a revision may hold', () => {
  test('flow nodes and anchors are counted out of the file', () => {
    expect(readRevisionStats(BEFORE)).toEqual({ flowNodes: 5, anchored: 5, unanchored: 0 });
    // The hand-drawn step has no line range, and is counted as what it is.
    expect(readRevisionStats(AFTER)).toEqual({ flowNodes: 5, anchored: 4, unanchored: 1 });
  });

  test('an empty body, something that is not BPMN and a model too large are each refused for their own reason', () => {
    expect(checkRevisionXml(undefined)).toMatchObject({ ok: false, code: 'bad-request' });
    expect(checkRevisionXml('   ')).toMatchObject({ ok: false, code: 'bad-request' });
    expect(checkRevisionXml({ xml: BEFORE })).toMatchObject({ ok: false, code: 'bad-request' });
    expect(checkRevisionXml('<html><body>not a process</body></html>')).toMatchObject({
      ok: false,
      code: 'not-bpmn',
    });
    const huge = `${BEFORE}${' '.repeat(MAX_REVISION_XML)}`;
    expect(checkRevisionXml(huge)).toMatchObject({ ok: false, code: 'too-large' });
  });

  test('and a BPMN file comes back with its digest and its counts', () => {
    const checked = checkRevisionXml(BEFORE);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(checked.stats).toEqual({ flowNodes: 5, anchored: 5, unanchored: 0 });
    // The same bytes give the same digest — this is what stops a save that
    // changed nothing from becoming a revision.
    expect(checkRevisionXml(BEFORE)).toMatchObject({ sha256: checked.sha256 });
  });
});

test('the line a revision carries says what it is, and never that it is right', () => {
  const summary: ProcessRevisionSummary = {
    formatVersion: 1,
    revision: 1,
    origin: 'reconstructed',
    account: { uid: 'u1', name: 'Sonny Frenzel', email: 'sonny@example.com' },
    savedAt: '2026-09-18T07:30:00.000Z',
    xmlSha256: 'a'.repeat(64),
    sourceSha256: 'b'.repeat(64),
    fileName: 'Z_MM_PO_APPROVAL.abap',
    runId: 'run-1',
    flowNodes: 5,
    anchored: 5,
    unanchored: 0,
  };
  expect(revisionLine(summary)).toBe('Revision 1 · reconstructed from Z_MM_PO_APPROVAL.abap');
  expect(revisionLine({ ...summary, revision: 2, origin: 'edited' })).toBe('Revision 2 · saved by Sonny Frenzel');
  for (const line of [revisionLine(summary), revisionLine({ ...summary, revision: 2, origin: 'edited' })]) {
    expect(line.toLowerCase()).not.toMatch(/verified|correct|approved|proven/);
  }
});

/**
 * The half of the seam that needs no server — roadmap 3.2, QA finding 54a73bb3bed2.
 *
 * The editor's footer prints whatever the adapter hands back. Before there was
 * an adapter this was moot; now it is the difference between a reader who knows
 * what happened and one who is shown `revision-moved` and a 409. So: every
 * refusal the store can answer with has a sentence of its own, and none of them
 * is the code or the server's own wording.
 */
test('every outcome of a save is a sentence a reader can act on', () => {
  const seen = new Set<string>();
  for (const code of SAVE_REVISION_REFUSALS) {
    const outcome: SaveRevisionOutcome = { ok: false, code, error: 'SERVER_SIDE_WORDING', status: 409, latest: 7 };
    const sentence = revisionOutcomeSentence(outcome);
    expect(typeof sentence, `${code} has no sentence`).toBe('string');
    expect(sentence.length, `${code} is too terse to act on`).toBeGreaterThan(40);
    expect(sentence, `${code} shows the raw code`).not.toContain(code);
    expect(sentence, `${code} passes the server's own wording through`).not.toContain('SERVER_SIDE_WORDING');
    expect(seen.has(sentence), `${code} repeats another refusal's sentence`).toBe(false);
    seen.add(sentence);
  }

  // The refusal the run check added has one of its own: a revision 1 that is not
  // bound to a verified run reaches the reader as a sentence, not as a 409.
  expect(SAVE_REVISION_REFUSALS).toContain('run-unverified');

  // The one refusal a reader can do something about names what to do and which
  // revision to open.
  const moved = revisionOutcomeSentence({ ok: false, code: 'revision-moved', error: 'x', status: 409, latest: 7 });
  expect(moved).toContain('revision 7');
  expect(moved).toContain('Nothing was overwritten');

  // And `created: false` is an outcome, not a failure — it does not read as one.
  const unchanged = revisionOutcomeSentence({
    ok: true,
    created: false,
    record: { ...summaryOfNothing, revision: 4 } as ProcessRevisionRecord,
  });
  expect(unchanged).toContain('revision 4');
  expect(unchanged.toLowerCase()).not.toContain('could not');
  expect(unchanged.toLowerCase()).not.toContain('failed');
});

/** Enough of a record to name a revision number; nothing here reads the rest. */
const summaryOfNothing = {
  formatVersion: 1,
  revision: 1,
  origin: 'edited' as const,
  account: { uid: 'u1', name: 'n', email: 'e' },
  savedAt: '2026-09-18T07:30:00.000Z',
  xmlSha256: 'a'.repeat(64),
  sourceSha256: 'b'.repeat(64),
  fileName: 'z.abap',
  runId: 'run-1',
  flowNodes: 1,
  anchored: 1,
  unanchored: 0,
  xml: '<bpmn:definitions/>',
};
