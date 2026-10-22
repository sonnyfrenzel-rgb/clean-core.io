import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { findSapIdentifiers, sapCheckedNarrative } from '../lib/sap-reference-check';
import { purposeProposalOf } from '../lib/program-summary-check';
import { programSummaryFactsOf } from '../lib/program-summary-facts';
import { buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessDocument } from '../lib/process-document-build';
import { formatAnalysisToMarkdown } from '../lib/markdownFormatter';

/**
 * Roadmap 3.0.18 item 13 (QM-08, FI-F12; QM and FI reviews of 18.10.2026): SAP
 * identifiers in generated business analysis and standard-fit text pass the
 * check of `lib/sap-reference-check.ts`. Verified first: the reviews' 1FM
 * ("Discrete Manufacturing") and F2012 ("journal" app) are IDs this product
 * holds no SAP page for, and every export that already ran the check marks them
 * "not verified — check before use". The gap was text that never ran it: the
 * model's purpose of a program (Analyze "In short", the process document).
 * Now a sentence whose ID contradicts SAP's data is dropped with SAP's title
 * shown, and an unknown ID stays "to check".
 */

const ROOT = path.resolve(__dirname, '..');
const FILE = 'Z_SD_FREIGHT_RATE_CHECK.abap';
const SOURCE = fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', FILE), 'utf8').replace(/\r\n/g, '\n');
const NARRATIVE = JSON.stringify({
  asIsContext: 'It checks the freight rate of each delivery in the Fiori app F2358 (Process Collections Worklist) [L20]. It follows scope item 1FM [L21].',
});

test.describe('model SAP identifiers pass the check before a document shows them (3.0.18 item 13, QM-08 / FI-F12)', () => {
  test('the reviews\' IDs: held nowhere, so "not verified — check before use", never verified', () => {
    for (const text of ['Use scope item 1FM (Discrete Manufacturing).', 'Use the Fiori app F2012 (Manage Journal Entries).']) {
      const [c] = findSapIdentifiers(text);
      expect(c.status, text).toBe('unverified');
      expect(sapCheckedNarrative(text)).toContain(`${c.id} [not verified — check before use]`);
    }
  });

  test('a sentence whose SAP ID contradicts SAP is dropped, with SAP\'s title in its place; the rest keeps its marks', () => {
    const out = sapCheckedNarrative('The worklist runs in the Fiori app F2358 (Process Collections Worklist). It follows scope item 1FM. It uses BD9 (Sell from Stock).');
    expect(out).not.toContain('Process Collections Worklist');
    expect(out).toContain('[A model sentence naming F2358 was dropped — name does not match SAP\'s (SAP: F2358 is “Monitor Purchase Order Items”, SAP KBA 3696098).]');
    expect(out).toContain('It follows scope item 1FM [not verified — check before use].');
    expect(out).toMatch(/BD9 \[verified: SAP lists BD9 as “Sell from Stock”/);
  });

  test('the model\'s purpose of a program — Analyze "In short" and the process document — runs the check', () => {
    const facts = programSummaryFactsOf(SOURCE);
    const proposal = purposeProposalOf(NARRATIVE, facts);
    expect(proposal).not.toBeNull();
    expect(proposal).not.toContain('Process Collections Worklist');
    expect(proposal).toContain('SAP: F2358 is “Monitor Purchase Order Items”');
    expect(proposal).toContain('1FM [not verified — check before use]');

    const { bpmn, technical } = buildReadingExports(SOURCE, { processName: FILE, sourceFileName: FILE });
    const map = buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(SOURCE), null, 'no-key'), fileName: FILE });
    const doc = buildProcessDocument({ source: SOURCE, map, narrative: NARRATIVE });
    const text = doc.purpose.proposal?.text ?? '';
    expect(text).not.toContain('Process Collections Worklist');
    expect(text).toContain('SAP: F2358 is “Monitor Purchase Order Items”');
    expect(text).toContain('1FM [not verified — check before use]');
  });

  test('an older analysis\'s model standard fit is not exported at all (owner decision 22.10.2026)', () => {
    // The text this test used to check (a contradicted ID dropped from the
    // standard-fit section) has no section any more: the model's standard fit
    // is the guess at what cannot be measured, and it is shown nowhere.
    const md = formatAnalysisToMarkdown(JSON.stringify({
      projectTitle: 'Collections',
      summary: 'A report.',
      asIsContext: 'Reads open items.',
      standardFit: { potential: 'Medium', targetStandardProcess: 'Collections Management with F2358 (Process Collections Worklist)', rationale: 'Scope item 1FM covers it.' },
    }), { code: SOURCE });
    expect(md).not.toContain('Target Standard Process');
    expect(md).not.toContain('Process Collections Worklist');
    expect(md).not.toContain('1FM');
  });
});
