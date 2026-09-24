import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import {
  applyNaming,
  namingContextOf,
  validateNamingAnswer,
  NAMING_FORMAT_VERSION,
  type ProcessNamingRecord,
} from '../lib/process-naming';
import { buildProcessMapModel } from '../lib/process-map';
import { buildProcessDocumentation, DOCUMENTATION_GAPS } from '../lib/process-documentation-build';
import {
  LEGACY_BLUEPRINT_NOTICE,
  NOT_DETERMINED_LABEL,
  PROCESS_DOCUMENTATION_FORMAT,
  checkProcessDocumentationShape,
  isEngineDocumentation,
  processDocumentationToMarkdown,
  readStoredDocumentation,
  type ProcessDocumentation,
} from '../lib/process-documentation';
import { PROVENANCE, PROVENANCE_VALUES } from '../lib/provenance';
import { sha256Hex } from '../lib/artefact-digest';

/**
 * Roadmap 3.0.5, Weg C — stage 4 writes `documentation` out of the engine.
 *
 * Pure: no server, no browser, no model. The documents are built from the two
 * shipped starter examples the way the page builds them — the BPMN of 2.6, the
 * map of 2.5 with the naming of 2.4 applied — so a derivation that agrees with
 * itself cannot pass here.
 *
 * The acceptance this step exists for is QA24-A10: a rule written after
 * character 1,000 of the source reaches the document. The old generator read
 * `generatedCode.substring(0, 1000)` and could not (known limit L-04).
 */

const ROOT = path.resolve(__dirname, '..');
const EXAMPLES = ['Z_MM_PO_APPROVAL.abap', 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap'] as const;

const read = (file: string) =>
  fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', file), 'utf8').replace(/\r\n/g, '\n');

function mapOf(source: string, fileName: string, record: ProcessNamingRecord | null = null) {
  const bpmn = buildBpmnExportFromSource(source, { processName: fileName, sourceFileName: fileName });
  return buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(source), record), fileName });
}

function documentOf(file: string, record: ProcessNamingRecord | null = null): { source: string; doc: ProcessDocumentation } {
  const source = read(file);
  return { source, doc: buildProcessDocumentation({ source, map: mapOf(source, file, record) }) };
}

/** The 1-based line a character offset falls on. */
const lineAt = (source: string, offset: number) => source.slice(0, offset).split('\n').length;

