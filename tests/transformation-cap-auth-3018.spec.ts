import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { cdsCompileCandidate } from '../lib/transformation/cds-compile';
import { capScopesOf } from '../lib/transformation/cap-shell';
import { readEngineFacts } from '../lib/transformation/unit-plan';
import { withTrace } from '../lib/transformation/trace';
import { ROOT } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.18 item 14, second part: the CAP package carries authorization (scaffold version 18). Until 17 its
 * xs-security.json held no scope and srv/service.cds no @requires, so any user of the subaccount could call the
 * action; the original's check itself stays in srv/lib/authority.ts, failing closed. Now each authorization object
 * and activity of the original's AUTHORITY-CHECKs is a scope in one role template, and the service requires it.
 *
 * Checked by hand against @sap/cds 10.1.1 (`cds serve all --with-mocks --in-memory`, NODE_ENV=development, the trial
 * manifest's command) on the freight package: no credentials 401, mock user bob 403, alice reaches the core.
 * Server-free.
 */

const FREIGHT = path.join(ROOT, 'public', 'starter-examples', 'Z_SD_FREIGHT_RATE_CHECK.abap');
const LEGACY_1000 = path.join(ROOT, 'public', 'starter-examples', 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');
const NO_CHECKS = path.join(ROOT, 'tests', 'fixtures', 'transformation', 'sd-shape.abap');
const read = (f: string) => fs.readFileSync(f, 'utf8');

function prepared(source: string): EngineLedPrepared {
  const p = prepareEngineLed({ source, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}
const fileOf = (p: EngineLedPrepared, rel: string) => p.scaffold.files.find((f) => f.path === rel)!.content;

test.describe('the freight example: AUTHORITY-CHECK OBJECT V_LIKP_VST, ACTVT 03 (L90)', () => {
  test('a scope and a role template in xs-security.json, @requires on the service, the mock user holds it', () => {
    const p = prepared(read(FREIGHT));
    const xs = JSON.parse(fileOf(p, 'xs-security.json'));
    // Before: scopes: [], 'role-templates': [].
    expect(xs.scopes).toEqual([{ name: '$XSAPPNAME.V_LIKP_VST_03', description: "Z_SD_FREIGHT_RATE_CHECK: AUTHORITY-CHECK OBJECT 'V_LIKP_VST' ACTVT '03' (L90)" }]);
    expect(xs['role-templates']).toEqual([{ name: 'Runner', description: "Runs Z_SD_FREIGHT_RATE_CHECK: the scopes of the original's AUTHORITY-CHECKs", 'scope-references': ['$XSAPPNAME.V_LIKP_VST_03'] }]);
    const service = fileOf(p, 'srv/service.cds');
    expect(service).toMatch(/\n@requires: 'V_LIKP_VST_03'\nservice ZSdFreightRateCheckService \{/);
    const pkg = JSON.parse(fileOf(p, 'package.json'));
    expect(pkg.cds.requires['[development]']).toEqual({ auth: { kind: 'mocked', users: { alice: { roles: ['V_LIKP_VST_03'] } } } });
    expect(pkg.cds.requires['[production]'].auth).toBe('xsuaa');
    // The annotated service still compiles without a finding.
    const cds = cdsCompileCandidate(p.scaffold.files);
    expect(cds.ran, cds.ran ? '' : cds.reason).toBe(true);
    if (cds.ran) expect(cds.findings, JSON.stringify(cds.findings)).toEqual([]);
  });

  test('TRACE.md tells (STATUS.md writes the same sentence) the deploying admin what to assign, and the trial how to call', () => {
    const p = prepared(read(FREIGHT));
    const trace = withTrace(p.plan, p.scaffold, p.scaffold.files, []).files.find((f) => f.path === 'TRACE.md')!.content;
    const words = 'The deploying admin creates a role collection from the role template Runner and assigns it to the users who may run the program';
    expect(trace).toContain('- Authorization on SAP BTP: xs-security.json declares a scope for each authorization object and activity the original checks on every run (V_LIKP_VST_03) in the role template Runner');
    expect(trace).toContain(words);
    expect(trace).toContain('call with basic auth as alice, no password');
    // STATUS.md of the delivery package writes the same sentence, read from the package's xs-security.json.
    const delivery = fs.readFileSync(path.join(ROOT, 'lib', 'delivery-package.ts'), 'utf8');
    expect(delivery).toContain('if (inputs.capAuthorization) lines.push(capAuthorizationWords(inputs.capAuthorization)');
  });
});

test('the 1,000-line example: V_VBAK_VKO 03 (L200) every run passes is the scope; 02 (L208, inside IF p_upd) stays in the code', () => {
  const scopes = capScopesOf(readEngineFacts(read(LEGACY_1000)));
  expect(scopes.map((s) => [s.name, s.lines, s.mandatory])).toEqual([
    ['V_VBAK_VKO_03', [200], true],
    ['V_VBAK_VKO_02', [208], false],
  ]);
  const p = prepared(read(LEGACY_1000));
  const service = fileOf(p, 'srv/service.cds');
  // Before (owner decision 18.10.2026): @requires: ['V_VBAK_VKO_03', 'V_VBAK_VKO_02'] — any one of them let a caller in.
  expect(service).toContain("\n@requires: 'V_VBAK_VKO_03'\n");
  expect(service).toContain('// @cc-code-check V_VBAK_VKO_02 (L208): checked in the code, not a service scope');
  const xs = JSON.parse(fileOf(p, 'xs-security.json'));
  expect(xs.scopes.map((s: { name: string }) => s.name)).toEqual(['$XSAPPNAME.V_VBAK_VKO_03']);
  expect(JSON.parse(fileOf(p, 'package.json')).cds.requires['[development]'].auth.users.alice.roles).toEqual(['V_VBAK_VKO_03']);
  const trace = withTrace(p.plan, p.scaffold, p.scaffold.files, []).files.find((f) => f.path === 'TRACE.md')!.content;
  expect(trace).toContain('Checked in the code, not a service scope (the original checks them on some paths only; srv/lib/authority.ts checks each where the original does, failing closed until you map it): V_VBAK_VKO_02 (L208).');
});

test('a fixture with one mandatory and two branch checks: inside an IF, and in a routine performed inside an IF', () => {
  const source = [
    'REPORT zauth_mix.',
    "PARAMETERS: p_werks TYPE c LENGTH 4 DEFAULT '1000',",
    "            p_upd AS CHECKBOX DEFAULT ' '.",
    'START-OF-SELECTION.',
    '  PERFORM check_display.',
    '  IF p_upd = abap_true.',
    '    PERFORM check_change.',
    '  ENDIF.',
    '  PERFORM run.',
    'FORM check_display.',
    "  AUTHORITY-CHECK OBJECT 'M_MATE_WRK' ID 'WERKS' FIELD p_werks ID 'ACTVT' FIELD '03'.",
    '  IF sy-subrc <> 0.',
    "    MESSAGE 'No display authorization' TYPE 'E'.",
    '  ENDIF.',
    'ENDFORM.',
    'FORM check_change.',
    "  AUTHORITY-CHECK OBJECT 'M_MATE_WRK' ID 'WERKS' FIELD p_werks ID 'ACTVT' FIELD '02'.",
    '  IF sy-subrc <> 0.',
    "    MESSAGE 'No change authorization' TYPE 'E'.",
    '  ENDIF.',
    'ENDFORM.',
    'FORM run.',
    '  IF p_werks IS NOT INITIAL.',
    "    AUTHORITY-CHECK OBJECT 'M_MATE_STA' ID 'ACTVT' FIELD '03'.",
    '  ENDIF.',
    "  WRITE / 'done'.",
    'ENDFORM.',
    '',
  ].join('\n');
  expect(capScopesOf(readEngineFacts(source)).map((s) => [s.name, s.mandatory])).toEqual([
    ['M_MATE_WRK_03', true],
    ['M_MATE_WRK_02', false],
    ['M_MATE_STA_03', false],
  ]);
  const p = prepared(source);
  expect(fileOf(p, 'srv/service.cds')).toContain("\n@requires: 'M_MATE_WRK_03'\n");
  expect(JSON.parse(fileOf(p, 'xs-security.json')).scopes.map((s: { name: string }) => s.name)).toEqual(['$XSAPPNAME.M_MATE_WRK_03']);
  const cds = cdsCompileCandidate(p.scaffold.files);
  expect(cds.ran, cds.ran ? '' : cds.reason).toBe(true);
  if (cds.ran) expect(cds.findings, JSON.stringify(cds.findings)).toEqual([]);
  // Only branch checks: no scope, an authenticated user.
  const branchOnly = source.replace('  PERFORM check_display.\n', '');
  const q = prepared(branchOnly);
  expect(fileOf(q, 'srv/service.cds')).toContain("\n@requires: 'authenticated-user'\n");
  expect(JSON.parse(fileOf(q, 'xs-security.json')).scopes).toEqual([]);
});

test('no AUTHORITY-CHECK: an authenticated user is required, no scope, no mock roles', () => {
  const p = prepared(read(NO_CHECKS));
  expect(fileOf(p, 'srv/service.cds')).toContain("@requires: 'authenticated-user'");
  const xs = JSON.parse(fileOf(p, 'xs-security.json'));
  expect(xs.scopes).toEqual([]);
  expect(xs['role-templates']).toEqual([]);
  expect(JSON.parse(fileOf(p, 'package.json')).cds.requires['[development]']).toBeUndefined();
  const trace = withTrace(p.plan, p.scaffold, p.scaffold.files, []).files.find((f) => f.path === 'TRACE.md')!.content;
  expect(trace).toContain("srv/service.cds requires an authenticated user (@requires: 'authenticated-user')");
});
