import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import {
  PUBLIC_TARGET_ASSUMPTION,
  PUBLIC_TARGET_RULE_ASSUMPTION,
  guiFileDirection,
  routeExtensibility,
} from '../lib/abap/extensibility-router';
import { extractCodeInventory, extractDataCoupling, recommendArchitecture } from '../lib/abap/code-assessment';
import { READ_CLAIMS_FROM, readClaimsApply } from '../lib/abap/read-claims-gate';
import { successorInProgram } from '../lib/abap/catalog-service';
import { APP_VERSION } from '../lib/version';

/**
 * Roadmap 3.0.18, item 4a — the engine says only what it read (QA review of
 * 73b8cad63d3e). Each correction from `READ_CLAIMS_FROM` on; a run of an
 * earlier engine keeps the words it signed.
 *
 * Server-free.
 */

const OLD = 'v3.0.17';
const NEW = `v${READ_CLAIMS_FROM}`;
const ROOT = path.join(__dirname, '..');

const route = (code: string, deployment: 'public' | 'private', engine: string) =>
  routeExtensibility(buildAbapEvidence(code, 'zx.abap', deployment, undefined, engine), deployment, engine);

test('the gate opens at 3.0.18 and stays shut for v3.0.17 and for a run without a version', () => {
  expect(readClaimsApply(NEW)).toBe(true);
  expect(readClaimsApply('v3.1.0')).toBe(true);
  expect(readClaimsApply(OLD)).toBe(false);
  expect(readClaimsApply(null)).toBe(false);
  expect(readClaimsApply(undefined)).toBe(false);
});

test.describe('a file-picker dialog is no completed transfer (85a961a86168 and its carries)', () => {
  const OPEN_ONLY = [
    'REPORT zfs.',
    'DATA lt_files TYPE filetable.',
    'DATA lv_rc TYPE i.',
    'cl_gui_frontend_services=>file_open_dialog( CHANGING file_table = lt_files rc = lv_rc ).',
    '',
  ].join('\n');
  const OPEN_AND_UPLOAD = `${OPEN_ONLY}CALL FUNCTION 'GUI_UPLOAD' EXPORTING filename = 'x' TABLES data_tab = lt_files.\n`;

  test('a dialog-only finding reads as a path dialog, an upload as an upload', () => {
    const [dialog] = buildAbapEvidence(OPEN_ONLY, 'zfs.abap', 'private', undefined, NEW).findings.filter((f) => f.kind === 'gui-download');
    expect(guiFileDirection(dialog, true)).toBe('dialog');
    expect(guiFileDirection(dialog)).toBe('upload');
    expect(guiFileDirection({ objectName: 'CL_GUI_FRONTEND_SERVICES', snippet: 'cl_gui_frontend_services=>file_save_dialog( ).' }, true)).toBe('dialog');
    expect(guiFileDirection({ objectName: 'GUI_UPLOAD', snippet: "CALL FUNCTION 'GUI_UPLOAD'" }, true)).toBe('upload');
    expect(guiFileDirection({ objectName: 'GUI_DOWNLOAD', snippet: "CALL FUNCTION 'GUI_DOWNLOAD'" }, true)).toBe('download');
  });

  test('the rationale says a path is chosen, not that a file is read', () => {
    const r = route(OPEN_ONLY, 'private', NEW).rationale;
    expect(r).toContain('The frontend file dialogs (FILE_OPEN_DIALOG, from line 4) let the user choose a file path; the dialog itself reads or writes no file');
    expect(r).not.toContain("reads a file from the user's PC");
    // An actual upload beside it is still said as an upload.
    const both = route(OPEN_AND_UPLOAD, 'private', NEW).rationale;
    expect(both).toContain("The frontend file upload (GUI_UPLOAD, from line 5) reads a file from the user's PC");
    expect(both).toContain('The frontend file dialogs (FILE_OPEN_DIALOG, from line 4)');
  });

  test('a run of v3.0.17 keeps what it signed', () => {
    const r = route(OPEN_ONLY, 'private', OLD).rationale;
    expect(r).toContain("The frontend file upload (CL_GUI_FRONTEND_SERVICES, from line 4) reads a file from the user's PC");
    expect(r).not.toContain('frontend file dialogs');
  });
});