test.describe('QA24-A10: the whole program reaches the document', () => {
  for (const file of EXAMPLES) {
    test(`${file}: business statements stand far beyond character 1,000`, () => {
      const { source, doc } = documentOf(file);
      const lineOf1000 = lineAt(source, 1000);
      const late = doc.statements.filter((s) => s.anchors[0].lineStart > lineOf1000);
      expect(late.length, 'no statement after character 1,000').toBeGreaterThan(0);
      // Not just past the fence: into the last quarter of the file.
      const lines = source.split('\n').length;
      expect(doc.statements.some((s) => s.anchors[0].lineStart > lines * 0.75)).toBe(true);
      // And every step of the reconstruction, not a sample of it.
      expect(doc.steps.length).toBe(mapOf(source, file).elements.length);
    });
  }

  test('Z_MM_PO_APPROVAL: the 50,000 EUR emergency limit arrives, anchored on its own line', () => {
    const { source, doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    const at = source.indexOf("gv_amount <= '50000.00'");
    expect(at, 'the example moved').toBeGreaterThan(1000);
    const line = lineAt(source, at);
    const sentence = doc.statements.find((s) => s.text.includes('50000.00') && s.anchors.some((a) => a.lineStart === line));
    expect(sentence, 'the limit is not in any business statement').toBeTruthy();
    expect(processDocumentationToMarkdown(doc)).toContain('50000.00');
    // The decision itself is a step, with the same line.
    const decision = doc.steps.find((s) => s.kind === 'Decision' && s.technicalName.includes('50000.00'));
    expect(decision?.anchor?.lineStart).toBe(line);
  });

  test('ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC: the credit block rule at line 300 and after arrives', () => {
    const { source, doc } = documentOf('ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');
    const at = source.indexOf("risk_class = 'BLOCKED'");
    expect(at).toBeGreaterThan(1000);
    const blocked = doc.statements.filter((s) => s.text.includes('BLOCKED'));
    expect(blocked.length).toBeGreaterThan(0);
    for (const s of blocked) expect(s.anchors[0].lineStart).toBeGreaterThan(lineAt(source, 1000));
  });
});

test.describe('every statement names its lines or says why not', () => {
  for (const file of EXAMPLES) {
    test(`${file}: steps, statements, lanes and effects`, () => {
      const { doc } = documentOf(file);
      for (const step of doc.steps) {
        // Exactly one of the two, never both and never neither.
        expect(Boolean(step.anchor) !== Boolean(step.undetermined), `${step.id}`).toBe(true);
        if (step.undetermined) {
          expect(step.undetermined.label).toBe(NOT_DETERMINED_LABEL);
          expect(step.undetermined.reason.length).toBeGreaterThan(10);
        }
        expect(PROVENANCE_VALUES).toContain(step.provenance);
      }
      for (const s of doc.statements) {
        expect(s.anchors.length).toBeGreaterThan(0);
        expect(s.provenance).toBe('reconstructed');
      }
      for (const lane of doc.lanes) {
        expect(lane.provenance).toBe('reconstructed');
        expect(Number.isInteger(lane.anchor.lineStart)).toBe(true);
      }
      for (const r of doc.effects.registrations) expect(Number.isInteger(r.anchor.lineStart)).toBe(true);
      for (const e of doc.effects.events) expect(Number.isInteger(e.anchor.lineStart)).toBe(true);
      // A step's sentence exists and speaks about the step's own lines.
      const byId = new Map(doc.statements.map((s) => [s.id, s]));
      for (const step of doc.steps.filter((s) => s.statementId)) {
        const sentence = byId.get(step.statementId!);
        expect(sentence, `${step.id} names a sentence that is not in the document`).toBeTruthy();
        expect(sentence!.anchors.some((a) => a.lineStart <= step.anchor!.lineEnd && step.anchor!.lineStart <= a.lineEnd)).toBe(true);
      }
    });
  }

  test('Z_MM_PO_APPROVAL: the commits of 2.12 and the authorization lane of 2.16 are in it', () => {
    const { doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    expect(doc.effects.events.map((e) => e.kind)).toContain('commit');
    expect(doc.effects.events.some((e) => e.token.includes('BAPI_TRANSACTION_COMMIT') && e.andWait === true)).toBe(true);
    const authority = doc.lanes.find((l) => l.kind === 'authority');
    expect(authority?.name).toBe('M_BANF_EKG');
    expect(authority?.anchor).toEqual({ lineStart: 108, lineEnd: 110 });
  });
});

test.describe('nothing the code does not give', () => {
  test('no owner, role, KPI, duration or strategic goal is filled in — each is listed as not determined', () => {
    const { doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    expect(doc.notDetermined.map((g) => g.subject)).toEqual(['Process owner', 'Roles', 'KPIs', 'Duration', 'Strategic goal']);
    expect(doc.notDetermined).toEqual(DOCUMENTATION_GAPS);
    // None of the old blueprint's invented fields exists in the new form.
    const json = JSON.stringify(doc);
    for (const field of ['l1_domain', 'l2_group', 'l3_flow', 'l4_tasks', 'strategicGoal', '"owner"', 'kpis', 'estimatedDuration', 'complexity', '"role"', 'technicalMapping']) {
      expect(json, `the document carries ${field}`).not.toContain(field);
    }
  });

  test('without a saved naming there are no business names and no proposed lanes', () => {
    const { doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    expect(doc.naming.state).toBe('not-named');
    expect(doc.proposedLanes).toEqual([]);
    expect(doc.steps.every((s) => s.businessName === null && s.lane === null && s.namingProvenance === null)).toBe(true);
  });

  test('with a saved naming, names and lanes stand beside the technical ones, as a Model proposal', () => {
    const source = read('Z_MM_PO_APPROVAL.abap');
    const ctx = namingContextOf(source);
    const target = ctx.skeleton.nodes.find((n) => n.kind === 'gateway' && n.label.includes('50000.00'))!;
    const validated = validateNamingAnswer(ctx, JSON.stringify({
      names: [{ id: target.id, name: 'Emergency within the limit?' }],
      lanes: [{ name: 'Purchasing group check', authorityCheck: 'ac-1', nodes: [target.id] }],
    }));
    expect(validated.names).toHaveLength(1);
    expect(validated.lanes).toHaveLength(1);
    const record: ProcessNamingRecord = {
      formatVersion: NAMING_FORMAT_VERSION,
      digest: ctx.digest,
      ...validated,
      origin: {
        source: 'model', receipt: 'verified', provider: 'google-gemini', modelId: 'gemini-3-flash-preview',
        byok: false, issuedAt: Date.UTC(2026, 8, 24), textSha256: 'a'.repeat(64),
      },
      namedAt: '2026-09-24T09:00:00.000Z',
    };
    const doc = buildProcessDocumentation({ source, map: mapOf(source, 'Z_MM_PO_APPROVAL.abap', record) });

    const named = doc.steps.filter((s) => s.businessName);
    expect(named).toHaveLength(1);
    expect(named[0].businessName).toBe('Emergency within the limit?');
    expect(named[0].technicalName).toContain('50000.00');
    expect(named[0].namingProvenance).toBe('proposed');
    expect(doc.proposedLanes).toEqual([
      expect.objectContaining({ name: 'Purchasing group check', authorityObject: 'M_BANF_EKG', anchor: { lineStart: 108, lineEnd: 110 }, provenance: 'proposed' }),
    ]);
    const md = processDocumentationToMarkdown(doc);
    expect(md).toContain(`Emergency within the limit? (${named[0].technicalName}) — ${PROVENANCE.proposed.label}`);
  });

  test('a naming made for another source is not applied', () => {
    const source = read('Z_MM_PO_APPROVAL.abap');
    const ctx = namingContextOf(source);
    const validated = validateNamingAnswer(ctx, JSON.stringify({ names: [{ id: ctx.skeleton.nodes[0].id, name: 'Start here' }] }));
    const record = {
      formatVersion: NAMING_FORMAT_VERSION, digest: 'f'.repeat(64), ...validated, origin: null, namedAt: '2026-09-24T09:00:00.000Z',
    } as unknown as ProcessNamingRecord;
    const doc = buildProcessDocumentation({ source, map: mapOf(source, 'x.abap', record) });
    expect(doc.steps.every((s) => s.businessName === null)).toBe(true);
  });
});

test.describe('the stored form', () => {
  test('deterministic: the same source gives the same bytes', () => {
    const a = JSON.stringify(documentOf('Z_MM_PO_APPROVAL.abap').doc);
    const b = JSON.stringify(documentOf('Z_MM_PO_APPROVAL.abap').doc);
    expect(a).toBe(b);
  });

  for (const file of EXAMPLES) {
    test(`${file}: it round-trips through the reader and fits the rules' size limit with room`, () => {
      const { source, doc } = documentOf(file);
      const raw = JSON.stringify(doc);
      // firestore.rules: `documentation.size() < 1000000`. generatedCode carries the Markdown too.
      expect(raw.length).toBeLessThan(400_000);
      expect(processDocumentationToMarkdown(doc).length).toBeLessThan(400_000);
      expect(doc.sourceSha256).toBe(sha256Hex(source));
      const stored = readStoredDocumentation(raw);
      expect(stored.kind).toBe('engine');
      expect(isEngineDocumentation(raw)).toBe(true);
      expect(checkProcessDocumentationShape(JSON.parse(raw))).toEqual({ ok: true, problems: [] });
    });
  }

  test('a blueprint written before 3.0.5 is read as "other", never as an engine document', () => {
    const legacy = JSON.stringify({ l1_domain: { name: 'Order to Cash', owner: 'Sales' }, l4_tasks: [] });
    expect(readStoredDocumentation(legacy)).toEqual({ kind: 'other', raw: legacy });
    expect(readStoredDocumentation('```json\n{"l1_domain":{}}\n```').kind).toBe('other');
    expect(readStoredDocumentation('')).toEqual({ kind: 'none' });
    expect(readStoredDocumentation(undefined)).toEqual({ kind: 'none' });
    expect(isEngineDocumentation(legacy)).toBe(false);
    expect(LEGACY_BLUEPRINT_NOTICE).toContain('1,000 characters');
  });

  test('a tagged document with the wrong shape is refused, with the field named', () => {
    const { doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    const broken = { ...doc, steps: { first: doc.steps[0] } };
    const stored = readStoredDocumentation(JSON.stringify(broken));
    expect(stored.kind).toBe('engine-invalid');
    expect(stored.kind === 'engine-invalid' && stored.problems.join(' ')).toContain('steps');
    const noLines = { ...doc, statements: [{ ...doc.statements[0], anchors: [] }] };
    expect(checkProcessDocumentationShape(noLines).ok).toBe(false);
    expect(JSON.parse(JSON.stringify(doc)).format).toBe(PROCESS_DOCUMENTATION_FORMAT);
  });

  test('the Markdown says where it comes from and carries the gaps', () => {
    const { doc } = documentOf('Z_MM_PO_APPROVAL.abap');
    const md = processDocumentationToMarkdown(doc);
    // Not "no model wrote any of it": the naming stage's names and lanes are
    // model proposals inside the same document (QA review of 4b4586aff273).
    expect(md).toContain('No language model wrote its process structure or its statements.');
    expect(md).not.toContain('No language model wrote any of it');
    expect(md).toContain('business names and lanes from the naming stage are model proposals');
    expect(md).toContain('## Not determined');
    for (const gap of doc.notDetermined) expect(md).toContain(`**${gap.subject}:** ${NOT_DETERMINED_LABEL}`);
    expect(md).toContain('M_BANF_EKG');
    expect(md).not.toMatch(/\bKPI target\b|\bestimated\b/i);
  });
});
