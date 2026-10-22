import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PROVENANCE,
  PROVENANCE_LABELS,
  RETIRED_PROVENANCE_WORDINGS,
  isProvenanceLabel,
  type ProvenanceValue,
} from '../lib/provenance';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessMapModel } from '../lib/process-map';
import { buildProcessDocumentation } from '../lib/process-documentation-build';
import { processDocumentationToMarkdown } from '../lib/process-documentation';
import { stripComments } from './helpers/design-rules';
import { pinnedExamplePath } from './helpers/starter-example-files';

/**
 * Roadmap 3.0.21 — "AI-generated" replaces "Model proposal" on the face (owner
 * decision 22.10.2026, with the AI Act labelling of the legal review).
 *
 * The provenance value `proposed` keeps its machine value, its message key, its
 * dashed form and its pen — never a spark (ADR-014). Only the word changes, and
 * it changes everywhere a reader sees it. What the deterministic engine writes
 * never carries it.
 *
 * Server-free: the list, a scan of the sources, one chip rendered to static
 * markup and one engine-only export built from a shipped example.
 */

const ROOT = path.resolve(__dirname, '..');

test.describe('the value proposed', () => {
  test('reads AI-generated, keeps its value, key, form and pen', () => {
    const entry = PROVENANCE.proposed;
    expect(entry.value).toBe('proposed');
    expect(entry.key).toBe('provenance.proposed');
    expect(entry.label).toBe('AI-generated');
    expect(entry.icon, 'a pen, never a spark').toBe('pen-line');
    expect(entry.form).toBe('dashed');
    expect(entry.state).toBe('warning');
    expect(isProvenanceLabel('AI-generated')).toBe(true);
    expect(PROVENANCE_LABELS).toContain('AI-generated');
  });

  test('the old word is a retired wording of proposed, and no label any more', () => {
    expect(RETIRED_PROVENANCE_WORDINGS['model proposal']).toBe('proposed');
    expect(isProvenanceLabel('Model proposal')).toBe(false);
    // A spelling without the hyphen is a different string and stays retired.
    expect(RETIRED_PROVENANCE_WORDINGS['ai generated']).toBe('proposed');
    expect(isProvenanceLabel('AI Generated')).toBe(false);
  });
});

/**
 * Where the old word may still stand in code, and why. Each is a string the
 * reader of the product never sees as a label.
 */
const ALLOWED: Record<string, string> = {
  'lib/provenance.ts': 'the retired-wordings map names the old word on purpose',
  'lib/transformation/scaffold-node.ts':
    'comments inside generated code; every engine-owned character is bound by the scaffold digest of stored generations',
  'lib/transformation/scaffold-rap.ts':
    'comments inside generated code; every engine-owned character is bound by the scaffold digest of stored generations',
  'lib/transformation/runtime-node.ts': 'engine-written runtime files of the generated package, bound the same way',
};

function sources(): { rel: string; text: string }[] {
  const out: { rel: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') walk(rel);
      } else if (/\.(ts|tsx)$/.test(e.name)) {
        out.push({ rel, text: fs.readFileSync(path.join(ROOT, rel), 'utf8') });
      }
    }
  };
  for (const dir of ['app', 'components', 'lib', 'hooks']) if (fs.existsSync(path.join(ROOT, dir))) walk(dir);
  return out;
}

test.describe('the old word is gone from the face', () => {
  test('no UI, export, help or public text in app/, components/, lib/ or hooks/ writes it', () => {
    const files = sources();
    expect(files.length, 'nothing scanned').toBeGreaterThan(300);
    const offenders: string[] = [];
    for (const { rel, text } of files) {
      if (rel in ALLOWED) continue;
      const code = stripComments(text, rel);
      code.split(/\r?\n/).forEach((line, i) => {
        if (/model proposals?\b/i.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(offenders, `the word of proposed is AI-generated since 3.0.21:\n${offenders.join('\n')}`).toEqual([]);
  });

  test('each allowed file still needs its exception', () => {
    for (const rel of Object.keys(ALLOWED)) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(/model proposals?\b/i.test(text), `${rel} no longer needs its exception — remove it`).toBe(true);
    }
  });
});

test.describe('what the engine writes carries no AI label', () => {
  const OUT = path.resolve(ROOT, 'tmp', 'provenance-ai-generated-spec', String(process.pid));
  let Chip: (props: { value: ProvenanceValue; note?: string }) => React.ReactElement;

  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    fs.mkdirSync(OUT, { recursive: true });
    await build({
      entryPoints: [path.resolve(ROOT, 'components', 'cc', 'ProvenanceChip.tsx')],
      outfile: path.join(OUT, 'ProvenanceChip.cjs'),
      bundle: true,
      format: 'cjs',
      platform: 'node',
      jsx: 'automatic',
      external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react'],
      alias: { '@': ROOT },
      logLevel: 'silent',
    });
    Chip = require(path.join(OUT, 'ProvenanceChip.cjs')).default;
  });

  test('the chip of proposed says AI-generated; the engine values never do', () => {
    const proposed = renderToStaticMarkup(React.createElement(Chip, { value: 'proposed', note: 'worded' }));
    expect(proposed).toContain('data-provenance="proposed"');
    expect(proposed).toContain('AI-generated');
    expect(proposed).not.toMatch(/model proposal/i);
    for (const value of ['reconstructed', 'proven', 'imported', 'not-determined'] as const) {
      const html = renderToStaticMarkup(React.createElement(Chip, { value }));
      expect(html).toContain(`data-provenance="${value}"`);
      expect(html, `${value} carries the AI label`).not.toMatch(/AI-generated/i);
    }
  });

  test('an engine-only process documentation labels no statement AI-generated', () => {
    const file = 'Z_MM_PO_APPROVAL.abap';
    const source = fs.readFileSync(pinnedExamplePath(file), 'utf8').replace(/\r\n/g, '\n');
    const bpmn = buildBpmnExportFromSource(source, { processName: file, sourceFileName: file });
    // No naming record: every step stands with its technical name, as the engine wrote it.
    const map = buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(source), null), fileName: file });
    const md = processDocumentationToMarkdown(buildProcessDocumentation({ source, map }));
    expect(md.length).toBeGreaterThan(1000);
    // The label as the export prints it on a statement: after a dash, in brackets, or as a line's lead.
    expect(md).not.toMatch(/— AI-generated|\((?:name: )?AI-generated\)|^AI-generated:/m);
    // What remains are the sentences that explain the rule for named steps, never a step itself.
    const mentions = md.split('\n').filter((l) => l.includes('AI-generated'));
    for (const line of mentions) expect(line, line).toMatch(/[Bb]usiness names[^.]* are AI-generated/);
  });
});