test.describe('a local RFC is no evidence of a released API (809758fb0146 and its carries)', () => {
  // From 3.0.12 the evidence reports no `rfc-call` for a local call at all
  // (`rfcDestinationOf`), so the router's local-RFC sentence speaks of RFC
  // findings an engine before 3.0.12 recorded: evidence of v3.0.11 here.
  const LOCAL = ['REPORT zrfc.', "CALL FUNCTION 'Z_LOCAL_WORK' DESTINATION 'NONE'.", "CALL FUNCTION 'Z_PARALLEL' DESTINATION IN GROUP DEFAULT.", ''].join('\n');
  const evidence = buildAbapEvidence(LOCAL, 'zrfc.abap', 'private', undefined, 'v3.0.11');

  test('the rationale leaves the release status open', () => {
    expect(evidence.findings.filter((f) => f.kind === 'rfc-call')).toHaveLength(2);
    const r = routeExtensibility(evidence, 'private', NEW).rationale;
    expect(r).not.toContain('the called function is reached through a released API');
    expect(r).toContain('Whether the called function is released for ABAP Cloud is not established here');
    expect(r).toContain('parallel processing runs through the released class CL_ABAP_PARALLEL');
  });

  test('a run of v3.0.17 keeps what it signed', () => {
    expect(routeExtensibility(evidence, 'private', OLD).rationale).toContain('In ABAP Cloud the called function is reached through a released API, and parallel processing through the released class CL_ABAP_PARALLEL.');
  });
});

test.describe('a Public Edition target does not assume level A against findings (c2e130b255d1 and its carries)', () => {
  const UNRELEASED = ['REPORT zpub.', "UPDATE mara SET mtart = 'FERT' WHERE matnr = '1'.", ''].join('\n');

  test('the assumption states the target\'s rule, not the code\'s level', () => {
    const a = route(UNRELEASED, 'public', NEW).assumptions;
    expect(a).toContain(PUBLIC_TARGET_RULE_ASSUMPTION);
    expect(a).not.toContain(PUBLIC_TARGET_ASSUMPTION);
    expect(PUBLIC_TARGET_RULE_ASSUMPTION).toContain('selecting the target does not establish that the analysed code meets this');
    expect(PUBLIC_TARGET_RULE_ASSUMPTION).not.toMatch(/custom code uses released APIs only/);
  });

  test('a run of v3.0.17 keeps what it signed', () => {
    expect(route(UNRELEASED, 'public', OLD).assumptions).toContain(PUBLIC_TARGET_ASSUMPTION);
  });

  test('a contract whose run bound no target drops both wordings', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/architecture-contract.ts'), 'utf8');
    expect(src).toContain('a.text !== PUBLIC_TARGET_ASSUMPTION && a.text !== PUBLIC_TARGET_RULE_ASSUMPTION');
  });
});

test.describe('Side-by-Side is not "highly compatible" with a direct SAP-table write (e77bc4837a04 and its carries)', () => {
  const WRITE = ['REPORT zwrite.', "UPDATE mara SET mtart = 'FERT' WHERE matnr = '1'.", ''].join('\n');
  const WRITE_AND_RFC = `${WRITE}CALL FUNCTION 'Z_REMOTE' DESTINATION 'PRD_100'.\n`;

  for (const deployment of ['public', 'private'] as const) {
    test(`${deployment}: no driver — the track names the write and calls nothing read-only`, () => {
      const r = route(WRITE, deployment, NEW);
      const track = r.comparativeAnalysis.sideBySideBTP;
      expect(track.technicalFeasibility).toBe('Partially Compatible');
      expect(track.fitDetails).not.toMatch(/read-only/);
      expect(track.fitDetails).toContain('Moving off the stack does not fix the 1 direct write(s) to SAP standard tables');
      expect(r.checkpoints[3].evaluation).not.toMatch(/Simple reads/);
      expect(r.checkpoints[3].evaluation).toContain('none would make the 1 direct write(s) to SAP standard tables valid');
    });

    test(`${deployment}: a run of v3.0.17 keeps what it signed`, () => {
      const r = route(WRITE, deployment, OLD);
      expect(r.comparativeAnalysis.sideBySideBTP.technicalFeasibility).toBe('Highly Compatible');
      expect(r.comparativeAnalysis.sideBySideBTP.fitDetails).toBe('Feasible, but introduces architectural overhead for simple read-only reports.');
    });
  }

  test('with an outbound RFC the recommended track still names the write to replace', () => {
    const track = route(WRITE_AND_RFC, 'private', NEW).comparativeAnalysis.sideBySideBTP;
    expect(track.technicalFeasibility).toBe('Partially Compatible');
    expect(track.fitDetails).toContain('First, the 1 direct write(s) to SAP standard tables are replaced by');
    expect(route(WRITE_AND_RFC, 'private', OLD).comparativeAnalysis.sideBySideBTP.technicalFeasibility).toBe('Highly Compatible');
  });

  test('a program without a write keeps its words', () => {
    const r = route('REPORT zread.\nSELECT * FROM mara INTO TABLE @DATA(lt).\n', 'public', NEW);
    expect(r.comparativeAnalysis.sideBySideBTP.technicalFeasibility).toBe('Highly Compatible');
    expect(r.comparativeAnalysis.sideBySideBTP.fitDetails).toBe('Feasible, but introduces architectural overhead for simple read-only reports.');
  });
});

