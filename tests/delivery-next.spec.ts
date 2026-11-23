import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sha256Hex } from '../lib/artefact-digest';
import { workflowSteps } from '../lib/workflow-steps';
import {
  buildHandoverChain,
  handoverNextStep,
  handoverStillNeeded,
  type HandoverProject,
} from '../lib/handover';
import {
  DELIVERY_SECTION_IDS,
  NEVER_IN_PACK,
  deliveryFacets,
  handoverAnswer,
  linkInWords,
  partsCount,
  proofRows,
  travelsOpen,
  type DeliveryFacts,
  type PackageParts,
} from '../lib/delivery-view';
import { deliveryAnchors, PAGE_ANCHOR_IDS } from '../lib/page-anchors';

/**
 * Delivery, next (ADR-132, `docs/roadmap/delivery-next-mockup.html`, decisions L1–L10, L12, L13). Server-free: the
 * pure answer, facets, open list and proof table of `lib/delivery-view.ts`, a static render of the pieces, and the
 * page's source.
 *
 * What it holds:
 *   - the answer is Yes, Not yet or Stop, and Yes only on an empty still-needed list (L2);
 *   - no facet, no answer and no row says "Handed over" (L4) — a download is not a handover;
 *   - the decision and the target are never "confirmed" or "sealed" when nobody confirmed them (UX-138);
 *   - the next step follows the tool order, Economics before Design (L9);
 *   - the page draws one view note, the answer card, the bar, and the six sections the bar names (L1, L13);
 *   - the bundle button says "review version" until nothing blocks the handover;
 *   - what is signed is not touched: the page imports nothing that builds or verifies a pack beyond what it did.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n?/g, '\n');
const PAGE = 'app/(app)/project/[projectId]/delivery/page.tsx';
const OUT = path.join(ROOT, 'tmp', 'delivery-next', String(process.pid));

const SOURCE = 'REPORT z_handover.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n';

function project(extra: Record<string, unknown> = {}): HandoverProject {
  return {
    id: 'p1',
    name: 'Handover fixture',
    legacyCode: SOURCE,
    activeRunId: 'run-0001',
    createdAt: '2026-09-16T08:00:00.000Z',
    cleanCoreScore: 62,
    worklist: [],
    auditMetadata: {
      inputFingerprint: {
        sha256: sha256Hex(SOURCE), fileName: 'z_handover.abap', lineCount: 2, byteSize: SOURCE.length,
        uploadedAt: '2026-09-16T07:59:00.000Z', objectType: 'Report',
      },
      modelCard: { provider: null, model: null, modelParticipation: 'none', engineVersion: 'v2.20.0', byokUsed: false },
    },
    ...extra,
  } as HandoverProject;
}

const NO_PARTS: PackageParts = { code: false, tests: false, documentation: false, bpmn: true, spec: false, slides: true };

function factsOf(p: HandoverProject, parts: PackageParts = NO_PARTS, exportedAt: string | null = null, blockers: string[] = []): DeliveryFacts {
  const phases = workflowSteps(p);
  const chain = buildHandoverChain(p, phases);
  const stillNeeded = handoverStillNeeded(p, chain, { blockers, exportedAt });
  return { program: 'Purchase approval', blockers, exportedAt, stillNeeded, chain, phases, parts };
}

test.describe('the answer (L2, L4)', () => {
  test('nothing made yet: Not yet, nothing to hand over, and the tools named in their order', () => {
    const p = project();
    const a = handoverAnswer(p, factsOf(p));
    expect(a.verdict).toBe('not-yet');
    expect(a.answer).toContain('there is nothing to hand over');
    expect(a.answer).toContain('signed');
    expect(a.condition).toContain('Economics, Design, Transformation, Documentation, Testing');
  });

  test('a review version: Not yet, naming what is missing', () => {
    const p = project({ generatedCode: 'CLASS zcl_x DEFINITION. ENDCLASS.', documentation: '# Doc' });
    const f = factsOf(p, { ...NO_PARTS, code: true, documentation: true });
    const a = handoverAnswer(p, f);
    expect(a.verdict).toBe('not-yet');
    expect(a.answer).toMatch(/^Not yet\. The package holds code and documentation as a review version, but /);
    expect(a.answer).toContain('the decision is not confirmed');
    expect(a.answer).toContain('the audit pack is not sealed');
    expect(a.condition).toContain('signed by the server');
  });

  test('a blocker is Stop', () => {
    const p = project({ generatedCode: 'x' });
    const a = handoverAnswer(p, factsOf(p, { ...NO_PARTS, code: true }, null, ['transformation']));
    expect(a.verdict).toBe('stop');
    expect(a.answer).toMatch(/^Stop — do not hand over/);
  });

  test('Yes only when the still-needed list is empty', () => {
    const p = project({ generatedCode: 'x' });
    const f = { ...factsOf(p, { ...NO_PARTS, code: true }), stillNeeded: [] };
    expect(handoverAnswer(p, f).verdict).toBe('yes');
    expect(handoverAnswer(p, f).condition).toContain('happen in your system');
  });

  test('no word of the view module says "Handed over"', () => {
    expect(read('lib/delivery-view.ts')).not.toMatch(/['`]Handed over/);
    expect(read(PAGE)).not.toMatch(/'Handed over'|>Handed over</);
  });
});

test.describe('the four facets (L2)', () => {
  test('on record, the package, tests, audit pack — in that order, each jumping to its section', () => {
    const p = project();
    const facets = deliveryFacets(p, factsOf(p));
    expect(facets.map((f) => f.id)).toEqual(['on-record', 'package', 'tests', 'audit-pack']);
    expect(facets.map((f) => f.label)).toEqual(['On record', 'The package', 'Tests', 'Audit pack']);
    expect(facets[0].unit).toBe('of 9 links');
    expect(facets[1]).toMatchObject({ value: '2', unit: 'of 6 parts' });
    expect(facets[2].value).toBe('Not yet');
    expect(facets[3]).toMatchObject({ value: 'Not sealed', target: DELIVERY_SECTION_IDS.pack });
    expect(facets[3].note).toContain('Not sealed yet');
  });

  test('sealed is "Sealed" with its date and the signed chip — never "Handed over"', () => {
    const p = project();
    const sealed = deliveryFacets(p, factsOf(p, NO_PARTS, '2026-11-15T14:32:00.000Z'))[3];
    expect(sealed).toMatchObject({ value: 'Sealed', chip: 'signed' });
    expect(sealed.note).toContain('2026-11-15');
  });

  test('tests against mocks are a simulation, never a pass of your system', () => {
    const p = project({
      testCases: [{ id: 'TC1', status: 'Passed' }],
      testRunReceipt: undefined,
    });
    const f = deliveryFacets(p, factsOf(p));
    expect(f[2].value).toBe('Written, not run');
    expect(f[2].chip).toBeUndefined();
  });
});

test.describe('the proof table (L3) and UX-138', () => {
  test('nothing confirmed: the target and the decision read "not yet", never sealed or confirmed', () => {
    const p = project();
    const rows = proofRows(p, factsOf(p));
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.target.status).toBe('not-yet');
    expect(by.decision.status).toBe('not-yet');
    expect(by.decision.restsOn).not.toMatch(/Confirmed/);
    expect(by['test-result'].status).toBe('not-yet');
    expect(by.findings.status).toBe('signed');
    expect(by.level.status).toBe('never');
    expect(rows.filter((r) => r.group === 'server').map((r) => r.file)).toEqual([
      '03-findings.csv',
      '01-input-fingerprint.json · 08-input-manifest.json',
      '02-decision-record.json · 06-architecture-decision-record.md',
      '04-model-card.md',
      '05-known-limitations.md',
    ]);
  });

  test('a signed-off target is sealed as your word; the decision and the test result are on the project, not in the pack', () => {
    const p = project({ approvedByArchitect: true, targetArchitecture: 'cap', approvedBy: 'owner@example.com', architectSignOffAt: '2026-09-16T09:00:00.000Z' });
    const by = Object.fromEntries(proofRows(p, factsOf(p)).map((r) => [r.key, r]));
    expect(by.target.status).toBe('sealed');
    expect(by.target.file).toBe('07-user-attested.md');
    expect(by.decision.file).toBeNull();
    expect(by['test-result'].file).toBeNull();
  });

  test('without a signed run nothing reads signed', () => {
    const p = project({ activeRunId: null });
    expect(proofRows(p, factsOf(p)).filter((r) => r.status === 'signed')).toEqual([]);
  });

  test('the chain in plain words — no chip words', () => {
    const p = project();
    const words = factsOf(p).chain.map(linkInWords);
    expect(words).toHaveLength(9);
    for (const w of words) expect(w).toMatch(/: (on record|open|made for a previous source)/);
    expect(NEVER_IN_PACK.map(([t]) => t)).toContain('The clean core level (A–D)');
  });
});

test.describe('before go-live (L5) and the next step (L9)', () => {
  test('the next step follows the tool order: Economics before Design', () => {
    const p = project();
    const phases = workflowSteps(p);
    const next = handoverNextStep(p, phases, [], buildHandoverChain(p, phases), 'p1');
    expect(next.kind).toBe('open');
    if (next.kind === 'open') {
      expect(next.href).toBe('/project/p1/tco');
      expect(next.headline).toBe('Price the options in Economics');
    }
  });

  test('a draft travels open and named, it does not block', () => {
    const p = project({ generatedCode: 'CLASS zcl_x DEFINITION. ENDCLASS.' });
    const t = travelsOpen(p, factsOf(p, { ...NO_PARTS, code: true }));
    expect(t.map((x) => x.key)).toContain('code-draft');
    expect(travelsOpen(project(), factsOf(project()))).toEqual([]);
  });

  test('six parts counted', () => {
    expect(partsCount({ code: true, tests: true, documentation: true, bpmn: true, spec: true, slides: true })).toBe(6);
    expect(partsCount(NO_PARTS)).toBe(2);
  });

  test('the bar names the six sections in page order, the open count amber', () => {
    expect(Object.values(PAGE_ANCHOR_IDS.delivery)).toEqual(['before-go-live', 'in-the-package', 'proof', 'audit-pack', 'import-into-sap', 'timeline']);
    const bar = deliveryAnchors({ blocking: 2, parts: 4, events: 3 });
    expect(bar.map((a) => a.label)).toEqual(['Before go-live', 'Package', 'Proof', 'Audit pack', 'Import', 'Timeline']);
    expect(bar[0]).toMatchObject({ count: '2', tone: 'open' });
  });
});

test.describe('the page', () => {
  const src = read(PAGE);

  test('one page for every reader, the answer card, then the bar, then the sections', () => {
    expect(src).toContain('view="one-page"');
    const card = src.indexOf('<AnswerCard');
    const bar = src.indexOf('<PageAnchorBar');
    expect(card).toBeGreaterThan(-1);
    expect(bar).toBeGreaterThan(card);
    let last = bar;
    for (const id of Object.values(PAGE_ANCHOR_IDS.delivery)) {
      const at = src.indexOf(`id="${id}"`);
      expect(at, id).toBeGreaterThan(last);
      last = at;
    }
    // The old pieces are gone: the KPI tiles, the status line, the two chains, the metaline.
    for (const gone of ['DeliveryFacets', 'DeliveryStatusLine', 'DeliveryChainBoxes', 'DeliveryMetaline', 'handoverFacets(', 'CcProvenanceChip', 'gap-0.5'])
      expect(src, gone).not.toContain(gone);
  });

  test('the bundle is a review version until nothing blocks; there is no ZIP button with nothing to put in it', () => {
    expect(src).toContain("answer.verdict === 'yes' ? 'Download the package' : 'Download the review version'");
    expect(src).toMatch(/\{somethingToPackage \? \(\s*<CcButton/);
  });

  test('presentation only: the pack is still built and sealed by the same calls', () => {
    expect(src).toContain('generateAuditPack(project, idToken)');
    expect(src).toContain('readSeal(projectId as string, project.activeRunId ?? null, downloadStartedAt, previousExportedAt)');
    expect(src).toContain('finishDeliveryPackage({');
  });
});

test.describe('the pieces, rendered', () => {
  async function load<T>(rel: string): Promise<T> {
    const name = rel.replace(/[\\/]/g, '_').replace(/\.tsx?$/, '');
    const out = path.join(OUT, `${name}.cjs`);
    await build({
      entryPoints: [path.join(ROOT, rel)],
      outfile: out,
      bundle: true,
      format: 'cjs',
      platform: 'node',
      jsx: 'automatic',
      external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
      alias: { '@': ROOT },
      logLevel: 'silent',
    });
    return require(out) as T;
  }
  type Mod = typeof import('../components/delivery/DeliveryObjectPage');
  const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

  test('the proof table: grouped, every statement marked, family chips for signed and yours', async () => {
    const { ProofTable } = await load<Mod>('components/delivery/DeliveryObjectPage.tsx');
    const p = project({ approvedByArchitect: true, targetArchitecture: 'cap', approvedBy: 'owner@example.com' });
    const html = renderToStaticMarkup(React.createElement(ProofTable, { rows: proofRows(p, factsOf(p)) }));
    const text = plain(html);
    for (const s of ['Signed by the server', 'Your word', 'Not signed', 'Never signed', 'The findings of the analysis'])
      expect(text).toContain(s);
    expect(html.match(/data-proof-row="/g)?.length).toBe(12);
    expect(html).toContain('data-family-chip="signed"');
    expect(html).toContain('data-family-chip="yours"');
    expect(html).not.toContain('data-provenance=');
  });

  test('before go-live: three groups; nothing blocking says so', async () => {
    const { BeforeGoLive } = await load<Mod>('components/delivery/DeliveryObjectPage.tsx');
    const html = renderToStaticMarkup(
      React.createElement(BeforeGoLive, {
        blocking: [{ key: 'tests', text: 'An executed test suite', where: 'Testing', href: '/project/p1/testing' }],
        travels: [{ key: 'code-draft', title: 'The code is a draft, not activated', detail: 'STATUS.md says so.' }],
        empty: 'Nothing.',
        yours: 'Activation, transport and go-live.',
      }),
    );
    const text = plain(html);
    for (const s of ['Before handover', 'blocks it', 'Travels open, named', 'does not block the handover', 'Activation, transport and go-live.'])
      expect(text).toContain(s);
    expect(html).toContain('data-still-needed-item="tests"');
  });
});
