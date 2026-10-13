import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { levelDRegister, levelDRegisterMarkdown, LEVEL_D_NONE } from '../lib/level-d-register';

/**
 * DSAG guideline review B7 (owner 13.10.2026): the Documentation tool lists
 * every modification and level D enhancement the engine detects, with the
 * guideline's three points as open questions, and exports it. No inputs, no
 * sign-off; nothing of it in the signed run.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const CODE = [
  'REPORT zcc_level_d.',
  '*{   INSERT         DEVK900123                                        1',
  '  lv_flag = abap_true.',
  '*}   INSERT',
  'ENHANCEMENT 1  ZEI_SD_PRICING.    "active version',
  '  lv_price = lv_price * 2.',
  'ENDENHANCEMENT.',
  'GET BADI lo_badi.',
  'CALL BADI lo_badi->check.',
  '*{   REPLACE        DEVK900124                                        2',
  '  lv_flag = abap_false.',
  '*}   REPLACE',
].join('\n');

test.describe('level D register', () => {
  test('lists the modifications and the enhancement implementation, not the BAdI', () => {
    const { findings } = buildAbapEvidence(CODE, 'zcc_level_d.abap', 'private');
    const register = levelDRegister(findings);
    expect(register.map((e) => e.kind)).toEqual(['modification', 'enhancement', 'modification']);
    expect(register.map((e) => e.line)).toEqual([2, 5, 10]);
    expect(register.every((e) => e.questions.map((q) => q.key).join() === 'purpose,upgrade-effect,tested-scenarios')).toBe(true);
    expect(findings.some((f) => f.objectType === 'BAdI')).toBe(true);
  });

  test('the export carries every entry with its three open questions and the approval note', () => {
    const register = levelDRegister(buildAbapEvidence(CODE, 'zcc_level_d.abap', 'private').findings);
    const md = levelDRegisterMarkdown(register, { projectName: 'Pricing | test', date: '2026-10-13' });
    expect(md).toContain('# Level D register — Pricing \\| test');
    expect(md.match(/^- Open — Purpose:/gm)).toHaveLength(3);
    expect(md.match(/^- Open — Effect on upgrades:/gm)).toHaveLength(3);
    expect(md.match(/^- Open — Tested scenarios:/gm)).toHaveLength(3);
    expect(md).toContain('SPAU_ENH');
    expect(md).toMatch(/approval process for level D developments/);
    expect(md).toMatch(/DSAG ABAP-Leitfaden.*CC BY 4\.0/);
  });

  test('a program without one says so instead of exporting an empty table', () => {
    const md = levelDRegisterMarkdown(levelDRegister(buildAbapEvidence('REPORT zcc_plain.\nWRITE 1.', 'p.abap', 'private').findings), {
      projectName: 'Plain',
      date: '2026-10-13',
    });
    expect(md).toContain(LEVEL_D_NONE);
  });

  test('the register component has no input and no sign-off (Documentation is a help)', () => {
    const src = read('components/documentation/LevelDRegister.tsx').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).not.toMatch(/<input|<textarea|<select|CcInput|CcTextArea|contentEditable|onChange=/i);
    expect(src).not.toMatch(/sign[- ]?off|approve\(|setDoc|updateDoc|runProjectCommand/i);
    expect(read('app/(app)/project/[projectId]/documentation/page.tsx')).toContain('<LevelDRegister');
  });

  /**
   * Executed, not grepped (QA review of 5a559787, c56094998270): a renamed
   * helper or an indirect serializer would pass a search for the module name.
   * Two checks that do not depend on a name:
   *   - the module graph — bundled with esbuild from the run-create route and
   *     the audit-pack builder, `lib/level-d-register.ts` is not among the
   *     files either one loads, however it would be reached;
   *   - the signed bytes — an audit pack built from a run whose evidence holds
   *     three level D findings, with the register and its export lying on the
   *     project beside it, carries the findings and none of the register's
   *     questions, its approval note or its title.
   */
  test('the signed run and the audit pack load no register and sign none of its words', async () => {
    test.setTimeout(120_000);
    const { build } = await import('esbuild');
    for (const entry of ['app/api/runs/create/route.ts', 'lib/audit-pack-build.ts']) {
      const result = await build({
        entryPoints: [path.join(ROOT, entry)],
        bundle: true,
        write: false,
        metafile: true,
        platform: 'node',
        format: 'cjs',
        packages: 'external',
        alias: { '@': ROOT },
        logLevel: 'silent',
      });
      const inputs = Object.keys(result.metafile!.inputs).map((p) => p.replace(/\\/g, '/'));
      expect(inputs.some((p) => p.endsWith('lib/abap/evidence-model.ts')), `${entry} loads the engine`).toBe(entry.startsWith('app/'));
      expect(inputs.filter((p) => /level-d-register|LevelDRegister/.test(p)), entry).toEqual([]);
    }

    const { buildAuditPackContents } = await import('../lib/audit-pack-build');
    const findings = buildAbapEvidence(CODE, 'zcc_level_d.abap', 'private').findings;
    const register = levelDRegister(findings);
    expect(register).toHaveLength(3);
    const markdown = levelDRegisterMarkdown(register, { projectName: 'P', date: '2026-10-13' });
    const run = {
      status: 'completed',
      createdAt: '2026-10-13T08:00:00.000Z',
      analyzerVersion: 'v3.0.12',
      evidenceReport: findings,
      // The signed worklist as `/api/runs/create` builds it: one row per finding.
      worklist: findings.map((f, i) => ({ id: `finding-${f.kind}-${i}`, title: f.title, category: 'Finding', severity: f.severity, location: `zcc_level_d.abap:${f.lineStart}`, recommendation: f.recommendation, status: 'open' })),
      // A field no signed generator is allowed to read, holding the register.
      levelDRegister: register,
      levelDRegisterMarkdown: markdown,
    };
    const pack = buildAuditPackContents({
      projectId: 'p1',
      runId: 'r1',
      run,
      auditMetadata: { inputFingerprint: { fileName: 'zcc_level_d.abap' } } as never,
      attested: {} as never,
    });
    const signed = Object.values(pack.signed).join('\n');
    // Sanity: the engine's level D findings themselves are signed.
    const modification = findings.find((f) => f.kind === 'modification')!;
    expect(pack.signed['03-findings.csv']).toContain(modification.title);
    const words = [
      ...new Set(register.flatMap((e) => e.questions.map((q) => q.question))),
      'Level D register',
      'approval process for level D developments',
      'SPAU_ENH',
    ];
    for (const w of words) expect(signed, w).not.toContain(w);
  });

  test('the register stays out of the signed run and the audit pack', () => {
    for (const rel of ['app/api/runs/create/route.ts', 'lib/audit-pack.ts', 'lib/audit-pack-build.ts', 'lib/audit-pack-canonical.ts', 'lib/abap/evidence-model.ts']) {
      expect(read(rel), rel).not.toContain('level-d-register');
    }
  });
});
