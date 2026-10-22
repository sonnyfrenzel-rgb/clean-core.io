import { test, expect } from '@playwright/test';
import { readProcess } from '../lib/first-look';
import { processStory, type ProcessStory } from '../lib/process-story';
import { programSummaryFactsOf, headerClaimOf } from '../lib/program-summary-facts';
import { businessInShort, businessJargon, programSummary } from '../lib/program-summary-text';
import { AUTHOR_CLAIM_LABEL, TITLE_HEADING, authorClaimOf } from '../lib/program-summary-check';
import { deriveBusinessRules } from '../lib/abap/business-rule-set';
import { explainBusinessRules } from '../lib/abap/business-rule-set-explain';
import { openingDecisions } from '../lib/first-look-plain';
import { readProgramDomain } from '../lib/abap/program-domain';
import { ENGINE_READS_3021_FROM, engineReads3021Apply } from '../lib/abap/engine-reads-3021-gate';
import { branchReadingOf, decisionArmsAt, messageOf, plainValues, rawFieldsOf } from '../lib/abap/branch-messages';
import { readExample } from './helpers/starter-example-files';

/**
 * Roadmap 3.0.21 — "First insights becomes the strongest page", the engine
 * half (owner decisions 22.10.2026). Every new reading stands behind
 * `ENGINE_READS_3021_FROM`: the same starter example read for 3.0.20 gives what
 * the owner saw, pinned here as "before"; read for 3.0.21 it gives the new
 * reading. Server-free: the engine only.
 *
 *   1. a check on a raw dictionary field is said by the program's own text on
 *      that branch, or left out of the business line and counted;
 *   2. the purpose the names support is wider and stands whenever it exists;
 *   3. the header's title line is the author's claim;
 *   4. loops and set-up are no steps of the story;
 *   5. a stop is said once, without its message code;
 *   6. "What it decides" reads the same basket the basket line counts.
 */

const BEFORE = '3.0.20';
const AFTER = '3.0.21';

const PO = readExample('Z_MM_PO_APPROVAL.abap');
const FREIGHT = readExample('Z_SD_FREIGHT_RATE_CHECK.abap');
const DELIVERY = readExample('Z_SD_DELIVERY_PRIORITY.abap');
const LEGACY = readExample('ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');

function storyOf(source: string, version: string): ProcessStory {
  return processStory(readProcess(source).skeleton, source, null, version);
}
const allChecks = (s: ProcessStory) => s.steps.flatMap((step) => step.checks);
const allStops = (s: ProcessStory) => s.steps.flatMap((step) => step.stops);

function inShortOf(source: string, version: string): string[] {
  const process = readProcess(source);
  const facts = programSummaryFactsOf(source, { skeleton: process.skeleton, ruleSet: deriveBusinessRules(source, version), engineVersion: version });
  return businessInShort(programSummary(facts), { codes: false }).map((l) => l.text);
}

function claimOf(source: string, version: string) {
  return authorClaimOf(programSummaryFactsOf(source, { engineVersion: version }));
}

test.describe('the gate', () => {
  test('3.0.21 and later carry the readings; 3.0.20, or no version, does not', () => {
    expect(ENGINE_READS_3021_FROM).toBe('3.0.21');
    expect(engineReads3021Apply('v3.0.21')).toBe(true);
    expect(engineReads3021Apply('3.0.22')).toBe(true);
    expect(engineReads3021Apply('v3.0.20')).toBe(false);
    expect(engineReads3021Apply(null)).toBe(false);
    expect(engineReads3021Apply(undefined)).toBe(false);
  });
});

