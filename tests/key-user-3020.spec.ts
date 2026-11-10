/**
 * Owner decisions of 21.10.2026 on the key-user route.
 *
 *   1. On a key-user decision the delivery package leaves out any code package
 *      generated against an earlier decision — as the standard path does.
 *   2. Every "level A by construction" line says it holds once each
 *      candidate's release is checked in the target system (the caveat
 *      Analyze carries) — the step list, the design comparison, the package's
 *      Markdown and the comparison facts; the signed reading keeps the bare level.
 *
 * Server-free: pure modules, and the two components bundled with esbuild and
 * rendered to static markup.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sha256Hex } from '../lib/artefact-digest';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { buildKeyUserSteps, keyUserLevelSentence, keyUserStepsMarkdown, type KeyUserStepList } from '../lib/key-user-steps';
import { KEY_USER_STEPS_PATH } from '../lib/key-user-route';
import { engineOptionFacts } from '../lib/design-option-comparison';
import { keyUserRouteBasis } from '../lib/abap/extensibility-router';
import { createDeliveryBundle, finishDeliveryPackage } from '../lib/delivery-package';
import { deliveryFactsOf, ruleFactsOf, scoreFactsOf } from '../lib/delivery-facts';
import { workflowSteps } from '../lib/workflow-steps';
import type { HandoverProject } from '../lib/handover';
import { readExample } from './helpers/starter-example-files';

const NEW = 'v3.0.19';
const EXAMPLE = 'Z_SD_DELIVERY_PRIORITY.abap';
const WHOLE = readExample(EXAMPLE).replace(/\r\n/g, '\n');
const CAVEAT = "It holds once each candidate's release, with its other limits, is checked in the target system";

const evidence = () => buildAbapEvidence(WHOLE, EXAMPLE, 'private', undefined, NEW);
const listOf = (): KeyUserStepList => buildKeyUserSteps(evidence().keyUser)!;

function project(): HandoverProject {
  return {
    id: 'p-ku-3020',
    name: 'Delivery priority',
    userId: 'owner-uid',
    legacyCode: WHOLE,
    activeRunId: 'run-ku-3020',
    extensibilityRoute: 'In-App ABAP Cloud (RAP)',
    originalRecommendation: 'keyuser',
    cleanCoreScore: 90,
    s4Deployment: 'private',
    analyzerVersion: NEW,
    solutionDesign: '# Design',
    documentation: '# Process',
    targetArchitecture: 'keyuser',
    approvedByArchitect: true,
    architectJustifiedOverride: '',
    // A code package from an earlier RAP decision is still on the project.
    generatedCode: JSON.stringify([{ path: 'src/zcl_prio.clas.abap', content: 'CLASS zcl_prio DEFINITION. ENDCLASS.' }]),
    auditMetadata: {
      inputFingerprint: { sha256: sha256Hex(WHOLE), fileName: EXAMPLE, lineCount: WHOLE.split('\n').length, uploadedAt: '2026-10-21T08:00:00.000Z', objectType: 'Report' },
      modelCard: { provider: null, model: null, modelParticipation: 'none', engineVersion: NEW, byokUsed: false },
    },
  } as unknown as HandoverProject;
}

/* ------------------------------------------------------------ 1. no stale code */

