import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  CUSTOM_ENTITY_AUTH_NOTE,
  postCheckDesign,
  rapDeliveredFromSource,
  rapDesignNames,
  rapObjectNamesPromptRule,
  rapObjectsOfFiles,
  programOfSource,
} from '../lib/design-post-checks';
import { formatDesignToMarkdown } from '../lib/markdownFormatter';
import { planUnits, readEngineFacts } from '../lib/transformation/unit-plan';
import { buildRapScaffold } from '../lib/transformation/scaffold-rap';

/**
 * Roadmap 3.0.18 item 13 (QM-07, FI-F02; QM and FI reviews of 18.10.2026): the
 * design described a table, a behavior definition and a DCL with `pfcg_auth`
 * for a package that delivers a custom entity, and listed objects the package
 * delivers as "not generated". The delivered list now comes from the package's
 * files, or from the scaffold's own decisions on the source; a delivered object
 * is never "not in the package"; a custom entity gets no DCL — SAP protects it
 * in its query provider class.
 */

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'public', 'starter-examples');
const starter = (file: string) => fs.readFileSync(path.join(DIR, file), 'utf8').replace(/\r\n/g, '\n');
const key = (o: { name: string; type: string }) => `${o.name}.${o.type}`;

/** A read-only starter example: its package is a custom entity. */
const REPORT_FILE = 'Z_INVOICE_EXTRACTOR.txt';

