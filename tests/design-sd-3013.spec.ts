import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { formatDesignToMarkdown } from '../lib/markdownFormatter';
import {
  CERTIFIED_SNAPSHOT_NOTE,
  MVCC_REFUSAL,
  alignRapDesignNames,
  designRouteOf,
  postCheckDesign,
  rapDesignNames,
  rapObjectNamesPromptRule,
  readsAtTwoCutoffs,
  refuseMvccClaims,
} from '../lib/design-post-checks';
import { rapShortName } from '../lib/transformation/scaffold-rap';
import { circularReason } from '../lib/design-option-comparison';
import { decisionSummary, deriveDecisionDraft, type DecisionDraftFacts } from '../lib/decision-draft';
import { decisionWeighing } from '../lib/decision-weighing';
import { decisionFactsOf } from '../lib/delivery-facts';
import { buildDecisionRecord, type DeliveryFacts } from '../lib/delivery-package';
import { SELF_DECLARATION } from '../lib/project-decision';
import { developerGuidelinesMarkdown } from '../lib/developer-guidelines';
import { containsAmount } from '../lib/money-honesty';
import type { HandoverProject } from '../lib/handover';

/**
 * Release 3.0.13 — the SD example ZSD_RETURN_CREDIT_RECON (two external
 * reviews of 3.0.12: CR-D7, A03, A04, 2.5). The design export, the developer
 * guidelines and the decision record are held against what the reviewers
 * found in the delivered docs. Server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** The head of the SD example: the program name and its two cut-offs, as a chained declaration. */
const SOURCE = [
  'REPORT zsd_return_credit_recon LINE-SIZE 240.',
  'PARAMETERS: p_demo AS CHECKBOX DEFAULT \'X\',',
  '            p_org TYPE vkorg DEFAULT \'1000\',',
  '            p_eff TYPE ty_stamp DEFAULT \'20261012235959\',',
  '            p_known TYPE ty_stamp DEFAULT \'20261012235959\'.',
  'SELECT-OPTIONS s_show FOR gv_cid NO INTERVALS.',
  'START-OF-SELECTION.',
  '  WRITE / p_org.',
].join('\n');

/** The RAP design as the model wrote it for the SD example (solution-design.md of the review package). */
const SD_DESIGN = {
  projectName: 'SD Return and Credit Reconciliation Modernization',
  architectureOverview: {
    approachDescription: 'An in-app RAP business object wraps the bitemporal claim simulation.',
    nodeFramework: 'SAP RAP (RESTful Application Programming) providing native ABAP Cloud transactional data processing',
    runtimePlatform: 'SAP S/4HANA Core (Developer Extensibility)',
  },
  nodeAppBlueprint: {
    projectStructure: [
      { path: 'src/zi_returncreditclaim_r.ddls.asddls', purpose: 'Root interface CDS view' },
      { path: 'src/zc_returncreditclaim_p.ddls.asddls', purpose: 'Projection CDS view with Fiori Elements UI annotations' },
      { path: 'src/zi_returncreditclaim.bdef.asbdef', purpose: 'Behavior definition' },
      { path: 'src/zbp_i_returncreditclaim.clas.abap', purpose: 'Behavior pool implementation' },
      { path: 'src/zsd_return_credit_recon.srvd.srvdsrv', purpose: 'Service definition' },
      { path: 'src/zsb_return_credit_recon_v4.srvb.asrvb', purpose: 'OData V4 service binding' },
    ],
    apiEndpoints: [
      { method: 'GET', path: '/sap/opu/odata4/sap/zsb_return_credit_recon_v4/srvd/sap/zsd_return_credit_recon/0001/ReturnCreditClaim', description: 'Read the claims.' },
    ],
  },
  cloudServices: [{ serviceName: 'IAM Business Catalog', purpose: 'Access to zc_returncreditclaim_p.', npmPackages: [] }],
  dataSync: {
    patternName: 'Transient Simulation via Custom Query Provider',
    description:
      'The reconciliation logic executes as an in-memory simulation without modifying ERP business tables. Consistent read states across sales document flows are guaranteed natively by SAP HANA multi-version concurrency control without requiring explicit enqueue locks.',
  },
  securityHardening: [],
  roadmap: [{ phase: 'Phase 3', title: 'Decommissioning', deliverables: ['Decommissioning and archiving of report ZSD_RETURN_CREDIT_RECON'] }],
};

