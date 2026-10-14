import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import type { Project } from '../lib/types';
import type { HandoverProject } from '../lib/handover';
import { sha256Hex } from '../lib/artefact-digest';
import { testingClosureBasis, workflowSteps } from '../lib/workflow-steps';
import { abapCheck } from '../lib/transformation/abap-check';
import { abaplintPackageCheck, withAbaplint } from '../lib/transformation/abaplint-check';
import { ABAPLINT_CONFIG, abaplintConfigJson } from '../lib/transformation/abaplint-config';
import { SAP_STUB_FILES } from '../lib/transformation/abap-sap-stubs';
import { ABAP_CASES_NOT_RUN, activationOf, activationStatusPhrase } from '../lib/transformation/check-words';
import { candidateFiles, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { storedGenerationRecord, type EngineLedRecord } from '../lib/transformation/generation-record';
import { createRunnerVerifier, mapAbapFindings, markerSpans } from '../lib/transformation/verify';
import { withTrace } from '../lib/transformation/trace';
import { abapUnfinishedMethods, createDeliveryBundle, finishDeliveryPackage } from '../lib/delivery-package';
import { deliveryFactsOf, ruleFactsOf, scoreFactsOf } from '../lib/delivery-facts';
import { fixture, nodePackage, poDemo, ROOT } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.13, item 1 — honest status first. The SD example's package said
 * "abaplint: 13 reported, 1 failed" and "complete" while abaplint with the
 * package's own abaplint.json reported 107 parser errors (WRITE, MESSAGE,
 * ULINE in ABAP Cloud). What holds now:
 *
 *   - one check, the shipped configuration: parser and syntax errors in the
 *     package's own objects, an SAP object the check cannot see counted apart;
 *   - its errors go back to the function whose fill markers enclose them;
 *   - a package with an error is "generated — not activatable", in the record,
 *     STATUS.md and the manifest, and Testing cannot be closed on it;
 *   - TRACE on the ABAP route points at the ABAP class, never at srv/*.ts.
 *
 * Server-free: abaplint runs in-process, as the routes run it.
 */

const sdPrep = (): EngineLedPrepared => {
  const prep = prepareEngineLed({ source: fixture('sd-shape'), track: 'rap', program: null, decisions: [], contextText: '' });
  if (!prep.ok) throw new Error(prep.reason);
  return prep;
};

/** Every function written with a body that parses; the first one prints with WRITE and MESSAGE, as the SD fills did. */
function sdPackage(prep: EngineLedPrepared, broken: boolean) {
  const bodies = new Map<string, string>(prep.fillUnits.map((u) => [u.unitId, 'RETURN.']));
  const first = prep.fillUnits[0].unitId;
  if (broken) bodies.set(first, "WRITE / 'Claims checked'.\n    MESSAGE 'Done' TYPE 'I'.");
  return { first, files: candidateFiles(prep, bodies) };
}

test.describe('the activation check runs with the configuration the package ships', () => {
  test('the delivered abaplint.json runs the parser and the syntax check, with the SAP stubs as its dependency', () => {
    const json = JSON.parse(abaplintConfigJson());
    expect(json).toEqual(JSON.parse(JSON.stringify(ABAPLINT_CONFIG)));
    expect(json.rules.parser_error).toBe(true);
    expect(json.rules.check_syntax).toBe(true);
    expect(json.rules.unknown_types).toBe(true);
    expect(json.dependencies).toEqual([{ folder: '/checks/sap-stubs', files: '/*.*' }]);
    expect(SAP_STUB_FILES.map((f) => f.object)).toEqual(['CX_ROOT', 'CX_STATIC_CHECK', 'CX_DYNAMIC_CHECK', 'CX_NO_CHECK', 'CL_ABAP_BEHAVIOR_HANDLER']);
  });

  test('the scaffold is activatable; references to SAP objects it cannot see are counted apart, never as errors', () => {
    for (const source of [fixture('sd-shape'), poDemo()]) {
      const prep = prepareEngineLed({ source, track: 'rap', program: null, decisions: [], contextText: '' });
      if (!prep.ok) throw new Error(prep.reason);
      const r = abapCheck(prep.scaffold.files);
      expect(r.ran).toBe(true);
      if (!r.ran) return;
      expect(r.activation).toMatchObject({ config: 'shipped', parserErrors: 0, syntaxErrors: 0, activatable: true });
      expect(r.activation.abaplint).toMatch(/^\d+\.\d+\.\d+$/);
      for (const f of r.findings.filter((x) => x.kind === 'unresolved')) expect(f.path).toMatch(/_job(?:_setup)?\.clas\.abap$|locals_imp\.abap$/);
    }
  });

  test('a WRITE and a MESSAGE in a RAP class are parser errors: the package is not activatable, and says so', () => {
    const prep = sdPrep();
    const { files } = sdPackage(prep, true);
    const r = abapCheck(files);
    expect(r.ran).toBe(true);
    if (!r.ran) return;
    const a = r.activation;
    expect(a.parserErrors).toBeGreaterThanOrEqual(2);
    expect(a.activatable).toBe(false);
    expect(r.findings.filter((f) => f.kind === 'parser').every((f) => f.path.endsWith('_logic.clas.abap'))).toBe(true);
    expect(activationStatusPhrase(a)).toMatch(/^generated — not activatable: \d+ parser errors?, \d+ syntax errors? \(abaplint \d+\.\d+\.\d+, shipped config\)$/);
    // A stored record cannot call itself activatable with errors on it.
    expect(activationOf({ ...a, activatable: true })!.activatable).toBe(false);
  });

  test('a syntax error in the package’s own objects counts too: a call of a method the class does not have', () => {
    const prep = sdPrep();
    const bodies = new Map<string, string>(prep.fillUnits.map((u) => [u.unitId, 'RETURN.']));
    bodies.set(prep.fillUnits[0].unitId, 'me->no_such_method( ).');
    const r = abapCheck(candidateFiles(prep, bodies));
    expect(r.ran && r.activation.parserErrors).toBe(0);
    expect(r.ran && r.activation.syntaxErrors).toBeGreaterThanOrEqual(1);
    expect(r.ran && r.activation.activatable).toBe(false);
  });
});