test.describe('the design describes the RAP package that is delivered (3.0.18 item 13, QM-07 / FI-F02)', () => {
  test('the objects read from the source are the ones the RAP scaffold writes, on every starter example', () => {
    const files = fs.readdirSync(DIR).filter((f) => /\.(abap|txt)$/i.test(f));
    expect(files.length).toBeGreaterThan(3);
    for (const file of files) {
      const source = starter(file);
      const facts = readEngineFacts(source);
      const scaffold = buildRapScaffold(planUnits(source, {}, facts), facts);
      const written = rapObjectsOfFiles(scaffold.files.map((f) => f.path)).map(key).sort();
      const derived = rapDeliveredFromSource(source)?.objects.map(key).sort();
      expect(derived, file).toEqual(written);
    }
  });

  test('a read-only program is a custom entity: no table, no BDEF, no DCL — the query class is delivered, never "not in the package"', () => {
    const source = starter(REPORT_FILE);
    const n = rapDesignNames(programOfSource(source));
    const delivered = rapDeliveredFromSource(source)!;
    expect(delivered.variant).toBe('custom-entity');
    expect(delivered.objects.map(key)).toEqual(expect.arrayContaining([`${n.entity}.ddls`, `${n.query}.clas`]));
    expect(delivered.objects.some((o) => o.type === 'bdef' || o.type === 'dcls' || o.type === 'tabl')).toBe(false);

    const design = {
      projectName: 'Invoice extractor',
      architectureOverview: { approachDescription: 'A RAP query.', nodeFramework: 'SAP RAP (RESTful Application Programming)', runtimePlatform: 'SAP S/4HANA Core (Developer Extensibility)' },
      nodeAppBlueprint: {
        projectStructure: [
          { path: 'src/zinvoice_rec.tabl.xml', purpose: 'Persistence table' },
          { path: 'src/zi_invoice_r.ddls.asddls', purpose: 'Root view entity' },
          { path: 'src/zi_invoice_r.bdef.asbdef', purpose: 'Behavior definition' },
          { path: 'src/zi_invoice_r.dcls.asdcls', purpose: 'Access control with pfcg_auth' },
          { path: `src/zcl_invoice_query.clas.abap`, purpose: 'Query provider of the custom entity' },
          { path: `src/${n.logic}.clas.abap`, purpose: 'Logic' },
        ],
        apiEndpoints: [],
      },
      cloudServices: [],
      securityHardening: [
        { category: 'Authorization', requirement: 'Restrict rows by a CDS access control (DCL) with pfcg_auth', packageOrConfig: 'define role' },
        { category: 'Authorization', requirement: 'Check the company code', packageOrConfig: 'AUTHORITY-CHECK OBJECT F_BKPF_BUK' },
        // Generic access control in the query provider is what a custom entity needs: kept (QA 5d8e6e355870).
        { category: 'Access control', requirement: 'Enforce access control in the query provider', packageOrConfig: 'AUTHORITY-CHECK OBJECT F_BKPF_BUK ID ACTVT' },
      ],
      roadmap: [],
    };
    const post = postCheckDesign(design, source);
    const paths = post.design.nodeAppBlueprint.projectStructure.map((e) => e.path);
    expect(paths).toContain(`src/${n.entity}.ddls.asddls`);
    expect(paths).toContain(`src/${n.query}.clas.abap`);
    expect(post.beyond.sort()).toEqual(['src/zi_invoice_r.bdef.asbdef', 'src/zi_invoice_r.dcls.asdcls', 'src/zinvoice_rec.tabl.xml']);
    for (const b of post.beyond) expect(b).not.toMatch(new RegExp(`${n.query}|${n.entity}|${n.logic}`));
    expect(post.dclRefused).toEqual(['Restrict rows by a CDS access control (DCL) with pfcg_auth']);
    expect(post.design.securityHardening.map((r) => r.packageOrConfig)).toEqual(['AUTHORITY-CHECK OBJECT F_BKPF_BUK', 'AUTHORITY-CHECK OBJECT F_BKPF_BUK ID ACTVT']);

    const md = formatDesignToMarkdown(JSON.stringify(design), { code: source });
    expect(md).toContain(CUSTOM_ENTITY_AUTH_NOTE);
    expect(md).toContain(`\`${n.entity}\` (DDLS)`);
    expect(md).toContain('as the scaffold writes them for this source');
    expect(md).not.toContain('Not generated by the scaffold');
    const table = md.slice(md.indexOf('## Security Hardening Checklist'));
    expect(table).not.toMatch(/\| \*\*Authorization\*\* \| Restrict rows by a CDS access control/);
  });

  test('the package\'s own file list wins over the source', () => {
    const source = starter(REPORT_FILE);
    const n = rapDesignNames(programOfSource(source));
    const design = {
      architectureOverview: { nodeFramework: 'SAP RAP', runtimePlatform: 'SAP S/4HANA Core (Developer Extensibility)' },
      nodeAppBlueprint: { projectStructure: [{ path: `src/${n.logic}.clas.abap`, purpose: 'Logic' }, { path: `src/${n.query}.clas.abap`, purpose: 'Query' }], apiEndpoints: [] },
    };
    const files = [`src/${n.logic}.clas.abap`, `src/${n.logic}.clas.xml`, `src/${n.entity}.ddls.asddls`, 'src/package.devc.xml', '.abapgit.xml'];
    const post = postCheckDesign(design, source, files);
    expect(post.delivered?.basis).toBe('package');
    expect(post.delivered?.objects.map(key)).toEqual([`${n.logic}.clas`, `${n.entity}.ddls`]);
    // The query class is not in this package's files, so it is said to be beyond it; the logic class is not.
    expect(post.beyond).toEqual([`src/${n.query}.clas.abap`]);
    const md = formatDesignToMarkdown(JSON.stringify(design), { code: source, packageFiles: files });
    expect(md).toContain("read from the package's files");
  });

  test('a writing program keeps the business object and its DCL; the prompt names the variant', () => {
    const source = starter('Z_MM_PO_APPROVAL.abap');
    expect(rapDeliveredFromSource(source)?.variant).toBe('managed-bo');
    const program = programOfSource(source);
    expect(rapObjectNamesPromptRule(program, 'managed-bo')).toContain(`behavior pool ${rapDesignNames(program).behaviorPool}`);
    const report = programOfSource(starter(REPORT_FILE));
    const rule = rapObjectNamesPromptRule(report, 'custom-entity');
    expect(rule).toContain(`custom entity ${rapDesignNames(report).entity}`);
    expect(rule).toContain(`query provider class ${rapDesignNames(report).query}`);
    expect(rule).toMatch(/Do not describe a database table, a behavior definition.*CDS access control \(DCL\)/);
    expect(rule).not.toContain('behavior pool zbp_');
    const page = fs.readFileSync(path.join(ROOT, 'app', '(app)', 'project', '[projectId]', 'design', 'page.tsx'), 'utf8');
    expect(page).toContain('rapObjectNamesPromptRule(programOfSource(designSource), rapVariant)');
    const delivery = fs.readFileSync(path.join(ROOT, 'app', '(app)', 'project', '[projectId]', 'delivery', 'page.tsx'), 'utf8');
    expect(delivery).toMatch(/formatDesignToMarkdown\(project\.solutionDesign, \{ code: project\.legacyCode, packageFiles: /);
  });
});