test.describe('CR-D7 / A04 — the RAP design speaks for its route and uses the scaffold\'s names', () => {
  test('no CAP template words under a RAP design; a CAP design keeps its own', () => {
    const md = formatDesignToMarkdown(JSON.stringify(SD_DESIGN), { code: SOURCE });
    expect(md).not.toContain('Target Node.js Framework');
    expect(md).not.toContain('microservice project layout');
    expect(md).toContain('- **Target framework:**');
    expect(designRouteOf(SD_DESIGN)).toBe('rap');

    const cap = { ...SD_DESIGN, architectureOverview: { approachDescription: 'CAP.', nodeFramework: 'SAP CAP (Cloud Application Programming model)', runtimePlatform: 'SAP BTP' } };
    expect(designRouteOf(cap)).toBe('cap');
    expect(formatDesignToMarkdown(JSON.stringify(cap))).toContain('Target Node.js Framework');
  });

  test('the artifact list, the endpoints and the text carry the names rapShortName gives — never the program name rewritten', () => {
    const s = rapShortName('ZSD_RETURN_CREDIT_RECON');
    expect(s).toBe('sd_return_cr');
    const md = formatDesignToMarkdown(JSON.stringify(SD_DESIGN), { code: SOURCE });
    for (const file of [`src/z${s}_r.ddls.asddls`, `src/z${s}_c.ddls.asddls`, `src/z${s}_r.bdef.asbdef`, `src/zbp_${s}_r.clas.abap`, `src/z${s}_srvd.srvd.srvdsrv`, `src/z${s}_srvb.srvb.xml`]) {
      expect(md, file).toContain(`\`${file}\``);
    }
    // The model's names stand only in the line that says what was renamed.
    const body = md.split('\n').filter((l) => !l.startsWith("> Object names as the engine's RAP scaffold")).join('\n');
    expect(body).not.toMatch(/zi_returncreditclaim|zbp_i_returncreditclaim|zsb_return_credit_recon_v4/);
    expect(md).not.toContain('SAP BTP & Native Cloud Services Integration');
    expect(md).toContain(`/sap/opu/odata4/sap/z${s}_srvb/srvd/sap/z${s}_srvd/0001/ReturnCreditClaim`);
    // The projection named in another section is renamed with it.
    expect(md).toContain(`Access to z${s}_c.`);
    // The program itself stays the program.
    expect(md).toContain('archiving of report ZSD_RETURN_CREDIT_RECON');
    expect(md).toContain('`zi_returncreditclaim_r` → `zsd_return_cr_r`');
  });

  test('without a source the names stay the model\'s, and the export says so', () => {
    const md = formatDesignToMarkdown(JSON.stringify(SD_DESIGN));
    expect(md).toContain("Object names are the model's proposal");
    expect(postCheckDesign(SD_DESIGN, null).renamed).toEqual([]);
  });

  test('an artifact the scaffold does not generate is kept and said to be beyond the package', () => {
    const d = { ...SD_DESIGN, nodeAppBlueprint: { ...SD_DESIGN.nodeAppBlueprint, projectStructure: [...SD_DESIGN.nodeAppBlueprint.projectStructure, { path: 'src/zc_returncreditclaim_p.bdef.asbdef', purpose: 'Projection behavior' }] } };
    const a = alignRapDesignNames(d, 'ZSD_RETURN_CREDIT_RECON');
    expect(a.beyond).toEqual(['src/zc_returncreditclaim_p.bdef.asbdef']);
  });

  test('side-by-side wording in a RAP design is listed as refused, npm packages are left out', () => {
    const d = { ...SD_DESIGN, architectureOverview: { ...SD_DESIGN.architectureOverview, approachDescription: 'A Node.js microservice reads the flows.' }, cloudServices: [{ serviceName: 'IAM', purpose: 'Roles.', npmPackages: ['@sap/xssec'] }] };
    const md = formatDesignToMarkdown(JSON.stringify(d), { code: SOURCE });
    expect(md).toContain('## Template text refused');
    expect(md).toContain('architectureOverview.approachDescription: Node.js, microservice');
    expect(md).not.toContain('Required Node.js SDK Packages');
  });

  test('the prompt names the scaffold\'s objects and forbids the template and MVCC promises', () => {
    expect(rapObjectNamesPromptRule('ZSD_RETURN_CREDIT_RECON')).toContain(`behavior pool ${rapDesignNames('ZSD_RETURN_CREDIT_RECON').behaviorPool}`);
    const page = read('app/(app)/project/[projectId]/design/page.tsx');
    expect(page).toContain('rapObjectNamesPromptRule(programOfSource(');
    expect(page).toContain('${DESIGN_CONSISTENCY_PROMPT_RULE} ${RAP_TEMPLATE_PROMPT_RULE}');
    expect(page).not.toContain('is preserved natively within SAP LUW');
  });
});