test.describe('the errors are repair reasons of the function that holds them', () => {
  test('mapped by the fill markers, named by the line of the body', () => {
    const prep = sdPrep();
    const { first, files } = sdPackage(prep, true);
    const r = abapCheck(files);
    if (!r.ran) throw new Error(r.reason);
    const failures = mapAbapFindings(r.activation.findings, markerSpans(files));
    const mine = failures.filter((f) => f.unitId === first);
    expect(mine).toHaveLength(1);
    expect(mine[0].check).toBe('abap');
    expect(mine[0].failure).toMatch(/cannot activate this body — \d+ errors?: body line 1 — parser error: /);
    expect(failures.filter((f) => f.unitId === null)).toEqual([]);
  });

  test('the verifier reads the route’s activation check, counts it and hands its failures to the orchestrator', async () => {
    const prep = sdPrep();
    const { first } = sdPackage(prep, true);
    let told: unknown = 'not told';
    const verify = createRunnerVerifier({
      candidate: (bodies) => candidateFiles(prep, bodies),
      units: prep.fillUnits.map((u) => ({ unitId: u.unitId, rules: [] })),
      onActivation: (a) => {
        told = a;
      },
      runOnRunner: async (files) => {
        const r = abapCheck(files);
        return {
          mode: 'verify',
          abap: r.ran ? { ran: true, activation: r.activation } : { ran: false, reason: r.reason },
          engine: { ran: false, reason: ABAP_CASES_NOT_RUN },
          probes: { ran: false, reason: 'not here' },
        };
      },
    });
    const bodies = new Map<string, string>(prep.fillUnits.map((u) => [u.unitId, 'RETURN.']));
    bodies.set(first, "WRITE / 'x'.");
    const out = await verify(bodies, { round: 0, signal: new AbortController().signal });
    const count = out.checks.find((c) => c.kind === 'abap');
    expect(count).toMatchObject({ kind: 'abap', failed: 1, notRun: 0 });
    expect(out.failures.find((f) => f.check === 'abap')?.unitId).toBe(first);
    expect(out.notRun.find((n) => n.kind === 'cases')?.reason).toBe(ABAP_CASES_NOT_RUN);
    expect((told as { activatable: boolean }).activatable).toBe(false);

    bodies.set(first, 'RETURN.');
    const clean = await verify(bodies, { round: 1, signal: new AbortController().signal });
    expect(clean.checks.find((c) => c.kind === 'abap')).toMatchObject({ failed: 0 });
    expect(clean.failures.filter((f) => f.check === 'abap')).toEqual([]);
  });

  test('the verify route checks an ABAP candidate itself and never hands it to the Node runner', () => {
    const route = fs.readFileSync(path.join(ROOT, 'app', 'api', 'run-tests', 'route.ts'), 'utf8');
    const head = route.slice(route.indexOf('async function verifyCandidateResponse'));
    expect(head.indexOf('if (isAbapPackage(candidate))')).toBeGreaterThan(0);
    expect(head.indexOf('if (isAbapPackage(candidate))')).toBeLessThan(head.indexOf("resolveRunnerTarget('mock'"));
    expect(head).toContain('engine: { ran: false, reason: ABAP_CASES_NOT_RUN }');
  });
});

/* ------------------------------------------------ the stored package and its words */