test.describe('1. a raw field check in the program\'s own words', () => {
  test('PO approval: "Mmsta 01 or Z9" becomes the message on its branch; 3.0.20 keeps the field name', () => {
    expect(allChecks(storyOf(PO, BEFORE))).toContain('Mmsta 01 or Z9');
    const after = storyOf(PO, AFTER);
    expect(allChecks(after)).toContain('Material is blocked for purchasing in this plant');
    expect(allChecks(after).join(' · ')).not.toMatch(/mmsta/i);
    // A code value is said as its words: "Role DEPT_HEAD" → "Role dept head".
    expect(allChecks(after)).toContain('Role dept head');
    expect(allChecks(after).join(' · ')).not.toMatch(/DEPT_HEAD/);
  });

  test('freight: a weight unit, a volume unit and a shipping condition with no text of their own are counted, never named', () => {
    const before = storyOf(FREIGHT, BEFORE);
    expect(allChecks(before)).toEqual(expect.arrayContaining(['Vsbed 01', 'Gewei', 'Voleh']));
    expect(before.steps.every((s) => s.unsaid === undefined)).toBe(true);
    const after = storyOf(FREIGHT, AFTER);
    expect(allChecks(after).join(' · ')).not.toMatch(/vsbed|gewei|voleh/i);
    const check = after.steps.find((s) => s.text === 'Check deliveries');
    expect(check?.unsaid).toBe(3);
    // The step keeps its anchor, and the checks the code words still stand.
    expect(check?.anchor).toBe('L79');
    expect(check?.checks).toEqual(expect.arrayContaining(['Country', 'Quote currency not EUR']));
  });

  test('legacy: an ELSEIF arm on the user type is said by the note it writes', () => {
    expect(allChecks(storyOf(LEGACY, BEFORE))).toContain('Ustyp B or C');
    const after = allChecks(storyOf(LEGACY, AFTER));
    expect(after).toContain('Created by a system user');
    expect(after.join(' · ')).not.toMatch(/ustyp/i);
  });

  test('the reader: arms, messages and raw fields', () => {
    const r = branchReadingOf(PO);
    const arms = decisionArmsAt(r, 277);
    expect(arms?.[0]?.message).toBe('Material is blocked for purchasing in this plant');
    expect(rawFieldsOf(arms?.[0]?.condition ?? null, r)).toContain('mmsta');
    // A field the glossary words is not raw.
    expect(rawFieldsOf("gs_eban-frgkz = 'X'", r)).toEqual([]);
    expect(messageOf("MESSAGE e002 WITH 'No authorization for purchasing group' lv_ekgrp.")).toBe('No authorization for purchasing group');
    expect(messageOf("PERFORM reject USING 'Material missing on the requisition'.")).toBe('Material missing on the requisition');
    expect(messageOf("ls_result-reason = 'Quote is not in the company currency'.")).toBe('Quote is not in the company currency');
    expect(messageOf("CONCATENATE cv_note 'created by a system user' INTO cv_note SEPARATED BY space.")).toBe('created by a system user');
    // A code or a value is no message; nor is a literal set into a field that is not a note.
    expect(messageOf("PERFORM request_approval USING gv_approver 'DEPT_HEAD'.")).toBeNull();
    expect(messageOf("cs_result-service = 'Express service'.")).toBeNull();
    expect(plainValues('Status INPUT_REJECTED')).toBe('Status input rejected');
  });
});

test.describe('2. the purpose the names support', () => {
  test('approval and priority give a purpose from 3.0.21; the reader stays narrow by default', () => {
    expect(readProgramDomain(PO)).toBeNull();
    expect(readProgramDomain(DELIVERY)).toBeNull();
    expect(readProgramDomain(PO, { wider: true })?.text).toBe('Covers the approval of purchase orders and purchase requisitions.');
    expect(readProgramDomain(DELIVERY, { wider: true })?.text).toBe('Covers the priority of deliveries and sales orders.');
    expect(readProgramDomain('REPORT z_invoice_extractor.\nSELECT * FROM vbrk INTO TABLE lt.\nSELECT * FROM vbrp INTO TABLE lt2.\n', { wider: true })?.text)
      .toBe('Extracts invoices and billing documents.');
  });

  test('freight and legacy open with the purpose their names support, which 3.0.20 hid behind the tables they read', () => {
    expect(inShortOf(FREIGHT, BEFORE)[0]).toMatch(/^Records entries in a custom table in SAP/);
    expect(inShortOf(FREIGHT, AFTER)[0]).toBe('Checks freight costs, deliveries and materials, within a tolerance.');
    expect(inShortOf(FREIGHT, AFTER)[1]).toMatch(/^Records entries in a custom table in SAP/);
    expect(inShortOf(LEGACY, BEFORE)[0]).toMatch(/^Changes sales orders in SAP/);
    expect(inShortOf(LEGACY, AFTER)[0]).toBe('Audits customers, sales orders and stock.');
  });

  test('the new purpose lines hold the jargon guard of the Business view', () => {
    for (const source of [PO, FREIGHT, DELIVERY, LEGACY]) {
      for (const line of inShortOf(source, AFTER)) expect(businessJargon(line), line).toEqual([]);
    }
  });

  test('PO approval and delivery priority get a purpose at all', () => {
    expect(inShortOf(PO, BEFORE)[0]).toMatch(/^Creates purchase orders/);
    expect(inShortOf(PO, AFTER)[0]).toBe('Covers the approval of purchase orders and purchase requisitions.');
    expect(inShortOf(DELIVERY, BEFORE)[0]).toMatch(/^A read-only report on sales orders/);
    expect(inShortOf(DELIVERY, AFTER)[0]).toBe('Covers the priority of deliveries and sales orders.');
  });
});

