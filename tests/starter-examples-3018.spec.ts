import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import * as abaplint from '@abaplint/core';
import { STARTER_EXAMPLES } from '../lib/starter-examples';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { readCallGraph } from '../lib/abap/call-graph';
import { readSource } from '../lib/first-look';
import { findingRows } from '../lib/findings-view';
import { APP_VERSION } from '../lib/version';
import { EXAMPLES_DIR, readExampleAsOf3017 } from './helpers/starter-example-files';

/**
 * Roadmap 3.0.18 — the starter examples are correct ABAP with no dead code.
 *
 * The end-to-end check of every example (18.10.2026) found the shipped sources faulty: an indented `*` used as a
 * comment (Z_SALES_ORDER_CREATOR L70, a syntax error in ABAP), `INSERT … FROM @VALUE #( … )` (ZLEGACY_…_1000LOC
 * L500 and L524, a host expression is `@( … )`), a byte-order mark in front of the 1,000-line example, a price typed
 * as a screen OK code (`sscrfields-ucomm`, Z_MATERIAL_STOCK_CALC L16), and dead code: 17 FORMs and 2 MODULEs nothing
 * reached in the 1,000-line example (fourteen of them one routine copied fourteen times, 32 % of the file), 13 FORMs
 * nothing performed in the PO demo (22 %). A reader who loads an example meets that code first.
 *
 * Each check below runs on the shipped files and, to show it is not vacuous, on the copies as they shipped until
 * 3.0.17 (tests/fixtures/starter-examples-3.0.17/), where it must find the defect. Server-free.
 */

const read = (file: string) => fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8');
const LEGACY = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const PO = 'Z_MM_PO_APPROVAL.abap';

/** abaplint at the newest release: the lines it cannot parse at all. */
function parserErrors(source: string): number[] {
  const text = source.replace(/^﻿/, '');
  const name = /REPORT\s+(\w+)/i.exec(text)?.[1]?.toLowerCase() ?? 'zexample';
  const config = new abaplint.Config(JSON.stringify({ ...abaplint.Config.getDefault().get(), syntax: { version: 'v757', errorNamespace: '.' } }));
  const registry = new abaplint.Registry(config);
  registry.addFile(new abaplint.MemoryFile(`${name}.prog.abap`, text));
  registry.parse();
  return registry.findIssues().filter((i) => i.getKey() === 'parser_error').map((i) => i.getStart().getRow());
}

const unreached = (source: string) => readSource(source.replace(/\r\n/g, '\n')).skeleton.notDrawn.unreached.map((u) => u.name);

test.describe('every shipped starter example is ABAP abaplint parses, with no byte-order mark', () => {
  for (const example of STARTER_EXAMPLES) {
    test(`${example.file}: no parser error, no BOM`, () => {
      const source = read(example.file);
      expect(source.charCodeAt(0), 'a byte-order mark in front of the source').not.toBe(0xfeff);
      expect(parserErrors(source)).toEqual([]);
    });
  }

  test('the check finds what 3.0.17 shipped: L500 and L524 of the 1,000-line example, and its BOM', () => {
    const old = readExampleAsOf3017(LEGACY);
    expect(old.charCodeAt(0)).toBe(0xfeff);
    expect(parserErrors(old)).toEqual([500, 524]);
  });

  test('an indented asterisk is not a comment: the check finds it', () => {
    const shipped = read('Z_SALES_ORDER_CREATOR.txt');
    expect(shipped).toContain('  " Call BAPI Function Module Simulation');
    const before = shipped.replace('  " Call BAPI Function Module Simulation', '  * Call BAPI Function Module Simulation');
    expect(parserErrors(before)).toEqual([70]);
  });

  test('Z_MATERIAL_STOCK_CALC types its price as a price, not as a screen OK code', () => {
    const line16 = read('Z_MATERIAL_STOCK_CALC.txt').split(/\r?\n/)[15];
    expect(line16).toMatch(/^\s+netpr TYPE p LENGTH 11 DECIMALS 2,/);
    expect(read('Z_MATERIAL_STOCK_CALC.txt')).not.toMatch(/sscrfields/i);
  });
});

