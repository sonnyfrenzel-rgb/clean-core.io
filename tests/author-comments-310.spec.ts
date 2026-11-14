import { expect, test } from './helpers/test';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { buildExportModel } from '../lib/bpmn/model';
import { buildBpmnExport, businessLevelOf } from '../lib/bpmn/export';
import { ENGINE_READS_310_FROM } from '../lib/abap/engine-reads-310-gate';
import { AUTHOR_COMMENT_LABEL, authorCommentsOf } from '../lib/abap/author-comments';
import { namingFactsOf } from '../lib/naming-facts';

/**
 * The author's comment as a tagged source of meaning (concept "Business-Lesbarkeit" H4, owner decision E2):
 * `lib/abap/author-comments.ts`. Minimal programs written for this spec; none is taken from the process benchmark.
 */

const NEW = ENGINE_READS_310_FROM;
const OLD = '3.0.21';

const SRC = [
  'REPORT zt_comment.',
  'DATA ls_t180 TYPE t180.',
  'DATA lt_vbap TYPE STANDARD TABLE OF vbap.',
  'START-OF-SELECTION.',
  "  CHECK ls_t180-trtyp = 'V'.  \" nur Aendern (VL02N)",
  '* Positionen fuer die Gefahrgutermittlung',
  '  SELECT * FROM vbap INTO TABLE lt_vbap.',
  "* SELECT * FROM vbak INTO TABLE lt_vbak.",
  '  PERFORM check_items.',
  '*&---------------------------------------------------------------------*',
  '*& Form CHECK_ITEMS',
  '*&---------------------------------------------------------------------*',
  'FORM check_items.',
  "  WRITE / 'x'.  \" Begin of change 4711",
  'ENDFORM.',
].join('\n');

function modelOf(engine: string) {
  const skeleton = buildProcessSkeleton(SRC, { engineVersion: engine });
  return buildExportModel(skeleton, businessLevelOf(skeleton, SRC, engine)).containers.flatMap((c) => c.nodes);
}

test('a comment beside a check or above a statement is quoted word for word, tagged, with its line — never as the label', () => {
  const nodes = modelOf(NEW);
  const check = nodes.find((n) => n.tag === 'exclusiveGateway')!;
  expect(check.name).toBe('Processing mode V (change)?');
  expect(check.comment).toBe(`${AUTHOR_COMMENT_LABEL} (line 5): “nur Aendern (VL02N)”`);
  const read = nodes.find((n) => /^Read /.test(n.name))!;
  expect(read.comment).toBe(`${AUTHOR_COMMENT_LABEL} (line 6): “Positionen fuer die Gefahrgutermittlung”`);
  expect(nodes.every((n) => !n.name.includes('Gefahrgut') && !n.name.includes('Aendern'))).toBe(true);
  const xml = buildBpmnExport(buildProcessSkeleton(SRC, { engineVersion: NEW }), { processName: 't', sourceFileName: 't.abap', source: SRC, names: 'plain', exporterVersion: NEW }).xml;
  expect(xml).toContain(`${AUTHOR_COMMENT_LABEL} (line 5): “nur Aendern (VL02N)”`);
});

test('an escaped pipe inside a string template does not end it: a quote in the template is text, not a comment', () => {
  const at = authorCommentsOf('  WRITE |The \\| marker "only text" here|.  " the real comment here\n');
  expect(at.at(1)?.text).toBe('the real comment here');
  expect(authorCommentsOf('  WRITE |a \\\\| "  so the template ends before this comment\n').at(1)?.text).toBe('so the template ends before this comment');
});

test('an ampersand inside the comment is the author\'s word and stays; only the frame\'s edge signs go', () => {
  expect(authorCommentsOf('  x = 1.  " Sales & Distribution routing\n').at(1)?.text).toBe('Sales & Distribution routing');
  expect(authorCommentsOf('*& Pricing & Billing per item\n  x = 1.\n').at(2)?.text).toBe('Pricing & Billing per item');
});

test('commented-out code, the editor\'s routine frame and a change marker are not quoted', () => {
  const at = authorCommentsOf(SRC);
  // Above the PERFORM (line 9) stands commented-out code; above FORM (13) only the editor's frame; line 14 a change marker.
  expect(at.at(9)?.text ?? null).toBeNull();
  expect(at.at(13)?.text ?? null).toBeNull();
  expect(at.at(14)?.text ?? null).toBeNull();
  expect(authorCommentsOf('  x = 1.  " TODO remove this\n').at(1)).toBeNull();
  expect(authorCommentsOf('  x = 1.  " Test Mueller 2019 - bitte drinlassen\n').at(1)).toBeNull();
});

test('the naming stage gets the comment as a fact of its own kind; an engine before 3.1.0 quotes nothing', () => {
  const facts = [...namingFactsOf(buildProcessSkeleton(SRC), SRC).values()].flat();
  expect(facts.some((f) => f.kind === 'comment' && f.text.includes('nur Aendern (VL02N)'))).toBe(true);
  expect(modelOf(OLD).every((n) => n.comment === undefined)).toBe(true);
  const old = buildBpmnExport(buildProcessSkeleton(SRC, { engineVersion: OLD }), { processName: 't', sourceFileName: 't.abap', source: SRC, names: 'plain', exporterVersion: OLD }).xml;
  expect(old).not.toContain(AUTHOR_COMMENT_LABEL);
});
