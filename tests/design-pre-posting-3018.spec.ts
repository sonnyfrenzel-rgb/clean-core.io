import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { postCheckDesign, postingCallsOf, prePostingCheckOf, prePostingDecisionWords, prePostingPromptRule, rapDesignNames } from '../lib/design-post-checks';
import { formatDesignToMarkdown } from '../lib/markdownFormatter';

/**
 * Roadmap 3.0.18 item 13, FI-F01 (FI review of 18.10.2026): where the original posts an accounting document, the
 * design names one binding pre-posting check point as an architecture decision, with a channel matrix — the check
 * runs where every channel passes (the logic, immediately before the posting call), never in one channel only. Read
 * by the engine from the source, deterministic. Server-free; hand-written shapes, not the FI program.
 */

const POSTING = [
  'REPORT zfi_post_shape.',
  "PARAMETERS p_bukrs TYPE c LENGTH 4 DEFAULT '1000'.",
  'DATA: gs_header TYPE bapiache09,',
  '      gt_gl     TYPE STANDARD TABLE OF bapiacgl09,',
  '      gt_amount TYPE STANDARD TABLE OF bapiaccr09,',
  '      gt_return TYPE STANDARD TABLE OF bapiret2.',
  'START-OF-SELECTION.',
  '  PERFORM post_document.',
  'FORM post_document.',
  "  CALL FUNCTION 'BAPI_ACC_DOCUMENT_CHECK'",
  '    EXPORTING documentheader = gs_header',
  '    TABLES accountgl = gt_gl currencyamount = gt_amount return = gt_return.',
  "  READ TABLE gt_return TRANSPORTING NO FIELDS WITH KEY type = 'E'.",
  '  IF sy-subrc = 0.',
  "    MESSAGE 'The document does not pass the check' TYPE 'E'.",
  '  ENDIF.',
  "  CALL FUNCTION 'BAPI_ACC_DOCUMENT_POST'",
  '    EXPORTING documentheader = gs_header',
  '    TABLES accountgl = gt_gl currencyamount = gt_amount return = gt_return.',
  'ENDFORM.',
  '',
].join('\n');

/** The same, without the original's own check, and run in the background as well. */
const UNCHECKED = POSTING.replace(/  CALL FUNCTION 'BAPI_ACC_DOCUMENT_CHECK'\n[^\n]*\n[^\n]*\n/, '').replace('START-OF-SELECTION.', 'START-OF-SELECTION.\n  IF sy-batch = abap_true.\n    MESSAGE \'Background run\' TYPE \'S\'.\n  ENDIF.');

const RAP_DESIGN = {
  projectName: 'Journal posting',
  architectureOverview: { approachDescription: 'A RAP action.', nodeFramework: 'SAP RAP (RESTful Application Programming)', runtimePlatform: 'SAP S/4HANA Core (Developer Extensibility)' },
  nodeAppBlueprint: { projectStructure: [], apiEndpoints: [] },
  cloudServices: [],
  securityHardening: [],
  roadmap: [],
};

test('the posting calls and the original\'s own check before them, read from the source', () => {
  const read = postingCallsOf(POSTING)!;
  expect(read.postings).toEqual([{ fm: 'BAPI_ACC_DOCUMENT_POST', line: 17, routine: 'POST_DOCUMENT', checkedBy: { fm: 'BAPI_ACC_DOCUMENT_CHECK', line: 10 } }]);
  expect(read.otherChecks).toEqual([]);
  const bare = postingCallsOf(UNCHECKED)!;
  expect(UNCHECKED).not.toContain('BAPI_ACC_DOCUMENT_CHECK');
  expect(bare.postings[0]).toMatchObject({ fm: 'BAPI_ACC_DOCUMENT_POST', checkedBy: null });
  // No posting, no decision.
  expect(postingCallsOf("REPORT zx.\nWRITE 'x'.\n")).toBeNull();
  expect(prePostingCheckOf("REPORT zx.\nWRITE 'x'.\n", 'rap')).toBeNull();
  expect(prePostingPromptRule("REPORT zx.\nWRITE 'x'.\n", 'rap')).toBe('');
});

test('the check point is in the logic class before the access layer posts; every channel the package delivers reaches it', () => {
  const n = rapDesignNames('ZFI_POST_SHAPE');
  const p = prePostingCheckOf(POSTING, 'rap')!;
  expect(p.checkPoint).toContain(`${n.logic}, immediately before it calls ${n.accessInterface} to post (BAPI_ACC_DOCUMENT_POST)`);
  expect(p.channels.map((c) => c.channel)).toEqual(['Fiori app and OData API (the service binding)', 'Another ABAP caller of the logic']);
  for (const c of p.channels) expect(c.reaches).toBe(`${n.logic}->run( ), then the check point`);
  // A program that also runs in the background gets the job as a channel too.
  expect(prePostingCheckOf(UNCHECKED, 'rap')!.channels.map((c) => c.channel)).toContain('Application Job (unattended run)');
  const words = prePostingDecisionWords(p);
  expect(words[0]).toMatch(/^Architecture decision — a binding pre-posting check point: every posting runs the document check at /);
  expect(words[1]).toContain('BAPI_ACC_DOCUMENT_POST at L17 (POST_DOCUMENT): the original checks the document first with BAPI_ACC_DOCUMENT_CHECK at L10');
  expect(prePostingDecisionWords(prePostingCheckOf(UNCHECKED, 'rap')!)[1]).toContain('the original posts without a check call before it in the same routine');
  expect(prePostingPromptRule(POSTING, 'cap')).toMatch(/^PRE-POSTING CHECK: the original posts an accounting document \(BAPI_ACC_DOCUMENT_POST\)\. Name one binding pre-posting check point as an architecture decision/);
});

test('the design export states the decision with its channel matrix — on both routes, whatever the model wrote', () => {
  const post = postCheckDesign(RAP_DESIGN, POSTING);
  expect(post.prePosting).not.toBeNull();
  const md = formatDesignToMarkdown(JSON.stringify(RAP_DESIGN), { code: POSTING });
  const section = md.slice(md.indexOf('## Architecture Decision: Binding Pre-Posting Check Point'));
  expect(section).toContain('| Channel | Reaches the posting through |');
  expect(section).toContain('| Fiori app and OData API (the service binding) |');
  expect(section).toContain("not the model's proposal");
  const cap = formatDesignToMarkdown(JSON.stringify({ ...RAP_DESIGN, architectureOverview: { nodeFramework: 'SAP CAP (Node.js)', runtimePlatform: 'SAP BTP Cloud Foundry' } }), { code: POSTING });
  expect(cap).toContain("the service's process logic, immediately before the call that posts (BAPI_ACC_DOCUMENT_POST)");
  // A program that posts nothing has no such section.
  expect(formatDesignToMarkdown(JSON.stringify(RAP_DESIGN), { code: "REPORT zx.\nWRITE 'x'.\n" })).not.toContain('Pre-Posting Check Point');
});

test('the design prompt carries the rule on both routes', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'app', '(app)', 'project', '[projectId]', 'design', 'page.tsx'), 'utf8');
  expect(page).toContain("${prePostingPromptRule(designSource, 'rap')}");
  expect(page).toContain("${prePostingPromptRule(designSource, 'cap')}");
});
