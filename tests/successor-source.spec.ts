import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildAbapEvidence, type EvidenceFinding } from '../lib/abap/evidence-model';
import { primarySuccessor } from '../lib/abap/catalog-service';
import { successorSource, successorSourceNote } from '../lib/successor-source';
import type { FocusPick } from '../lib/findings-view';

/**
 * A curated successor is never labelled as SAP's — external audit PRV-01.
 *
 * The engine resolves VBAK through Clean-Core.io's curated layer
 * (`API_SALES_ORDER_SRV`, confidence `Verified`), while SAP's own release data
 * names `I_SALESDOCUMENT`. The "Look here first" card used to hang the chip
 * "Imported · SAP catalog" on both. Rendered with the real component, not
 * grepped: the pattern of `tests/findings-focus-names.spec.ts`.
 */

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'successor-source');

type Focus = (props: { picks: readonly FocusPick[] }) => React.ReactElement;
let FindingsFocus: Focus;

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  await build({
    entryPoints: [path.resolve(ROOT, 'components', 'analyze', 'FindingsFocus.tsx')],
    outfile: path.join(OUT, 'FindingsFocus.cjs'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  FindingsFocus = require(path.join(OUT, 'FindingsFocus.cjs')).default as Focus;
});

const CODE = `REPORT zsales.
DATA lt_vbak TYPE STANDARD TABLE OF vbak.
SELECT * FROM vbak INTO TABLE lt_vbak.
`;

function vbakFinding(): EvidenceFinding {
  const report = buildAbapEvidence(CODE, 'zsales.abap', 'public');
  const vbak = report.findings.find((f) => f.objectName === 'VBAK' && f.sapReplacement?.objectName);
  expect(vbak, 'the engine names a successor for VBAK').toBeTruthy();
  return vbak!;
}

function pickOf(finding: EvidenceFinding): FocusPick {
  return {
    row: { finding, lines: [finding.lineStart], snippets: [] } as unknown as FocusPick['row'],
    why: 'High',
    reason: null,
  };
}

/** The visible text of the rendered markup, tags stripped. */
function text(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
}

test('the engine names the curated successor for VBAK, SAP names its own', () => {
  const vbak = vbakFinding();
  expect(vbak.sapReplacement!.objectName).toBe('API_SALES_ORDER_SRV');
  expect(vbak.sapReplacement!.confidence).toBe('Verified');
  expect(successorSource(vbak.sapReplacement!.confidence)).toBe('curated');

  const sap = primarySuccessor('VBAK');
  expect(sap?.name).toBe('I_SALESDOCUMENT');
  expect(sap?.source).toBe('sap');
  expect(successorSource('Catalog Match')).toBe('sap');
});

test('the source note never calls a curated mapping SAP', () => {
  expect(successorSourceNote('Verified')).toBe('Clean-Core.io curated mapping');
  expect(successorSourceNote('Verified')).not.toMatch(/\bSAP\b/);
  expect(successorSourceNote('Catalog Match')).toBe('SAP catalog');
  expect(successorSourceNote('Candidate')).toBe('candidate');
  expect(successorSourceNote(undefined)).toBe('to be checked');
});

test('the focus card labels the curated VBAK successor curated, and an SAP one SAP', () => {
  const curated = vbakFinding();
  const html = text(renderToStaticMarkup(React.createElement(FindingsFocus, { picks: [pickOf(curated)] })));
  expect(html).toContain('API_SALES_ORDER_SRV');
  expect(html).toContain('Clean-Core.io curated mapping');
  expect(html).not.toContain('SAP catalog');

  const fromSap: EvidenceFinding = {
    ...curated,
    sapReplacement: { ...curated.sapReplacement!, objectName: 'I_SALESDOCUMENT', confidence: 'Catalog Match' },
  };
  const sapHtml = text(renderToStaticMarkup(React.createElement(FindingsFocus, { picks: [pickOf(fromSap)] })));
  expect(sapHtml).toContain('I_SALESDOCUMENT');
  expect(sapHtml).toContain('SAP catalog');
  expect(sapHtml).not.toContain('curated');
});

test('no renderer hard-codes "SAP catalog" for a curated confidence', () => {
  // The one place the words live is lib/successor-source.ts; a renderer that
  // tests both confidences and prints a fixed SAP note is the PRV-01 defect.
  const files = [
    'components/analyze/FindingsFocus.tsx',
    'components/analyze/SourcePanel.tsx',
    'components/analyze/EvidenceFindingsTable.tsx',
    'components/transformation/TransformationObjectPage.tsx',
    'lib/analysis-export.ts',
  ];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    expect(src, `${f} labels a Verified successor as SAP's`).not.toMatch(
      /confidence === 'Verified'[^\n]*\n?[^\n]*SAP catalog/,
    );
    expect(src, `${f} reads its source words from lib/successor-source.ts`).toContain('successorSource');
  }
});