test.describe('no shipped starter example carries code nothing reaches', () => {
  for (const example of STARTER_EXAMPLES) {
    test(`${example.file}: every routine is reached, no routine is a copy of another`, () => {
      const source = read(example.file);
      expect(unreached(source)).toEqual([]);
      expect(readSource(source.replace(/\r\n/g, '\n')).skeleton.notDrawn.clones).toEqual([]);
      expect(readCallGraph(source).unreachable).toEqual([]);
    });
  }

  test('the check finds the dead code 3.0.17 shipped: 19 regions in the 1,000-line example, 13 in the PO demo', () => {
    expect(unreached(readExampleAsOf3017(LEGACY))).toHaveLength(19);
    expect(unreached(readExampleAsOf3017(PO))).toHaveLength(13);
  });

  test('the 1,000-line example keeps its promise: exactly 1,000 lines', () => {
    const lines = read(LEGACY).replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
    expect(lines).toHaveLength(1000);
    expect(STARTER_EXAMPLES.find((e) => e.file === LEGACY)?.lines).toBe(1000);
  });

  test('the PO demo calls the checks its rules BR-007, BR-008 and BR-012 stand in', () => {
    const graph = readCallGraph(read(PO));
    const callers = (target: string) => graph.edges.filter((e) => e.to === target).map((e) => e.from);
    expect(callers('CHECK_MATERIAL_STATUS')).toEqual(['CHECK_REQUISITION']);
    expect(callers('CHECK_ACCOUNT_ASSIGNMENT')).toEqual(['CHECK_REQUISITION']);
    expect(callers('CHECK_COST_CENTER')).toEqual(['CHECK_ACCOUNT_ASSIGNMENT']);
  });
});

test.describe('what the engine says about the shipped examples since 3.0.18 (private edition)', () => {
  // Measured 18.10.2026 on the corrected sources. Before (3.0.17): 1,000-line example 45 findings (26 rows), score 45,
  // 17 rules; PO demo 33 findings (27 rows), score 37, 12 rules. The other examples did not move.
  const EXPECTED: Record<string, { findings: number; rows: number; score: number; route: string; rules: number }> = {
    'Z_MATERIAL_STOCK_CALC.txt': { findings: 3, rows: 3, score: 91, route: 'In-App (ABAP Cloud)', rules: 3 },
    'Z_INVOICE_EXTRACTOR.txt': { findings: 3, rows: 3, score: 87, route: 'In-App (ABAP Cloud)', rules: 0 },
    'Z_SALES_ORDER_CREATOR.txt': { findings: 0, rows: 0, score: 90, route: 'In-App (ABAP Cloud)', rules: 0 },
    'Z_MM_PO_APPROVAL.abap': { findings: 24, rows: 21, score: 40, route: 'In-App (ABAP Cloud)', rules: 12 },
    'Z_SD_FREIGHT_RATE_CHECK.abap': { findings: 10, rows: 10, score: 82, route: 'Side-by-Side (SAP BTP)', rules: 14 },
    [LEGACY]: { findings: 38, rows: 30, score: 40, route: 'Side-by-Side (SAP BTP)', rules: 30 },
  };

  test('one row per shipped example', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(STARTER_EXAMPLES.map((e) => e.file).sort());
  });

  for (const [file, want] of Object.entries(EXPECTED)) {
    test(`${file}: ${want.findings} findings, score ${want.score}, ${want.rules} rules`, () => {
      const source = read(file).replace(/\r\n/g, '\n');
      const evidence = buildAbapEvidence(source, file, 'private', undefined, APP_VERSION);
      const route = routeExtensibility(evidence, 'private', APP_VERSION);
      expect({
        findings: evidence.findings.length,
        rows: findingRows(evidence.findings).length,
        score: route.cleanCoreScore,
        route: route.recommendedRoute,
        rules: readSource(source).ruleSet.rules.length,
      }).toEqual(want);
    });
  }
});
