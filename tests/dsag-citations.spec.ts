/**
 * DSAG ABAP guide citations — roadmap 3.0.12, owner decisions 13.10.2026.
 *
 * Server-free. Holds four things:
 *   1. the synced structure of the guide (`lib/generated/dsag-abap-guide.json`,
 *      written weekly by `scripts/sync-dsag-guide.ts`) is CC BY 4.0, names its
 *      commit, and holds metadata and hashes only — no prose of the guide;
 *   2. the registry `lib/dsag-citations.ts` has exactly one row per reviewed item
 *      (C1–C5, B1–B10), each with a status, and a correction wherever it does not
 *      simply adopt;
 *   3. every section a row adopts exists in the synced guide and its hash equals
 *      the hash at adoption. On the weekly bot branch `chore/sync-dsag-guide` this
 *      FAILS when DSAG changes or removes a cited section — that is the signal to
 *      re-read the section and review the adopted rule by hand, then record the new
 *      hash in the registry. Sections we deliberately do not follow (`watched`,
 *      `not-adopted`) are watched softly: a change only adds an annotation, so a
 *      guide that corrects itself can be reconsidered;
 *   4. every `// DSAG ABAP guideline: <file> § <heading>` comment in product code
 *      names a section some row adopts.
 * Plus the anchor rule the sync uses (kramdown GFM auto ids), on known headings.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { DSAG_CITATIONS, DSAG_GUIDELINE_COMMENT_PREFIX, DSAG_REVIEWED_COMMIT, dsagGuidelineComment } from '../lib/dsag-citations';
import { dsagSection, DSAG_GUIDE_LICENCE, dsagGuideCommitUrl } from '../lib/dsag-guide';
import { gfmHeaderSlug, parsePage, sectionHash } from '../scripts/sync-dsag-guide';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SYNCED = JSON.parse(read('lib/generated/dsag-abap-guide.json')) as {
  commit: string;
  site: string;
  pages: Record<string, unknown>[];
  sections: Record<string, unknown>[];
};

test.describe('the synced DSAG guide is metadata and hashes, under CC BY 4.0', () => {
  test('it names its commit and licence', () => {
    expect(SYNCED.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(DSAG_GUIDE_LICENCE.spdx, 'the guide changed its licence — review the attribution before anything else').toBe('CC-BY-4.0');
    expect(DSAG_GUIDE_LICENCE.url).toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(dsagGuideCommitUrl()).toBe(`https://github.com/1DSAG/ABAP-Leitfaden/tree/${SYNCED.commit}`);
    expect(SYNCED.site).toBe('https://1dsag.github.io/ABAP-Leitfaden');
    expect(SYNCED.pages.length).toBeGreaterThanOrEqual(40);
  });

  test('no prose: pages carry file, title and URL; sections file, heading, level, anchor and hash', () => {
    for (const p of SYNCED.pages) expect(Object.keys(p).sort()).toEqual(['file', 'title', 'url']);
    for (const s of SYNCED.sections) {
      expect(Object.keys(s).sort()).toEqual(['anchor', 'file', 'hash', 'heading', 'level']);
      expect(s.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(String(s.heading).length).toBeLessThan(160);
    }
  });
});

test.describe('the registry: one row per reviewed item, each with a status', () => {
  const IDS = ['C1', 'C2', 'C3', 'C4', 'C5', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10'];

  test('exactly C1–C5 and B1–B10, once each', () => {
    expect(DSAG_CITATIONS.map((c) => c.id)).toEqual(IDS);
    expect(DSAG_REVIEWED_COMMIT).toMatch(/^[0-9a-f]{40}$/);
  });

  test('a row that does not simply adopt says what it changed or declined, and why (owner rule 13.10.2026)', () => {
    for (const c of DSAG_CITATIONS) {
      expect(['adopted', 'adopted-with-correction', 'not-adopted']).toContain(c.status);
      expect(c.adopted.length, c.id).toBeGreaterThan(20);
      expect(c.sections.length, `${c.id} cites no section`).toBeGreaterThan(0);
      if (c.status === 'adopted') expect(c.correction, `${c.id}: an adopted row has no correction`).toBeUndefined();
      else expect(c.correction?.length ?? 0, `${c.id}: ${c.status} needs a correction`).toBeGreaterThan(20);
      for (const w of c.watched ?? []) expect(w.why.length, `${c.id} watched ${w.heading}`).toBeGreaterThan(20);
      for (const s of [...c.sections, ...(c.watched ?? [])]) {
        expect(s.file, `${c.id}: file is relative to docs/`).not.toMatch(/^docs\//);
        expect(s.hashAtAdoption, `${c.id} ${s.heading}`).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });

  test('C5: the guide contradicts itself on RFC and IDoc; the "avoid" table is watched, not adopted', () => {
    const c5 = DSAG_CITATIONS.find((c) => c.id === 'C5')!;
    expect(c5.status).toBe('adopted-with-correction');
    expect(c5.watched?.map((w) => `${w.file} § ${w.heading}`)).toContain('integration/index.md § Clean Core');
  });
});

test.describe('every adopted section is unchanged since adoption', () => {
  // On the weekly bot branch this is the review signal: DSAG changed a section a
  // rule of ours rests on. Re-read it at the new commit, review the rule (and its
  // status) by hand, then set hashAtAdoption to the new hash.
  for (const c of DSAG_CITATIONS.filter((x) => x.status !== 'not-adopted')) {
    test(`${c.id} (${c.status})`, () => {
      for (const s of c.sections) {
        const now = dsagSection(s.file, s.heading);
        expect(now, `${c.id}: "${s.file} § ${s.heading}" is gone from the guide — review the rule by hand`).not.toBeNull();
        expect(now!.url).toMatch(/^https:\/\/1dsag\.github\.io\/ABAP-Leitfaden\/.+#[^#\s]+$/);
        expect(now!.hash, `${c.id}: DSAG changed "${s.file} § ${s.heading}" (${now!.url}) — review the adopted rule by hand, then record the new hash`).toBe(s.hashAtAdoption);
      }
    });
  }

  test('sections we do not follow are watched softly — a change is an annotation, not a failure', () => {
    const soft = DSAG_CITATIONS.flatMap((c) => [
      ...(c.watched ?? []).map((s) => ({ id: c.id, s })),
      ...(c.status === 'not-adopted' ? c.sections.map((s) => ({ id: c.id, s })) : []),
    ]);
    expect(soft.length).toBeGreaterThan(0);
    for (const { id, s } of soft) {
      const now = dsagSection(s.file, s.heading);
      if (!now || now.hash !== s.hashAtAdoption) {
        test.info().annotations.push({
          type: 'dsag-watch',
          description: `${id}: "${s.file} § ${s.heading}" ${now ? 'changed' : 'is gone'} — the guide may have corrected itself; reconsider the decision.`,
        });
      }
    }
  });
});

test.describe('code that cites the guide cites an adopted section', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== 'generated' && !e.name.startsWith('.')) walk(rel, out);
      } else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) out.push(rel);
    }
    return out;
  }

  test('every "// DSAG ABAP guideline:" comment names a section a row adopts', () => {
    const adopted = new Set(
      DSAG_CITATIONS.filter((c) => c.status !== 'not-adopted').flatMap((c) => c.sections.map((s) => dsagGuidelineComment(s.file, s.heading))),
    );
    const prefix = DSAG_GUIDELINE_COMMENT_PREFIX.trim();
    const unknown: string[] = [];
    for (const file of ['app', 'components', 'lib', 'hooks', 'scripts'].filter((d) => fs.existsSync(path.join(ROOT, d))).flatMap((d) => walk(d))) {
      read(file)
        .split(/\r?\n/)
        .forEach((line, i) => {
          const at = line.indexOf(prefix);
          if (at < 0) return;
          const m = /\/\/ DSAG ABAP guideline: (\S+\.md) § (.+?)\s*$/.exec(line.slice(at));
          if (!m) return; // the prefix constant itself, or prose about the convention
          if (!adopted.has(dsagGuidelineComment(m[1], m[2]))) unknown.push(`${file}:${i + 1} ${m[1]} § ${m[2]}`);
        });
    }
    expect(unknown, 'cite a section a row of lib/dsag-citations.ts adopts, file and heading exactly as there').toEqual([]);
  });
});

test.describe('anchors as the published site builds them (kramdown GFM auto ids)', () => {
  test('lower case, non-word characters dropped, spaces to hyphens', () => {
    expect(gfmHeaderSlug('Fiori & SAPUI5')).toBe('fiori--sapui5');
    expect(gfmHeaderSlug('“NIEMALS SAP CODE KOPIEREN”')).toBe('niemals-sap-code-kopieren');
    expect(gfmHeaderSlug('Beispiel: Massendatentransferierung')).toBe('beispiel-massendatentransferierung');
    expect(gfmHeaderSlug("DON'T")).toBe('dont');
    expect(gfmHeaderSlug('Nutzung neuer Befehlsvarianten (CALL TRANSACTION WITH AUTHORITY-CHECK)')).toBe(
      'nutzung-neuer-befehlsvarianten-call-transaction-with-authority-check',
    );
    expect(gfmHeaderSlug('Qualitätssicherung und -Monitoring')).toBe('qualitätssicherung-und--monitoring');
  });

  test('repeats get -1, -2; code fences are not headings; {#id} wins; trailing hashes go', () => {
    const page = ['---', 'title: T', 'permalink: /x/', '---', '# A', '## Fazit', '```abap', '# not a heading', '```', '## Fazit', '~~~', '## no', '~~~', '## Fazit ##', '### Own {#own-id}'].join('\n');
    const { headings } = parsePage(page);
    expect(headings.map((h) => h.anchor)).toEqual(['a', 'fazit', 'fazit-1', 'fazit-2', 'own-id']);
    expect(headings[3].heading).toBe('Fazit');
  });

  test('a section hash ignores line endings and trailing blanks, not words', () => {
    expect(sectionHash('## A\r\nText  \r\n')).toBe(sectionHash('## A\nText'));
    expect(sectionHash('## A\nText')).not.toBe(sectionHash('## A\nTexts'));
  });
});
