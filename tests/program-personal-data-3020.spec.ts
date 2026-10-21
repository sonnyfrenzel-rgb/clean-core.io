/**
 * Owner decision of 21.10.2026: personal data the original program itself
 * carries — an e-mail constant, a phone number, an IBAN — is masked in the
 * documentation and in the exports too, not only in model text
 * (`lib/sensitive-text.ts`). The code excerpt at its line anchor stays as
 * written in the app: the signed evidence is not touched.
 *
 * The 1,000-line example declares `c_mail_sender … VALUE 'batch-user@example.local'`.
 * Server-free: pure modules only.
 */
import { test, expect } from '@playwright/test';
import { buildAbapEvidence, type EvidenceFinding } from '../lib/abap/evidence-model';
import { buildAnalysisExportHtml } from '../lib/analysis-export';
import { levelDRegister, levelDRegisterMarkdown } from '../lib/level-d-register';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessMapModel } from '../lib/process-map';
import { buildProcessDocumentation } from '../lib/process-documentation-build';
import { buildProcessDocument } from '../lib/process-document-build';
import { isEngineDocumentation, processDocumentationToMarkdown, readStoredDocumentation } from '../lib/process-documentation';
import { screenProgramText } from '../lib/sensitive-text';
import type { Project } from '../lib/types';
import { readExample } from './helpers/starter-example-files';

const FILE = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const SOURCE = readExample(FILE);
const MAIL = 'batch-user@example.local';
const MASK = '[e-mail address removed]';

const evidence = () => buildAbapEvidence(SOURCE, FILE, 'private', undefined, 'v3.0.19');
const mailFinding = () => evidence().findings.find((f) => f.snippet.includes(MAIL))!;

test('the example carries the address, and the signed evidence keeps the excerpt as written', () => {
  expect(SOURCE).toContain(`VALUE '${MAIL}'`);
  // The excerpt at its line anchor is what the app shows: unchanged.
  expect(mailFinding()).toBeTruthy();
  expect(mailFinding().snippet).toContain(MAIL);
  expect(screenProgramText(mailFinding().snippet)).toContain(MASK);
  expect(screenProgramText(mailFinding().snippet)).not.toContain(MAIL);
});

test('the Analyze export masks the address in the code excerpt it quotes', () => {
  const html = buildAnalysisExportHtml({
    project: {
      id: 'p-1000',
      name: 'Order fulfilment audit',
      analysis: JSON.stringify({ projectTitle: 'P', summary: 'S', asIsContext: 'A', gaps: [], strategicNextSteps: [] }),
      analyzerVersion: 'v3.0.19',
    } as unknown as Project,
    routeReport: null,
    legacyCode: SOURCE,
    uploadedFileName: FILE,
    targetDeployment: 'private',
  })!;
  expect(html).toContain('Hardcoded Environmental Parameter');
  expect(html).not.toContain(MAIL);
  expect(html).toContain(MASK);
});

test('the level D register masks the program\'s personal data in "As written", on screen and in its file', () => {
  const f = mailFinding();
  const modification = { ...f, id: 'CC-900', kind: 'modification', title: 'Modification of SAP code' } as EvidenceFinding;
  const [entry] = levelDRegister([modification]);
  expect(entry.snippet).not.toContain(MAIL);
  expect(entry.snippet).toContain(MASK);
  const md = levelDRegisterMarkdown([entry], { projectName: 'P', date: '21 Oct 2026' });
  expect(md).not.toContain(MAIL);
});

test('the process documentation masks a literal the program carries, as built and as read back', () => {
  // The example's constant in a message the documentation quotes.
  const source = `REPORT zmail_demo.
PARAMETERS p_bukrs TYPE bukrs.
START-OF-SELECTION.
  IF p_bukrs IS INITIAL.
    MESSAGE 'Questions about this run go to ${MAIL}' TYPE 'E'.
  ENDIF.
  WRITE / p_bukrs.
`;
  const file = 'zmail_demo.abap';
  const bpmn = buildBpmnExportFromSource(source, { processName: file, sourceFileName: file });
  const map = buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(source), null), fileName: file });

  const engine = buildProcessDocumentation({ source, map });
  const description = buildProcessDocument({ source, map });
  const described = JSON.stringify(description);
  expect(described).not.toContain(MAIL);
  expect(described).toContain(MASK);
  expect(JSON.stringify(engine)).not.toContain(MAIL);
  expect(processDocumentationToMarkdown(engine)).not.toContain(MAIL);

  // A document stored before 3.0.20 carried the address: it is masked where it is read.
  const old = { ...engine, statements: [...engine.statements, { ...engine.statements[0], id: 'old-1', text: `Mails go to ${MAIL}.` }] };
  const stored = JSON.stringify(old);
  expect(isEngineDocumentation(stored)).toBe(true);
  const read = readStoredDocumentation(stored);
  expect(read.kind).toBe('engine');
  if (read.kind === 'engine') {
    expect(JSON.stringify(read.doc)).not.toContain(MAIL);
    expect(read.doc.statements.find((s) => s.id === 'old-1')!.text).toBe(`Mails go to ${MASK}.`);
  }
});