const ENGINE = (prep: EngineLedPrepared): EngineLedRecord => ({
  status: 'complete',
  units: prep.fillUnits.length,
  written: prep.fillUnits.length,
  repaired: 0,
  notWritten: [],
  failing: [],
  checks: [],
  notRun: [],
  scaffoldFindings: [],
  callsUsed: 3,
  budget: 10,
  rounds: 0,
  stop: 'passed',
  scaffoldVersion: prep.scaffold.version,
  scaffoldDigest: prep.scaffold.digest,
  planDigest: prep.plan.digest,
});

function abapProject(prep: EngineLedPrepared, broken: boolean, legacyRecord = false): HandoverProject {
  const { files } = sdPackage(prep, broken);
  const traced = withTrace(prep.plan, prep.scaffold, files, prep.fillUnits.map((u) => ({ regionId: u.unitId, state: 'model' as const }))).files;
  const code = JSON.stringify(traced.map((f) => ({ path: f.path, content: f.content })));
  const lint = abaplintPackageCheck(traced);
  // A record stored before 3.0.13: the parse only, no activation check.
  const abaplint = legacyRecord ? { ...lint, activation: undefined } : lint;
  const engine = legacyRecord ? { ...ENGINE(prep), checks: [{ kind: 'abaplint', total: 13, failed: 1 }] } : withAbaplint(ENGINE(prep), lint);
  const source = fixture('sd-shape');
  return {
    id: 'p-sd',
    name: 'SD case',
    userId: 'owner-uid',
    legacyCode: source,
    activeRunId: 'run-sd-0001',
    extensibilityRoute: 'In-App (ABAP Cloud)',
    s4Deployment: 'private',
    analyzerVersion: 'v3.0.13',
    solutionDesign: '# RAP',
    approvedByArchitect: true,
    analysis: JSON.stringify({ cleanCoreScore: 80 }),
    generatedCode: code,
    testSuite: { code: 'CLASS ltc DEFINITION FOR TESTING. ENDCLASS.' },
    testCases: [{ id: 'TC_01', name: 'Case 1', category: 'Unit' }],
    generationBinding: { path: 'engine-led', engine, basis: [], fallbackReason: null, elapsedMs: 1000, contextDigest: null, ...(legacyRecord ? { abaplint: JSON.parse(JSON.stringify(abaplint)) } : { abaplint }) },
    auditMetadata: {
      inputFingerprint: { sha256: sha256Hex(source), fileName: 'zsd_case.abap', lineCount: 10, byteSize: source.length, uploadedAt: '2026-10-14T08:00:00.000Z', objectType: 'Report' },
      modelCard: { provider: null, model: null, modelParticipation: 'none', engineVersion: 'v3.0.13', byokUsed: false },
    },
  } as unknown as HandoverProject;
}

function delivered(p: HandoverProject) {
  const facts = deliveryFactsOf(p, {
    phases: workflowSteps(p),
    rules: ruleFactsOf(null as never),
    score: scoreFactsOf(p, null),
    generatedAt: '2026-10-14T12:00:00.000Z',
    appVersion: 'v3.0.13',
    referenceSection: '',
    documentationFromEngine: true,
  });
  const bundle = createDeliveryBundle();
  for (const f of JSON.parse(p.generatedCode as string) as Array<{ path: string; content: string }>) bundle.file(f.path, f.content, 'generated');
  bundle.file('abaplint.json', abaplintConfigJson());
  const out = finishDeliveryPackage({ entries: bundle.entries, facts, layout: 'package' });
  const file = (name: string) => out.files.find((f) => f.path === name)?.content ?? null;
  return { out, file, manifest: JSON.parse(file('manifest.json')!) };
}

