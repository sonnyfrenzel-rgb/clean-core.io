import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Roadmap step 0.4 (`UX-E13-F01:R0`): no module shows an amount that no approved
 * assumption carries.
 *
 * Acceptance (docs/roadmap/SCHNITT-0-UMFANG.md §4, V25-A06): "Analyze, Brief und
 * Export ohne Annahmenrevision zeigen keinen Geldwert; der Prompt enthält keine
 * monetären Felder."
 *
 * Before: the analysis prompt asked the model for `estimatedMaintenanceCostRange`
 * and a `cloudRoiSummary` with "projected savings of approximately $Y–$Z per
 * year"; the Analyze stage showed them as "Est. Maint. Cost: 3.000 €–8.000 €/yr"
 * and "Estimated Cloud ROI", and the Confluence export carried them to a
 * customer. Nothing behind those numbers was an assumption anyone had approved.
 *
 * The one place that prices anything is the Economics stage, and only from the
 * figures the user enters (tests/tco-cost-inputs-guard.spec.ts).
 */
const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf8');
const ANALYZE = 'app/(app)/project/[projectId]/analyze/page.tsx';

test('the analysis prompt asks for no money', () => {
  const src = read(ANALYZE);
  const start = src.indexOf('businessValueAnalysis: {');
  const block = src.slice(start, src.indexOf('};', start));
  expect(start).toBeGreaterThan(0);
  expect(block).not.toMatch(/estimatedMaintenanceCost|cloudRoiSummary/);
  // The field list itself: no cost, saving, ROI, price or currency — the one comment saying "no money" aside.
  const fields = block.replace(/\/\/.*$/gm, '');
  expect(fields).not.toMatch(/cost|saving|\broi\b|price|currency|€|\$\s?\d/i);
});

test('an analysis type carries no money field', () => {
  const src = read('lib/types.ts');
  const start = src.indexOf('businessValueAnalysis?: {');
  const block = src.slice(start, src.indexOf('};', start));
  expect(block).not.toMatch(/estimatedMaintenanceCost|cloudRoiSummary|:\s*number;\s*\/\/.*(€|EUR|cost)/i);
});

test('the Analyze stage and its export say "not determined" instead of an amount', () => {
  const audit = read('components/analyze/BusinessValueAudit.tsx');
  expect((audit.match(/data-money-not-determined/g) || []).length).toBe(2);
  expect(audit).not.toMatch(/style: 'currency'|toLocaleString\(/);
  expect(audit).not.toMatch(/Estimated Cloud ROI|ROI Calculator/);
  const page = read(ANALYZE);
  expect(page).toContain('<strong>Annual maintenance cost:</strong> not determined');
  expect(page).not.toMatch(/Expected Cloud ROI|bizFallback\.cloudRoiSummary|bizFallback\.estimatedMaintenanceCost/);
});

test('no screen outside Economics formats an amount of money', () => {
  const ALLOWED = new Set(['app/(app)/project/[projectId]/tco/page.tsx']);
  const MONEY = [/style:\s*'currency'/, /€\s?\$?\{/, /\$\{[^}]+\}\s?€/, /EUR\/yr|€\/yr|\/yr`/, /\bprojected savings\b/i];
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.resolve(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(e.name) && !ALLOWED.has(rel)) {
        // Comments may tell the history of a removed figure; code and copy may not show one.
        const text = read(rel)
          .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        for (const re of MONEY) if (re.test(text)) offenders.push(`${rel} ${re}`);
      }
    }
  };
  for (const dir of ['app', 'components', 'lib']) walk(dir);
  expect(offenders).toEqual([]);
});