test.describe('1. a key-user decision ships no code generated against an earlier decision', () => {
  const run = (whole: boolean) => {
    const p = project();
    const list = listOf();
    const facts = deliveryFactsOf(p, {
      phases: workflowSteps(p),
      rules: ruleFactsOf(null, 'not read in this test.'),
      score: scoreFactsOf(p, null, 'not read in this test'),
      generatedAt: '2026-10-21T09:00:00.000Z',
      appVersion: NEW,
      referenceSection: '',
      documentationFromEngine: true,
    });
    const b = createDeliveryBundle();
    b.file('src/zcl_prio.clas.abap', 'CLASS zcl_prio DEFINITION. ENDCLASS.', 'generated');
    b.file('.abapgit.xml', '<x/>');
    b.file('abaplint.json', '{}');
    b.folder('docs').file('solution-design.md', '# Design\n');
    return finishDeliveryPackage({
      entries: b.entries,
      facts: { ...facts, keyUser: { whole, markdown: keyUserStepsMarkdown(list, 'Delivery priority'), steps: list.effort.steps, checks: list.effort.checks, codeParts: whole ? 0 : 1 } },
      layout: 'package',
    });
  };

  test('whole program key user: only documents travel, the step list among them', () => {
    const out = run(true);
    const names = out.files.map((f) => f.path);
    expect(names).not.toContain('src/zcl_prio.clas.abap');
    expect(names).not.toContain('.abapgit.xml');
    expect(names).not.toContain('abaplint.json');
    expect(names.some((n) => n.startsWith('checks/'))).toBe(false);
    expect(names).toContain('docs/solution-design.md');
    expect(names).toContain(KEY_USER_STEPS_PATH);
    expect(out.manifest.some((f) => /\.abap$/.test(f.path))).toBe(false);
    expect(out.reading.kind).toBe('documents-only');
    expect(out.files.find((f) => f.path === 'STATUS.md')!.content).toContain('No code: the decision is key-user extensibility.');
  });

  test('a program that splits keeps the code generated for its code parts', () => {
    const names = run(false).files.map((f) => f.path);
    expect(names).toContain('src/zcl_prio.clas.abap');
    expect(names).toContain(KEY_USER_STEPS_PATH);
  });
});

/* ------------------------------------------------------- 2. the level caveat */

async function component(rel: string, name: string): Promise<(props: Record<string, unknown>) => React.ReactElement | null> {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'tmp', 'key-user-3020', String(process.pid), `${path.basename(rel, path.extname(rel))}-${name}.cjs`);
  await build({
    entryPoints: [path.join(root, rel)],
    outfile: out,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
    alias: { '@': root },
    logLevel: 'silent',
  });
  const mod = require(out);
  return mod[name] ?? mod.default;
}

test.describe('2. "level A by construction" holds once each candidate\'s release is checked', () => {
  test('the engine still reads level A for the whole example, with a release not determined', () => {
    const list = listOf();
    expect(list.levelByConstruction).toBe('A');
    expect(evidence().keyUser!.candidates.some((c) => c.release.state === 'not-determined')).toBe(true);
    // The signed reading keeps the bare level, no sentence.
    expect(evidence().keyUser!.levelByConstruction).toBe('A');
  });

  test('the sentence, the package Markdown and the comparison facts carry the caveat', () => {
    expect(keyUserLevelSentence('A')).toContain('level A by construction');
    expect(keyUserLevelSentence('A')).toContain(CAVEAT);
    const md = keyUserStepsMarkdown(listOf(), 'Delivery priority');
    expect(md).toContain(keyUserLevelSentence('A'));
    const facts = engineOptionFacts({
      recommended: 'in-app-rap', drivers: [], findings: [], requirements: null, deployment: 'private',
      keyUser: keyUserRouteBasis(evidence().keyUser!),
    }).options.keyuser;
    const last = facts[facts.length - 1];
    expect(last).toContain('level A by construction');
    expect(last).toContain('is checked in the target system');
  });

  test('the step list (Transformation) renders the caveat', async () => {
    const KeyUserSteps = await component('components/keyuser/KeyUserSteps.tsx', 'default');
    const html = renderToStaticMarkup(React.createElement(KeyUserSteps, { list: listOf(), mode: 'whole', view: 'steps' }));
    expect(html).toContain('data-key-user-level="A"');
    expect(html).toContain('It holds once each candidate&#x27;s release, with its other limits, is checked in the target system');
  });

  test('the design comparison (Design) renders the caveat beside the fourth option', async () => {
    const OptionComparison = await component('components/design/OptionComparison.tsx', 'default');
    const html = renderToStaticMarkup(React.createElement(OptionComparison, { design: null, keyUser: listOf(), keyUserChosen: true }));
    expect(html).toContain('data-key-user-level="A"');
    expect(html).toContain('It holds once each candidate&#x27;s release, with its other limits, is checked in the target system');
  });
});