test.describe('a package that cannot be activated says so everywhere', () => {
  test('the server’s record: not-activatable, whatever the page sent', () => {
    const prep = sdPrep();
    const p = abapProject(prep, true);
    const rec = storedGenerationRecord(p.generationBinding);
    expect(rec?.engine?.status).toBe('not-activatable');
    expect(rec?.activation?.activatable).toBe(false);
    const ok = storedGenerationRecord(abapProject(prep, false).generationBinding);
    expect(ok?.engine?.status).toBe('complete');
    expect(ok?.activation?.activatable).toBe(true);
  });

  test('STATUS.md, checks/abaplint.md and the manifest: "generated — not activatable" with the counts, the logic class open', () => {
    const prep = sdPrep();
    const { file, manifest } = delivered(abapProject(prep, true));
    const status = file('STATUS.md')!;
    expect(status).toMatch(/The generation is \*\*generated — not activatable: \d+ parser errors?, \d+ syntax errors? \(abaplint \d+\.\d+\.\d+, shipped config\)\*\*\./);
    expect(status).toContain('`checks/abaplint.md`');
    expect(status).not.toContain('The generation is **complete**');
    expect(status).not.toContain('reported, 1 failed');
    expect(file('checks/abaplint.md')).toMatch(/- parser `src\/\w+_logic\.clas\.abap:\d+` parser_error/);
    expect(JSON.parse(file('checks/abaplint.json')!)).toMatchObject({ format: 'clean-core.abaplint/1', activatable: false });
    for (const s of SAP_STUB_FILES) expect(file(`checks/sap-stubs/${s.name}`)).toBe(s.content);
    const logic = manifest.files.find((f: { path: string }) => /_logic\.clas\.abap$/.test(f.path));
    expect(logic.status).toBe('open');
    expect(logic.note).toContain('abaplint finds parser or syntax errors in it');
    expect(manifest.capabilities.find((c: { key: string }) => c.key === 'abap-objects').status).toBe('open');
  });

  test('an access method that only raises is open, never implemented', () => {
    const prep = sdPrep();
    const access = prep.scaffold.files.find((f) => /_access\.clas\.abap$/.test(f.path));
    expect(access, 'the scaffold writes an access class').toBeTruthy();
    const unfinished = abapUnfinishedMethods(access!.content);
    if (unfinished.length > 0) expect(unfinished.every((m) => m.why === 'raises' || m.why === 'empty')).toBe(true);
    const lone = 'CLASS zcl_x IMPLEMENTATION.\n  METHOD read_claims.\n    " @cc-open ACCESS: bind to a released API.\n    RAISE EXCEPTION NEW zcx_x_access( object = `ZCLAIMS` ).\n  ENDMETHOD.\n  METHOD display_alv.\n  ENDMETHOD.\n  METHOD calc.\n    rv = 1.\n  ENDMETHOD.\n  METHOD u01.\n    RAISE EXCEPTION NEW zcx_x_nofill( unit = `U01` ).\n  ENDMETHOD.\nENDCLASS.\n';
    expect(abapUnfinishedMethods(lone)).toEqual([
      { method: 'read_claims', why: 'raises' },
      { method: 'display_alv', why: 'empty' },
      { method: 'u01', why: 'stub' },
    ]);
  });

  test('Testing cannot be closed on it, and says why; an activatable package or one stored before is not refused for it', () => {
    const prep = sdPrep();
    const refused = testingClosureBasis(abapProject(prep, true) as unknown as Project);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.code).toBe('not-activatable');
    expect(!refused.ok && refused.error).toMatch(/^Testing cannot be closed: the stored package is generated — not activatable: \d+ parser errors?/);
    const clean = testingClosureBasis(abapProject(prep, false) as unknown as Project);
    expect(clean.ok && clean.basis.kind).toBe('no-runner');
    const legacy = testingClosureBasis(abapProject(prep, true, true) as unknown as Project);
    expect(legacy.ok && legacy.basis.kind).toBe('no-runner');
    const card = fs.readFileSync(path.join(ROOT, 'components', 'testing', 'TestingClosureCard.tsx'), 'utf8');
    expect(card).toContain("basis.code === 'not-activatable'");
  });

  test('a record stored before 3.0.13 keeps its own words — never re-labelled', () => {
    const prep = sdPrep();
    const p = abapProject(prep, true, true);
    const rec = storedGenerationRecord(p.generationBinding);
    expect(rec?.activation).toBeUndefined();
    expect(rec?.engine?.status).toBe('complete');
    const status = delivered(p).file('STATUS.md')!;
    expect(status).toContain('The generation is **complete**');
    expect(status).not.toContain('not activatable');
  });
});

test.describe('TRACE on the ABAP route points at the ABAP class', () => {
  test('every unit lives in a .abap file, with its RAP method name; the Node route is unchanged', () => {
    const prep = sdPrep();
    const { files } = sdPackage(prep, false);
    const { trace, files: out } = withTrace(prep.plan, prep.scaffold, files, prep.fillUnits.map((u) => ({ regionId: u.unitId, state: 'model' as const })));
    for (const u of trace.units) {
      expect(u.file, u.unitId).toMatch(/^src\/\w+\.clas\.abap$/);
      expect(u.fn).toBe(prep.plan.units.find((p) => p.id === u.unitId)!.rapName);
    }
    const md = out.find((f) => f.path === 'TRACE.md')!.content;
    expect(md).not.toMatch(/srv\/|\.ts\)/);
    const node = nodePackage(fixture('sd-shape'));
    const nodeTrace = JSON.parse(node.files.find((f) => f.path === 'traceability.json')!.content) as { units: Array<{ file: string }> };
    expect(nodeTrace.units.every((u) => u.file.endsWith('.ts'))).toBe(true);
  });
});