test.describe('A03 — no consistency promise from MVCC', () => {
  test('the MVCC sentence is refused and said to be; the rest of the paragraph stays', () => {
    const md = formatDesignToMarkdown(JSON.stringify(SD_DESIGN), { code: SOURCE });
    expect(md).not.toMatch(/guaranteed natively by SAP HANA multi-version concurrency/);
    expect(md).toContain('executes as an in-memory simulation');
    expect(md).toContain(MVCC_REFUSAL);
  });

  test('two cut-offs ask for a certified input snapshot; one does not', () => {
    expect(readsAtTwoCutoffs(SOURCE)).toBe(true);
    expect(formatDesignToMarkdown(JSON.stringify(SD_DESIGN), { code: SOURCE })).toContain(CERTIFIED_SNAPSHOT_NOTE);
    const single = SOURCE.replace("p_known TYPE ty_stamp DEFAULT '20261012235959'", 'p_case TYPE i');
    expect(readsAtTwoCutoffs(single)).toBe(false);
    expect(formatDesignToMarkdown(JSON.stringify(SD_DESIGN), { code: single })).not.toContain(CERTIFIED_SNAPSHOT_NOTE);
  });

  test('every wording of the claim is caught, a plain sentence is not', () => {
    expect(refuseMvccClaims('Reads use snapshot isolation. Fine.').refused).toHaveLength(1);
    expect(refuseMvccClaims('The HANA database snapshot guarantees historical consistency.').refused).toHaveLength(1);
    expect(refuseMvccClaims('Reads go through released CDS views.').refused).toHaveLength(0);
  });

  test('the HTML export refuses it too', () => {
    const exp = read('lib/design-export.ts');
    expect(exp).toContain('postCheckDesign(cleanAndParseJSON(currentProject.solutionDesign)');
    expect(exp).toContain('esc(MVCC_REFUSAL)');
  });
});