test.describe('an SAP-owned slash namespace is not a customer module (e742385fcfac and its carries)', () => {
  const program = (...modules: string[]) => ['REPORT zidoc.', ...modules.map((m) => `CALL FUNCTION '${m}' EXPORTING x = 1.`), ''].join('\n');
  const why = (code: string, engine: string) =>
    recommendArchitecture(code, extractCodeInventory(code), extractDataCoupling(code, engine), undefined, engine).justification;

  test('a /namespace/ module is no one\'s by name', () => {
    const j = why(program('/SAPAPO/CIF_IDOC_INBOUND'), NEW);
    expect(j).not.toMatch(/customer or partner namespace/);
    expect(j).not.toMatch(/IDoc function modules are called/);
    expect(j).toContain("/SAPAPO/CIF_IDOC_INBOUND is in a reserved namespace, which can belong to SAP, to a partner or to the customer; the name does not say whose it is, so whether SAP's classification file lists it, and at which level, is not established here.");
  });

  test('Z and Y stay the customer\'s, and SAP\'s module keeps the classification', () => {
    const mixed = why(program('MASTER_IDOC_DISTRIBUTE', 'Y_IDOC_POST', '/ACME/SEND_IDOC'), NEW);
    expect(mixed).toMatch(/^IDoc function modules are called \(MASTER_IDOC_DISTRIBUTE\)\./);
    expect(mixed).toContain("Y_IDOC_POST is in the customer namespace, which SAP's classification file does not cover");
    expect(mixed).toContain('/ACME/SEND_IDOC is in a reserved namespace');
    expect(why(program('Z_SEND_IDOC'), NEW)).toContain('Function modules named for IDoc in the customer namespace are called (Z_SEND_IDOC)');
  });

  test('a run of v3.0.17 keeps what it signed', () => {
    expect(why(program('/ACME/SEND_IDOC'), OLD)).toContain('customer or partner namespace are called (/ACME/SEND_IDOC)');
  });
});

test.describe('contextual table advice follows the run\'s engine (966feb41218f and its carries)', () => {
  const PP = ['REPORT zpp.', 'SELECT * FROM aufk INTO TABLE @DATA(lt_aufk).', 'SELECT * FROM afko INTO TABLE @DATA(lt_afko).', ''].join('\n');
  const advice = (code: string, table: string, engine?: string | null) => extractDataCoupling(code, engine).find((e) => e.tableName === table)?.recommendation;

  test('before 3.0.12 the plain mapping stands; from 3.0.12 the production order context applies', () => {
    expect(advice(PP, 'AUFK', 'v3.0.11')).toBe('Use CDS I_InternalOrder');
    expect(advice(PP, 'AUFK', null)).toBe('Use CDS I_InternalOrder');
    expect(advice(PP, 'AUFK', 'v3.0.12')).toContain('Use CDS I_ManufacturingOrder (production order context');
    // Omitted, this engine — what every caller before 3.0.18 got.
    expect(advice(PP, 'AUFK')).toBe(advice(PP, 'AUFK', APP_VERSION));
    expect(advice(PP, 'AUFK')).toContain('I_ManufacturingOrder');
  });
});

test.describe('the catalog service applies contextual successors where a program is known (579d04bb65ff and its carries)', () => {
  test('AUFK beside AFKO is a production order; alone, the plain mapping', () => {
    expect(successorInProgram('AUFK', ['AUFK', 'AFKO'])).toBe('I_ManufacturingOrder');
    expect(successorInProgram('aufk', new Set(['AUFK']))).toBe('I_InternalOrder');
    expect(successorInProgram('NOT_A_TABLE_ANYWHERE', [])).toBeNull();
  });

  test('the Standard fit layer, which asked it with the program\'s tables, is gone (owner decision 22.10.2026)', () => {
    // Its route asked `successorInProgram(object, tablesInProgram)`; the route and its table were removed.
    expect(fs.existsSync(path.join(ROOT, 'app/api/projects/[projectId]/standard-fit/route.ts'))).toBe(false);
  });
});

test('the corrections move no route and no score — over the 300 benchmark cases, both editions', () => {
  const dir = path.join(ROOT, 'tests/prozess-benchmark/cases');
  const moved: string[] = [];
  for (const id of fs.readdirSync(dir).filter((n) => /^BM-\d{3}$/.test(n))) {
    const files = fs.readdirSync(path.join(dir, id)).filter((n) => n.endsWith('.abap')).sort();
    const code = files.map((f) => fs.readFileSync(path.join(dir, id, f), 'utf8')).join('\n');
    for (const deployment of ['public', 'private'] as const) {
      const evidence = buildAbapEvidence(code, `${id}.abap`, deployment, undefined, NEW);
      const before = routeExtensibility(evidence, deployment, OLD);
      const after = routeExtensibility(evidence, deployment, NEW);
      if (before.recommendedRoute !== after.recommendedRoute || before.cleanCoreScore !== after.cleanCoreScore) moved.push(`${id} ${deployment}`);
    }
  }
  expect(moved).toEqual([]);
});
