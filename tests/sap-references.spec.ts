/**
 * SAP reference sources — roadmap 3.0.12, owner decision 13.10.2026.
 *
 * Server-free. Four SAP repositories on GitHub are synced weekly by
 * `scripts/sync-sap-references.ts` into `lib/generated/sap-references/` (and the
 * ABAP file format schemas into `lib/generated/aff-schemas/`). This spec holds:
 *   1. each synced source names its commit and the licence the owner decision
 *      was taken on (GitHub detection and REUSE), and stores metadata and hashes
 *      only — no prose, no code;
 *   2. the copied AFF schemas are exactly the synced ones, byte for byte, under
 *      the upstream MIT LICENSE, one or more per object type the scaffolds write;
 *   3. every row of `lib/sap-reference-citations.ts` has a status, and a
 *      correction wherever it does not simply adopt;
 *   4. every file or section a row adopts exists in the synced data and its hash
 *      equals the hash at adoption. On the weekly bot branch
 *      `chore/sync-sap-references` this FAILS when SAP changes or removes a cited
 *      file or section — review the row by hand, then record the new hash.
 *      Watched and not-adopted refs only add an annotation;
 *   5. every `// SAP sample: <repo>@<sha8> <path>` and `// Clean ABAP: <section>`
 *      comment in product code points to a registered, existing citation;
 *   6. NOTICE, THIRD-PARTY-NOTICES.md and the licences page name each source.
 * Plus the anchor rule the sync uses (GitHub heading ids) on known headings.
 */
import { test, expect } from '@playwright/test';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  CLEAN_ABAP_COMMENT_PREFIX,
  SAP_REFERENCE_CITATIONS,
  SAP_REFERENCE_REVIEWED,
  SAP_SAMPLE_COMMENT_PREFIX,
  cleanAbapComment,
  sapSampleComment,
} from '../lib/sap-reference-citations';
import { affSchemaFiles, cleanAbapSection, sapReferenceCommitUrl, sapReferenceData, sapReferenceFile, sapReferenceSection, SAP_REFERENCE_KEYS, type SapReferenceKey } from '../lib/sap-references';
import { AFF_SCHEMA_TYPES, githubHeadingSlug, isAffSchema, markdownSections, reuseLicences, SAP_REFERENCE_SOURCES } from '../scripts/sync-sap-references';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sha256 = (rel: string) => createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');

const EXPECTED: Record<SapReferenceKey, { repo: string; spdx: string; github: string; reuse: string[] }> = {
  'abap-cheat-sheets': { repo: 'SAP-samples/abap-cheat-sheets', spdx: 'Apache-2.0', github: 'Apache-2.0', reuse: ['Apache-2.0'] },
  'abap-platform-refscen-flight': { repo: 'SAP-samples/abap-platform-refscen-flight', spdx: 'Apache-2.0', github: 'Apache-2.0', reuse: ['Apache-2.0'] },
  // GitHub cannot classify the CC BY 3.0 text (NOASSERTION); .reuse/dep5 declares CC-BY-3.0 for every file.
  styleguides: { repo: 'SAP/styleguides', spdx: 'CC-BY-3.0', github: 'NOASSERTION', reuse: ['CC-BY-3.0'] },
  'abap-file-formats': { repo: 'SAP/abap-file-formats', spdx: 'MIT', github: 'MIT', reuse: ['MIT'] },
};