test.describe('2.5 — short marks in sentences, the evidence in one matrix', () => {
  test('a verified name carries its state word inline; the table says whether a release was checked', () => {
    const d = { ...SD_DESIGN, architectureOverview: { ...SD_DESIGN.architectureOverview, approachDescription: 'The flows are read; partners come from API_BUSINESS_PARTNER.' } };
    const md = formatDesignToMarkdown(JSON.stringify(d), { code: SOURCE });
    expect(md).toContain('API_BUSINESS_PARTNER [verified — evidence in the identifier table');
    expect(md).not.toMatch(/API_BUSINESS_PARTNER \[verified: SAP lists/);
    expect(md).toContain('| Identifier | Kind | State | SAP\'s name | Source | Release / edition checked |');
  });
});

test.describe('CR-D7 — the developer guidelines are this program\'s', () => {
  const PATHS = ['src/zbp_sd_return_cr_r.clas.abap', 'src/zcl_sd_return_cr_logic.clas.abap', 'src/zcl_sd_return_cr_logic.clas.testclasses.abap', 'abaplint.json'];

  test('the tables the engine found, the classes the package carries, no invented threshold', () => {
    const md = developerGuidelinesMarkdown({
      projectName: 'ZSD_RETURN_CREDIT_RECON',
      isAbapCloud: true,
      paths: PATHS,
      findings: [
        { kind: 'standard-table-read', objectName: 'VBFA', lineStart: 1346, sapReplacement: { objectName: 'I_SDDocumentProcessFlow', objectType: 'CDS View', confidence: 'Catalog Match' } },
        { kind: 'standard-table-read', objectName: 'TCURX', lineStart: 1360 },
        { kind: 'custom-table-write', objectName: 'ZSD_LOG', lineStart: 900 },
      ],
    });
    expect(md).toContain("VBFA — the program reads it (line 1346) -> CDS View 'I_SDDocumentProcessFlow' (name found in catalog)");
    expect(md).toContain('TCURX — the program reads it (line 1360) -> no released successor named');
    expect(md).toContain('Behaviour pool: ZBP_SD_RETURN_CR_R.');
    expect(md).toContain('ZCL_SD_RETURN_CR_LOGIC (local test classes)');
    for (const gone of ['BSEG', 'KNA1', 'ZCL_DEMO_RAP_BEHAVIOR', 'ZCL_DEMO_RAP_TEST', '85%', '>=85', 'ZSD_LOG']) expect(md, gone).not.toContain(gone);
  });

  test('findings that could not be read are said, never filled with an example', () => {
    const md = developerGuidelinesMarkdown({ projectName: 'P', isAbapCloud: true, paths: null, findings: null, findingsUnread: 'not signed in' });
    expect(md).toContain("The engine's findings could not be read (not signed in)");
    expect(md).not.toMatch(/VBAK|BSEG|KNA1/);
  });

  test('the delivery page writes the file from the module, after the findings are read', () => {
    const page = read('app/(app)/project/[projectId]/delivery/page.tsx');
    expect(page).not.toContain('generateDeveloperGuidelines');
    expect(page).not.toContain('ZCL_DEMO_RAP_BEHAVIOR');
    expect(page).toMatch(/readScoreEvidence\(projectId as string\),[\s\S]*docs\.file\("developer-guidelines\.md", developerGuidelinesMarkdown\(/);
  });
});

test.describe('A04 — the decision record names the weighing, never the choice as its reason', () => {
  test('the circular check sees "as the signed-off target architecture says" — the sentence the record carried', () => {
    expect(circularReason(decisionSummary('rap'))).not.toBeNull();
    expect(circularReason('RAP, because the confirmed design says RAP.')).not.toBeNull();
    expect(circularReason('Build this object as In-App ABAP Cloud (RAP), as the signed-off target architecture says.')).not.toBeNull();
    // Not every "as" is circular.
    expect(circularReason('Dealers without an SAP user upload price lists, as the portal requires; the standard has no dealer portal.')).toBeNull();
  });

  const ROUTER = 'No construct that forces a side-by-side split was detected. What was found is addressed on-stack, so Developer Extensibility (RAP) is the recommended path.';
  const draftFacts: DecisionDraftFacts = {
    runId: 'run-1',
    evidenceDigest: 'd'.repeat(64),
    runSignedAt: '2026-10-14T08:00:00.000Z',
    contract: null,
    signedOffArchitecture: 'rap',
    signOff: { by: 'owner@example.invalid', at: '2026-10-14T09:00:00.000Z', reason: 'RAP, because the confirmed design says RAP.', notCurrent: null },
    need: { revision: null, confirmedDrops: 0, undecided: null },
    handedOver: false,
    stored: undefined,
    now: '2026-10-14T09:25:14.953Z',
  };

  test('the weighing reads all five options from the engine, with the router for native against side by side', () => {
    const w = decisionWeighing({
      subject: 'ZSD_RETURN_CREDIT_RECON', hasRun: true, decision: null, status: null,
      engineRoute: 'rap', engineReasoning: ROUTER, usage: null, design: JSON.stringify(SD_DESIGN),
    });
    expect(w.rows.map((r) => r.key)).toEqual(['keep', 'standard', 'rap', 'cap', 'retire']);
    const cap = w.rows.find((r) => r.key === 'cap')!;
    expect(cap.signal).toBe('against');
    expect(cap.why).toContain('No construct that forces a side-by-side split was detected.');
    expect(w.rows.find((r) => r.key === 'standard')!.signal).toBe('not-determined');
    expect(w.rows.find((r) => r.key === 'retire')!.why).toContain('No usage data is imported');
    expect(circularReason(w.reason)).toBeNull();
    expect(w.reason).toContain('against Rebuild side by side (CAP)');
    expect(w.rows.some((r) => containsAmount(r.why))).toBe(false);
  });

  test('decision.md: the summary is marked as restating the choice, and the weighing stands beside it', () => {
    const decision = {
      ...deriveDecisionDraft(draftFacts).draft,
      status: 'confirmed',
      confirmation: { account: 'owner@example.invalid', at: '2026-10-14T09:25:14.953Z', selfDeclaration: SELF_DECLARATION },
    };
    const project = {
      id: 'p1', name: 'ZSD_RETURN_CREDIT_RECON', activeRunId: 'run-1', decision,
      approvedByArchitect: true, targetArchitecture: 'rap', originalRecommendation: 'rap',
      recommendationJustification: ROUTER, solutionDesign: JSON.stringify(SD_DESIGN),
    } as unknown as HandoverProject;
    const facts = decisionFactsOf(project);
    const summary = facts.reasons.find((r) => r.label.startsWith('Summary of the decision record'))!;
    expect(summary.label).toBe('Summary of the decision record (restates the choice, not a reason)');
    expect(facts.reasons[0].label).toBe('The weighing');

    const md = buildDecisionRecord({
      projectId: 'p1', projectName: 'ZSD_RETURN_CREDIT_RECON', route: 'abap-cloud', appVersion: 'v3.0.13', generatedAt: '2026-10-14T10:00:00.000Z',
      source: { fileName: 'z.abap', sha256: 'a'.repeat(64), lines: 10, matchesSignedRun: true },
      run: { id: 'run-1', engineVersion: 'v3.0.13', auditPackExportedAt: null },
      decision: facts,
      rules: { state: 'not-detected', reason: 'no rules' },
      tests: { status: 'not-run', scenarios: 0, sentence: 'No test run is on record.', detail: [] },
      score: { signed: null, edition: 'private', rule: 'own-custom-writes-free', engineVersion: 'v3.0.13', model: null, unread: null },
      documentationFromEngine: true,
      referenceSection: '',
    } as DeliveryFacts);
    expect(md).toContain('### The weighing');
    expect(md).toMatch(/\| Rebuild side by side \(CAP\) \| Speaks against it \| The engine routes this object in-app \(RAP\): No construct/);
    expect(md).toMatch(/\| Keep \| Not determined \|/);
    expect(md).toContain("- The weighing: Weighed on the engine's readings of the signed run");
  });
});