test.describe('3. the header title line as the author\'s claim', () => {
  test('PO approval: "*& Emergency purchase approval" under "*& Report Z_MM_PO_APPROVAL" — 3.0.20 read none', () => {
    expect(claimOf(PO, BEFORE)).toBeNull();
    expect(claimOf(PO, AFTER)).toEqual({ state: 'shown', heading: TITLE_HEADING, text: 'Emergency purchase approval', lineStart: 3, lineEnd: 3 });
    // It stays the author's claim: the tag every quoted header comment carries.
    expect(AUTHOR_CLAIM_LABEL).toBe("Author's claim");
  });

  test('delivery priority: the first line after REPORT; legacy: a line about testing is no title', () => {
    expect(claimOf(DELIVERY, AFTER)).toMatchObject({ state: 'shown', text: 'Delivery priority of open sales orders', lineStart: 3 });
    expect(claimOf(LEGACY, AFTER)).toBeNull();
  });

  test('freight: a title too short to show its language is not quoted, and not announced', () => {
    expect(programSummaryFactsOf(FREIGHT, { engineVersion: AFTER }).headerClaim?.text).toBe('Freight charge check before goods issue');
    expect(claimOf(FREIGHT, AFTER)).toBeNull();
  });

  test('template lines are passed over; a headed section still wins; without the option nothing changes', () => {
    const src = ['*&---------------------------------------------------------------------*', '*& Report ZFI_OPEN_ITEMS', '*& Author: J. Smith  12.03.2019', '*& Open items of customers by due date', '*&---*', 'REPORT zfi_open_items.', 'WRITE / 1.'].join('\n');
    expect(headerClaimOf(src)).toBeNull();
    expect(headerClaimOf(src, { titleLine: true })).toEqual({ heading: 'Title', text: 'Open items of customers by due date', lineStart: 4, lineEnd: 4 });
    const headed = `${src.replace('REPORT', '* Purpose: Lists the open items of customers by due date.\nREPORT')}`;
    expect(headerClaimOf(headed, { titleLine: true })?.heading).toBe('Purpose');
    // A title line never comes from below the first statement after REPORT.
    expect(headerClaimOf('REPORT zx.\nDATA lv TYPE i.\n* Something said later about the program\n', { titleLine: true })).toBeNull();
    // An example line ends the search.
    expect(headerClaimOf('* Example program for training\n* Customer credit limits\nREPORT zx.\n', { titleLine: true })).toBeNull();
  });
});

test.describe('4. loops and set-up are no steps', () => {
  test('delivery priority: "For each order" and "For each total" are gone; 3.0.20 shows them', () => {
    expect(storyOf(DELIVERY, BEFORE).steps.map((s) => s.text)).toEqual(['Read sales orders', 'For each order', 'Show the result list', 'For each total']);
    expect(storyOf(DELIVERY, AFTER).steps.map((s) => s.text)).toEqual(['Read sales orders', 'Show the result list']);
  });

  test('legacy: "Initialize run" is no step; what it checks rolls up into the step before it', () => {
    const before = storyOf(LEGACY, BEFORE);
    expect(before.steps[1].text).toBe('Initialize run, then select orders, then select items');
    const after = storyOf(LEGACY, AFTER);
    expect(after.steps.map((s) => s.text).join(' · ')).not.toMatch(/initiali[sz]e/i);
    expect(after.steps[1].text).toBe('Select orders, then select items');
    // Nothing counted is lost: the technical checks of the four steps are the same.
    const technical = (s: ProcessStory) => s.steps.reduce((n, step) => n + (step.technical ?? 0), 0);
    expect(technical(after)).toBe(technical(before));
  });
});

test.describe('5. a stop is said once, without its message code', () => {
  test('PO approval: "no purchase requisition found" stands at the first step only, and no "(E00n)"', () => {
    const before = storyOf(PO, BEFORE);
    expect(allStops(before).filter((s) => s === 'no purchase requisition found (E001)')).toHaveLength(2);
    const after = storyOf(PO, AFTER);
    expect(after.steps[0].stops).toEqual(['no purchase requisition found', 'not authorized']);
    expect(after.steps[1].stops).toEqual([]);
    expect(allStops(after).join(' · ')).not.toMatch(/\([A-Z]\d{3}\)/);
  });

  test('legacy: "not authorized (E001)" loses its code', () => {
    expect(allStops(storyOf(LEGACY, BEFORE))).toContain('not authorized (E001)');
    expect(allStops(storyOf(LEGACY, AFTER))).toContain('not authorized');
  });
});

test.describe('6. "What it decides" and the basket line read one classification', () => {
  const decides = (source: string, version: string) => {
    const process = readProcess(source);
    const ex = explainBusinessRules(source, deriveBusinessRules(source, version), process.facts, version);
    return { ex, d: openingDecisions(ex, 4, version) };
  };

  test('delivery priority: the one rule is the technical basket\'s, so it is counted, not listed', () => {
    const before = decides(DELIVERY, BEFORE);
    expect(before.ex.baskets.technical).toHaveLength(1);
    expect(before.d.rules.map((r) => r.id)).toEqual(['BR-001']);
    expect(before.d.technical).toBe(0);
    const after = decides(DELIVERY, AFTER);
    expect(after.d.rules).toEqual([]);
    expect(after.d.technical).toBe(1);
  });

  test('on all four starter examples the listed rules are business-basket rules and the counts add up to that basket', () => {
    for (const source of [PO, FREIGHT, DELIVERY, LEGACY]) {
      const { ex, d } = decides(source, AFTER);
      for (const r of d.rules) expect(ex.baskets.business).toContain(r.id);
      expect(d.rules.length + d.more).toBe(ex.baskets.business.length);
      expect(d.technical).toBe(ex.baskets.technical.length);
    }
  });
});