test.describe('each synced source names its commit and licence, and holds metadata and hashes only', () => {
  test('the four sources, one data file each', () => {
    expect(SAP_REFERENCE_KEYS.sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(SAP_REFERENCE_SOURCES.map((s) => s.key).sort()).toEqual(Object.keys(EXPECTED).sort());
    const files = fs.readdirSync(path.join(ROOT, 'lib/generated/sap-references')).sort();
    expect(files).toEqual(Object.keys(EXPECTED).map((k) => `${k}.json`).sort());
  });

  for (const key of Object.keys(EXPECTED) as SapReferenceKey[]) {
    test(`${key}: commit, licence (owner decision 13.10.2026), no prose`, () => {
      const d = sapReferenceData(key);
      const want = EXPECTED[key];
      const src = SAP_REFERENCE_SOURCES.find((s) => s.key === key)!;
      expect(d.source).toBe(`https://github.com/${want.repo}`);
      expect(d.branch).toBe(src.branch);
      expect(d.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(sapReferenceCommitUrl(key)).toBe(`https://github.com/${want.repo}/tree/${d.commit}`);
      expect(d.licence.spdx, `${want.repo} changed its licence — stop and review the attribution before anything else`).toBe(want.spdx);
      expect(d.licence.github).toBe(want.github);
      expect(d.licence.reuse, `${want.repo}: REUSE declares other licences — a file may carry a licence of its own`).toEqual(want.reuse);
      expect(src.expectedLicence).toBe(want.spdx);
      expect(SAP_REFERENCE_REVIEWED[key].repo).toBe(want.repo);
      expect(SAP_REFERENCE_REVIEWED[key].branch).toBe(src.branch);
      expect(SAP_REFERENCE_REVIEWED[key].licence).toBe(want.spdx);
      expect(SAP_REFERENCE_REVIEWED[key].licenceUrl).toBe(d.licence.url);
      expect(d.files.length).toBeGreaterThan(0);
      for (const f of d.files) {
        expect(Object.keys(f).sort()).toEqual(['path', 'sha256', 'size']);
        expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
      for (const s of d.sections) {
        expect(Object.keys(s).sort()).toEqual(['anchor', 'file', 'hash', 'heading', 'level']);
        expect(s.hash).toMatch(/^[0-9a-f]{64}$/);
        expect(String(s.heading).length).toBeLessThan(200);
      }
    });
  }

  test('the scope per source: samples by file, Clean ABAP by section, AFF by schema', () => {
    expect(sapReferenceData('abap-platform-refscen-flight').files.every((f) => f.path.startsWith('src/'))).toBe(true);
    expect(sapReferenceData('abap-cheat-sheets').sections.length).toBeGreaterThan(300);
    expect(sapReferenceData('styleguides').sections.some((s) => s.file === 'clean-abap/CleanABAP.md')).toBe(true);
    // The translations follow the English guide; they are not in scope.
    expect(sapReferenceData('styleguides').files.some((f) => /CleanABAP_[a-z]{2}\.md$/.test(f.path))).toBe(false);
    expect(sapReferenceData('abap-file-formats').files.every((f) => isAffSchema(f.path))).toBe(true);
    expect(sapReferenceData('abap-file-formats').sections).toEqual([]);
  });
});

test.describe('the AFF schemas are copied unchanged, under the upstream MIT licence', () => {
  const DIR = 'lib/generated/aff-schemas';

  test('every copied schema matches its synced hash, and nothing else is in the folder', () => {
    const d = sapReferenceData('abap-file-formats');
    const copied = d.copied ?? [];
    expect(copied.length).toBe(d.files.length);
    for (const c of copied) {
      const synced = d.files.find((f) => f.path === c.path)!;
      expect(c.to).toBe(`${DIR}/${path.posix.basename(c.path)}`);
      expect(sha256(c.to), `${c.to} differs from ${c.path} at ${d.commit}`).toBe(synced.sha256);
      const schema = JSON.parse(read(c.to));
      expect(schema.$schema).toMatch(/^https:\/\/json-schema\.org\//);
    }
    const onDisk = fs.readdirSync(path.join(ROOT, DIR)).sort();
    expect(onDisk).toEqual([...copied.map((c) => path.posix.basename(c.to)), 'LICENSE'].sort());
  });

  test('the LICENSE next to them is the upstream MIT notice', () => {
    const lic = read(`${DIR}/LICENSE`);
    expect(lic).toMatch(/MIT License/);
    expect(lic).toMatch(/SAP SE or an SAP affiliate company/);
    expect(lic).toMatch(/The above copyright notice and this permission notice shall be included/);
  });

  test('one schema (or more) per object type the scaffolds write, and for SAJC/SAJT', () => {
    const byType = affSchemaFiles();
    for (const t of AFF_SCHEMA_TYPES) expect(byType[t]?.length ?? 0, `no AFF schema for ${t}`).toBeGreaterThan(0);
    expect(byType.tabl).toEqual([`${DIR}/tabl-v1.json`, `${DIR}/tabt-v1.json`]);
  });
});

test.describe('the registry: every row has a status, and a correction where it does not simply adopt', () => {
  test('ids are unique and follow the naming; every source but Clean ABAP has rows', () => {
    const ids = SAP_REFERENCE_CITATIONS.map((c) => c.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    for (const c of SAP_REFERENCE_CITATIONS) {
      const prefix = { 'abap-platform-refscen-flight': 'flight-', 'abap-cheat-sheets': 'cheat-', styleguides: 'clean-abap-', 'abap-file-formats': 'aff-' }[c.source];
      expect(c.id.startsWith(prefix), c.id).toBe(true);
    }
    for (const id of ['flight-dcl', 'flight-bdef', 'cheat-apj', 'cheat-bali', 'aff-schemas']) expect(ids).toContain(id);
    for (const key of SAP_REFERENCE_KEYS) expect(SAP_REFERENCE_REVIEWED[key].commit).toMatch(/^[0-9a-f]{40}$/);
  });

  test('status, correction and refs are complete', () => {
    for (const c of SAP_REFERENCE_CITATIONS) {
      expect(['adopted', 'adopted-with-correction', 'not-adopted']).toContain(c.status);
      expect(c.adopted.length, c.id).toBeGreaterThan(20);
      expect(c.refs.length, `${c.id} cites nothing`).toBeGreaterThan(0);
      if (c.status === 'adopted') expect(c.correction, `${c.id}: an adopted row has no correction`).toBeUndefined();
      else expect(c.correction?.length ?? 0, `${c.id}: ${c.status} needs a correction`).toBeGreaterThan(20);
      for (const w of c.watched ?? []) expect(w.why.length, `${c.id} watched ${w.path}`).toBeGreaterThan(20);
      for (const r of [...c.refs, ...(c.watched ?? [])]) expect(r.hashAtAdoption, `${c.id} ${r.path}`).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test('the AFF row covers every copied schema', () => {
    const row = SAP_REFERENCE_CITATIONS.find((c) => c.id === 'aff-schemas')!;
    expect(row.refs.map((r) => r.path).sort()).toEqual(sapReferenceData('abap-file-formats').files.map((f) => f.path).sort());
  });
});

const lookup = (source: SapReferenceKey, r: { path: string; section?: string }) =>
  r.section ? sapReferenceSection(source, r.path, r.section) : sapReferenceFile(source, r.path);

test.describe('every adopted file and section is unchanged since adoption', () => {
  // On the weekly bot branch this is the review signal: SAP changed something a
  // row of ours rests on. Read it at the new commit, review the row by hand, then
  // set hashAtAdoption to the new hash.
  for (const c of SAP_REFERENCE_CITATIONS.filter((x) => x.status !== 'not-adopted')) {
    test(`${c.id} (${c.status})`, () => {
      for (const r of c.refs) {
        const now = lookup(c.source, r);
        const what = `${SAP_REFERENCE_REVIEWED[c.source].repo} ${r.path}${r.section ? ` § ${r.section}` : ''}`;
        expect(now, `${c.id}: "${what}" is gone — review the row by hand`).not.toBeNull();
        expect(now!.url).toMatch(/^https:\/\/github\.com\/SAP(-samples)?\/[\w-]+\/blob\/[0-9a-f]{40}\//);
        expect(now!.hash, `${c.id}: SAP changed "${what}" (${now!.url}) — review the adopted row by hand, then record the new hash`).toBe(r.hashAtAdoption);
      }
    });
  }

  test('refs we do not follow are watched softly — a change is an annotation, not a failure', () => {
    const soft = SAP_REFERENCE_CITATIONS.flatMap((c) => [
      ...(c.watched ?? []).map((r) => ({ c, r })),
      ...(c.status === 'not-adopted' ? c.refs.map((r) => ({ c, r })) : []),
    ]);
    for (const { c, r } of soft) {
      const now = lookup(c.source, r);
      if (!now || now.hash !== r.hashAtAdoption) {
        test.info().annotations.push({ type: 'sap-reference-watch', description: `${c.id}: "${r.path}${r.section ? ` § ${r.section}` : ''}" ${now ? 'changed' : 'is gone'} — reconsider the decision.` });
      }
    }
  });
});

test.describe('code that cites an SAP reference cites a registered citation', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== 'generated' && !e.name.startsWith('.')) walk(rel, out);
      } else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) out.push(rel);
    }
    return out;
  }

  /** A comment, not a quotation of one: `//` at the start of the line or after code, never right after a backtick or quote. */
  function commentsIn(file: string, text: string, prefix: string): { at: string; text: string }[] {
    const out: { at: string; text: string }[] = [];
    const marker = prefix.trim();
    text.split(/\r?\n/).forEach((line, i) => {
      const at = line.indexOf(marker);
      if (at < 0 || (at > 0 && /[`'"]/.test(line[at - 1]))) return;
      if (at > 0 && !/[\s;{}(),]/.test(line[at - 1])) return;
      out.push({ at: `${file}:${i + 1}`, text: line.slice(at).replace(/\s+$/, '') });
    });
    return out;
  }
  function comments(prefix: string): { at: string; text: string }[] {
    return ['app', 'components', 'lib', 'hooks', 'scripts']
      .filter((d) => fs.existsSync(path.join(ROOT, d)))
      .flatMap((d) => walk(d))
      .flatMap((file) => commentsIn(file, read(file), prefix));
  }

  const SAMPLE_ALLOWED = new Set(
    SAP_REFERENCE_CITATIONS.filter((c) => c.status !== 'not-adopted' && c.source !== 'styleguides').flatMap((c) =>
      c.refs.map((r) => sapSampleComment(c.source, r.path)),
    ),
  );
  const CLEAN_ABAP_ALLOWED = new Set(
    SAP_REFERENCE_CITATIONS.filter((c) => c.status !== 'not-adopted' && c.source === 'styleguides').flatMap((c) =>
      c.refs.filter((r) => r.section).map((r) => cleanAbapComment(r.section!)),
    ),
  );

  /**
   * Every comment with the prefix is read: one that does not parse is reported
   * as malformed instead of skipped (QA leftovers of hotfix 2 — the shape
   * filter used to drop `// SAP sample: flight` and `// Clean ABAP:` unread,
   * the rule `tests/dsag-citations.spec.ts` already holds for its prefix).
   */
  function sampleProblems(found: { at: string; text: string }[]): string[] {
    return found.flatMap((c) => {
      if (!/^\/\/ SAP sample: \S+@[0-9a-f]{8} \S+$/.test(c.text)) return [`${c.at} malformed citation: ${c.text}`];
      return SAMPLE_ALLOWED.has(c.text) ? [] : [`${c.at} ${c.text}`];
    });
  }
  function cleanAbapProblems(found: { at: string; text: string }[]): string[] {
    return found.flatMap((c) => {
      if (!c.text.startsWith(CLEAN_ABAP_COMMENT_PREFIX) || c.text.trim().length <= CLEAN_ABAP_COMMENT_PREFIX.trim().length) {
        return [`${c.at} malformed citation: ${c.text}`];
      }
      return CLEAN_ABAP_ALLOWED.has(c.text) ? [] : [`${c.at} ${c.text}`];
    });
  }

  test('every "// SAP sample:" comment names the reviewed commit and a file an adopted row cites', () => {
    const unknown = sampleProblems(comments(SAP_SAMPLE_COMMENT_PREFIX));
    expect(unknown, 'cite `// SAP sample: <repo>@<sha8 of the reviewed commit> <path>` with a path a row of lib/sap-reference-citations.ts adopts').toEqual([]);
  });

  test('every "// Clean ABAP:" comment names a section a styleguides row adopts', () => {
    const unknown = cleanAbapProblems(comments(CLEAN_ABAP_COMMENT_PREFIX));
    expect(unknown, 'add a clean-abap-<section> row to lib/sap-reference-citations.ts first, heading exactly as in CleanABAP.md').toEqual([]);
  });

  test('a comment with a citation prefix that does not parse is reported, not skipped (QA leftovers of hotfix 2)', () => {
    const sample = (line: string) => sampleProblems(commentsIn('lib/x.ts', line, SAP_SAMPLE_COMMENT_PREFIX));
    const clean = (line: string) => cleanAbapProblems(commentsIn('lib/x.ts', line, CLEAN_ABAP_COMMENT_PREFIX));
    const good = [...SAMPLE_ALLOWED][0];
    expect(good).toBeDefined();
    expect(sample(`    ${good}`)).toEqual([]);
    for (const bad of ['// SAP sample: flight', '// SAP sample: SAP-samples/abap-platform-refscen-flight src/x', '// SAP sample:']) {
      expect(sample(`    ${bad}`), bad).toEqual([`lib/x.ts:1 malformed citation: ${bad}`]);
    }
    // Well formed but not registered: reported as before.
    expect(sample('    // SAP sample: SAP-samples/x@0123abcd src/none')).toEqual(['lib/x.ts:1 // SAP sample: SAP-samples/x@0123abcd src/none']);
    expect(clean(`    ${cleanAbapComment('Prefer RETURNING to EXPORTING')}`).every((p) => !p.includes('malformed'))).toBe(true);
    for (const bad of ['// Clean ABAP:', '// Clean ABAP:Prefer RETURNING to EXPORTING']) {
      expect(clean(`    ${bad}`), bad).toEqual([`lib/x.ts:1 malformed citation: ${bad}`]);
    }
  });

  test('the comment helpers produce what the checks accept', () => {
    expect(sapSampleComment('abap-platform-refscen-flight', 'src/x.bdef.asbdef')).toBe(
      `// SAP sample: SAP-samples/abap-platform-refscen-flight@${SAP_REFERENCE_REVIEWED['abap-platform-refscen-flight'].commit.slice(0, 8)} src/x.bdef.asbdef`,
    );
    expect(cleanAbapComment('Prefer RETURNING to EXPORTING')).toBe('// Clean ABAP: Prefer RETURNING to EXPORTING');
    // A Clean ABAP heading the product will cite resolves in the synced guide.
    expect(cleanAbapSection('Prefer RETURNING to EXPORTING')?.url).toMatch(/CleanABAP\.md#prefer-returning-to-exporting$/);
  });
});

test.describe('the licences name every source', () => {
  for (const key of Object.keys(EXPECTED) as SapReferenceKey[]) {
    test(`${key}`, () => {
      const r = SAP_REFERENCE_REVIEWED[key];
      const notices = read('THIRD-PARTY-NOTICES.md');
      const notice = read('NOTICE');
      const page = read('app/licenses/page.tsx');
      for (const [name, text] of [['THIRD-PARTY-NOTICES.md', notices], ['NOTICE', notice]] as const) {
        expect(text, `${name} names ${r.repo}`).toContain(`https://github.com/${r.repo}`);
        expect(text, `${name} names the reviewed commit of ${r.repo}`).toContain(r.commit);
        expect(text, `${name} names the licence of ${r.repo}`).toContain(r.licenceUrl);
      }
      // The page renders each source from SAP_REFERENCE_REVIEWED: repo, commit and licence URL come from the registry.
      expect(page).toContain(`key: '${key}'`);
      expect(page).toContain('SAP_REFERENCE_REVIEWED[s.key]');
      expect(page).toContain('href={r.licenceUrl}');
      expect(page).toContain('https://github.com/${r.repo}/tree/${r.commit}');
    });
  }

  test('no endorsement is implied, and what is used is said per source', () => {
    const notices = read('THIRD-PARTY-NOTICES.md');
    expect(notices).toMatch(/schemas copied unchanged/);
    expect(notices).toMatch(/structure followed, no code copied/);
    expect(notices).toMatch(/paraphrased/);
    expect(notices).toMatch(/SAP SE or an SAP\s+affiliate company and\s+contributors/);
    expect(read('app/licenses/page.tsx')).toMatch(/endorse/);
  });
});

test.describe('anchors as GitHub renders them', () => {
  test('known headings', () => {
    expect(githubHeadingSlug('Prefer RETURNING to EXPORTING')).toBe('prefer-returning-to-exporting');
    expect(githubHeadingSlug('Excursion: Authorization Control in RAP')).toBe('excursion-authorization-control-in-rap');
    expect(githubHeadingSlug('Executable Example (_SAP Business AI Platform, ABAP environment_)')).toBe('executable-example-sap-business-ai-platform-abap-environment');
    expect(githubHeadingSlug('Converting string <-> xstring')).toBe('converting-string---xstring');
    expect(githubHeadingSlug('Use [abaplint](https://abaplint.org) `checks`')).toBe('use-abaplint-checks');
  });

  test('repeats get -1; code fences are not headings', () => {
    const secs = markdownSections('x.md', ['# A', '## B', '```abap', '## not', '```', '## B'].join('\n'));
    expect(secs.map((s) => s.anchor)).toEqual(['a', 'b', 'b-1']);
  });

  test('REUSE identifiers from REUSE.toml and .reuse/dep5', () => {
    expect(reuseLicences('SPDX-License-Identifier = "Apache-2.0"\n')).toEqual(['Apache-2.0']);
    expect(reuseLicences('Files: *\nLicense: CC-BY-3.0\n')).toEqual(['CC-BY-3.0']);
    expect(reuseLicences('SPDX-License-Identifier = "MIT"\nSPDX-License-Identifier = "CC-BY-4.0"')).toEqual(['CC-BY-4.0', 'MIT']);
  });
});
