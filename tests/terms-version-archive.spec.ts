import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID, TERMS_VERSION } from '../lib/constants';
import {
  ARCHIVED_TERMS_VERSIONS,
  TERMS_ARCHIVE_DIR,
  archivedTerms,
  archivedTermsSha256,
  normaliseTermsText,
  parseArchivedTerms,
} from '../lib/terms-versions';
import { recordConsent } from '../lib/consent';

/**
 * The archive of Terms versions, and the three promises it has to keep.
 *
 *   1. **§ 10.5 is true.** "The operator publishes the current version of these
 *      Terms, together with all previous versions and their effective dates, at
 *      clean-core.io/terms." That clause arrived with the legal review of
 *      18.09.2026 into a page that showed one version and kept none. A promise
 *      made in a contract and kept by nothing is the kind of sentence this
 *      repository removes rather than adds, so the archive was built instead —
 *      and a reader has to be able to reach every version from `/terms`.
 *
 *   2. **A version, once published, never changes again.** That is what makes
 *      the digest evidence rather than decoration: `lib/consent.ts` writes it
 *      into an append-only record, and an archived text edited afterwards would
 *      silently turn every record naming that version into a statement about
 *      words that no longer exist. The digest is written down beside the file in
 *      `lib/terms-versions.ts`; recomputing it here is what makes an edit
 *      visible.
 *
 *   3. **The digest is the same everywhere.** This repository has been bitten
 *      twice by line endings — the workflow guards that read zero commands out
 *      of nine CRLF workflow files, and the Firestore rules whose recorded hash
 *      disagreed with its own working copy. Both were answered the same way, by
 *      hashing the LF-normalised text, and so is this. The test below does not
 *      take that on trust: it hashes a CRLF copy of the same words and requires
 *      the same digest, and requires the *un*-normalised CRLF bytes to hash
 *      differently, so a normalisation quietly removed would fail rather than
 *      pass vacuously.
 *
 * The fourth test is the one that ties the archive to the account. A consent
 * record is supposed to carry version, timestamp, wording and account; the
 * wording was the part nothing could show. It can now, and if the version being
 * accepted has no archived text, the record has to say so with null rather than
 * name somebody else's words.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const sha256 = (text: string) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

/** Entities resolved and whitespace flattened, so source and screen can be compared. */
function normalise(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&nbsp;| /g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function adminDb(): Firestore {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
}

test.describe('every archived version has a text, a date and a digest', () => {
  test('the index is not empty and every entry is fully described', () => {
    expect(ARCHIVED_TERMS_VERSIONS.length, 'the archive lists no version at all').toBeGreaterThan(0);

    const ids = ARCHIVED_TERMS_VERSIONS.map((v) => v.version);
    expect(new Set(ids).size, 'two entries share a version id').toBe(ids.length);

    for (const entry of ARCHIVED_TERMS_VERSIONS) {
      // The id is what `consent_events.termsVersion` stores, and `TERMS_VERSION`
      // is a date — an entry keyed any other way could never be matched to a
      // record.
      expect(entry.version, `${entry.version} is not a date, and a version id is`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(entry.version)), `${entry.version} is not a real date`).toBe(false);
      expect(entry.label.trim().length, `${entry.version} has no label`).toBeGreaterThan(1);
      expect(entry.effectiveOn.trim().length, `${entry.version} names no effective date`).toBeGreaterThan(5);
      expect(entry.sha256, `${entry.version} carries no 64-digit lowercase SHA-256`).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.file.startsWith(`${TERMS_ARCHIVE_DIR}/`), `${entry.version} is stored outside the archive`).toBe(true);
      expect(fs.existsSync(path.resolve(ROOT, entry.file)), `${entry.file} is not in the repository`).toBe(true);
      // A file that exists but says nothing would satisfy every check above.
      expect(read(entry.file).trim().length, `${entry.file} is empty`).toBeGreaterThan(2000);
      // The provenance, so the claim "this is the text that was in force" is one
      // anybody can check against git rather than take on trust.
      expect(entry.source.commit, `${entry.version} names no source commit`).toMatch(/^[0-9a-f]{40}$/);
      expect(entry.source.blob, `${entry.version} names no source blob`).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  /**
   * The provenance is checked against git, not only for shape.
   *
   * The test above proves `commit` and `blob` are forty hex digits. Replace them
   * with any other forty hex digits and it still passes, while the archive keeps
   * saying the wording came from that git object. A QA review named this
   * (49052dedfc1c): a claim about provenance that nothing checks is decoration.
   *
   * `git rev-parse <commit>:<file>` is the blob the entry claims to be, and the
   * entry's own comment says so — this runs that command. Two honest limits: it
   * needs the commit to be present, and CI clones shallow (`actions/checkout`
   * with no `fetch-depth`), so there this test says "not checkable here" and
   * skips with that reason rather than passing on nothing or failing on the
   * clone. Every developer checkout has the history; it runs there.
   */
  test('the recorded blob is what git holds at the recorded commit', () => {
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

    for (const entry of ARCHIVED_TERMS_VERSIONS) {
      const { commit, file, blob } = entry.source;

      let commitPresent = true;
      try {
        git('rev-parse', '--verify', '--quiet', `${commit}^{commit}`);
      } catch {
        commitPresent = false;
      }
      test.skip(
        !commitPresent,
        `commit ${commit.slice(0, 12)} is not in this clone (shallow checkout) — the archive's provenance cannot be checked here`,
      );

      // With the commit present, a missing file or a different blob is a real
      // failure, and the error must say which: this is the point of the test.
      let actual = '';
      try {
        actual = git('rev-parse', `${commit}:${file}`);
      } catch {
        throw new Error(`${entry.version}: ${file} does not exist at commit ${commit} — the archive names a source that git does not have`);
      }
      expect(
        actual,
        // Both hashes in full: a flipped last digit is exactly the case this
        // exists for, and a twelve-character prefix would print two equal strings.
        `${entry.version}: the archive says ${file} at ${commit.slice(0, 12)} is blob ${blob}, git says ${actual}`,
      ).toBe(blob);
    }
  });

  test('the directory holds exactly the versions the index lists', () => {
    // Both directions. An unlisted file is a text nobody publishes and nothing
    // hashes; a listed file that is gone is a link to a 500.
    const onDisk = fs
      .readdirSync(path.resolve(ROOT, TERMS_ARCHIVE_DIR))
      .map((name) => `${TERMS_ARCHIVE_DIR}/${name}`)
      .sort();
    const listed = ARCHIVED_TERMS_VERSIONS.map((v) => v.file).sort();
    expect(onDisk, `${TERMS_ARCHIVE_DIR} and lib/terms-versions.ts disagree about what is archived`).toEqual(listed);
  });

  test('each digest is the SHA-256 of the archived wording', () => {
    for (const entry of ARCHIVED_TERMS_VERSIONS) {
      expect(
        sha256(normaliseTermsText(read(entry.file))),
        `${entry.file} no longer hashes to the digest lib/terms-versions.ts records for it. A published ` +
          'version never changes: if the text has to be corrected, that is a new version with a new ' +
          'effective date, not an edit — every consent record naming this one says these exact words.',
      ).toBe(entry.sha256);
    }
  });

  test('and the digest does not move with the line endings', () => {
    for (const entry of ARCHIVED_TERMS_VERSIONS) {
      const lf = normaliseTermsText(read(entry.file));
      const crlf = lf.replace(/\n/g, '\r\n');
      expect(
        sha256(normaliseTermsText(crlf)),
        `${entry.file} hashes differently when checked out with CRLF — a consent record written on ` +
          'Windows would then disagree with the same record written in CI.',
      ).toBe(entry.sha256);
      // And the normalisation is doing work: without it the two forms differ, so
      // a check that quietly stopped normalising could not pass by accident.
      expect(sha256(crlf), 'the CRLF form hashes the same without normalising — this test proves nothing').not.toBe(
        entry.sha256,
      );
    }
  });

  test('the working tree is held to LF as well, the way the rules and the corpus are', () => {
    expect(
      read('.gitattributes'),
      'docs/terms is not pinned to LF. The digest survives a CRLF checkout, but the file a reader ' +
        'downloads should be the file the digest names.',
    ).toMatch(/^docs\/terms\/\*\*\s+text\s+eol=lf$/m);
  });
});

test.describe('the archived text is the one that was in force', () => {
  /**
   * v2.0.0 is recognisable by what the rewrite of 18.09.2026 took out of it.
   *
   * These are the clauses `tests/terms-consumer-law-guard.spec.ts` forbids on
   * the current page, each of them void or unclear under German law. Finding
   * them here is the strongest available evidence that this file is the old
   * wording and not a copy of the new one that somebody filed under an old date
   * — and it is the same reason the archive lives on its own route: none of
   * these sentences may appear on `/terms`.
   */
  const V2_0_0_ONLY = [
    'The operator may modify, suspend, or discontinue the Platform, in whole or in part, at any time',
    'the operator is otherwise liable only for intent and gross negligence',
    'or compilation status of any output, to the extent permitted by law',
    'remove quotas at any time',
    'at its discretion and without notice',
    'Continued use of the Platform after changes take effect constitutes acceptance',
    'shall be replaced by a valid provision that comes as close as legally possible',
  ];

  test('v2.0.0 carries the clauses the current Terms replaced', () => {
    const entry = archivedTerms('2026-07-07');
    expect(entry, 'v2.0.0 is no longer archived').toBeTruthy();
    const text = normalise(read(entry!.file));
    expect(text, 'the archived text does not state its own version').toContain(
      normalise('effective 7 July 2026 (v2.0.0)'),
    );
    for (const clause of V2_0_0_ONLY) {
      expect(
        text,
        `${entry!.file} no longer contains "${clause}". That sentence is how this file is known to be the ` +
          'text that was in force until 18.09.2026 rather than a later one.',
      ).toContain(normalise(clause));
    }
  });

  test('the archived Markdown parses into the blocks the page renders', () => {
    for (const entry of ARCHIVED_TERMS_VERSIONS) {
      const blocks = parseArchivedTerms(read(entry.file));
      expect(blocks.length, `${entry.file} parses to nothing`).toBeGreaterThan(20);
      expect(blocks[0], `${entry.file} does not begin with its title`).toEqual({
        kind: 'heading',
        level: 1,
        text: 'Terms of Service & Community Guidelines',
      });
      // Nothing is silently dropped: every non-empty chunk of the file becomes a
      // block, so the page cannot publish a partial contract.
      const chunks = normaliseTermsText(read(entry.file))
        .split(/\n{2,}/)
        .filter((c) => c.trim().length > 0).length;
      const items = blocks.reduce((n, b) => n + (b.kind === 'list' ? b.items.length : 1), 0);
      expect(items, `${entry.file} loses text between the file and the blocks`).toBe(chunks);
    }
  });
});

test.describe('a reader opening /terms finds the archive', () => {
  test('every archived version is listed with its effective date and a link to its text', async ({ page }) => {
    await page.goto('/terms', { waitUntil: 'domcontentloaded' });
    const rendered = normalise(await page.locator('body').innerText());
    expect(rendered.length, '/terms rendered nothing').toBeGreaterThan(2000);

    for (const entry of ARCHIVED_TERMS_VERSIONS) {
      const row = page.locator(`[data-terms-archive-entry="${entry.version}"]`);
      await expect(row, `/terms does not list ${entry.label} — section 10.5 says it must`).toHaveCount(1);
      const text = normalise(await row.innerText());
      expect(text, `the entry for ${entry.label} does not name the version`).toContain(entry.label);
      expect(text, `the entry for ${entry.label} does not name its effective date`).toContain(entry.effectiveOn);
      const href = await row.locator('a').first().evaluate((el) => (el as HTMLAnchorElement).getAttribute('href'));
      expect(href, `the entry for ${entry.label} does not link to its full text`).toBe(
        `/terms/versions/${entry.version}`,
      );
    }
  });

  test('the link reaches the whole text, and the digest a consent record would carry', async ({ page }) => {
    for (const entry of ARCHIVED_TERMS_VERSIONS) {
      const response = await page.goto(`/terms/versions/${entry.version}`, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), `/terms/versions/${entry.version} did not answer`).toBe(200);

      await expect(page.locator('[data-archived-version]')).toHaveText(entry.version);
      await expect(page.locator('[data-archived-effective]')).toHaveText(entry.effectiveOn);
      await expect(
        page.locator('[data-archived-sha256]'),
        'the page prints a digest other than the one recorded for this version',
      ).toHaveText(entry.sha256);

      // The whole contract, not an excerpt: every block of the archived file has
      // to be on the page. A version published in part is a version nobody can
      // rely on having accepted.
      const article = normalise(await page.locator('[data-archived-text]').innerText());
      for (const block of parseArchivedTerms(read(entry.file))) {
        const wanted =
          block.kind === 'heading'
            ? block.text
            : block.kind === 'list'
              ? block.items.join(' ')
              : block.lines.join(' ');
        expect(
          article,
          `/terms/versions/${entry.version} does not show: "${wanted.slice(0, 80)}…"`,
        ).toContain(normalise(wanted));
      }
    }
  });
});

test.describe('a consent record carries the wording it was given for', () => {
  const uid = `terms-archive-spec-${Date.now()}`;

  test.afterAll(async () => {
    const db = adminDb();
    const snap = await db.collection('consent_events').where('uid', '==', uid).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete().catch(() => {})));
    await db.collection('users').doc(uid).delete().catch(() => {});
  });

  test('recordConsent stores the digest of the version it records', async () => {
    await recordConsent({
      uid,
      email: `${uid}@cleancore-test.io`,
      source: 'tests/terms-version-archive.spec.ts',
      locale: 'en',
    });

    const snap = await adminDb().collection('consent_events').where('uid', '==', uid).get();
    expect(snap.size, 'recordConsent wrote no append-only event').toBe(1);
    const row = snap.docs[0].data();

    expect(row.termsVersion, 'the record names a version the server did not serve').toBe(TERMS_VERSION);
    expect(
      row.contentSha256,
      'the record no longer carries the digest of the archived wording for the version it names',
    ).toBe(archivedTermsSha256(TERMS_VERSION));

    if (archivedTerms(TERMS_VERSION)) {
      // The version being accepted is archived, so the wording is pinned and the
      // record has to say which words they were.
      expect(row.contentSha256, `${TERMS_VERSION} is archived and the record still says nothing`).toMatch(
        /^[0-9a-f]{64}$/,
      );
      expect(row.contentSha256).toBe(sha256(normaliseTermsText(read(archivedTerms(TERMS_VERSION)!.file))));
    } else {
      // It is not archived yet — which is the state on the day the archive was
      // built, because the version then current had not gone live. Null is the
      // only honest value: any digest here would be an immutable claim that the
      // account accepted words it was never shown.
      expect(
        row.contentSha256,
        `${TERMS_VERSION} has no archived text, so the record must say null rather than name another ` +
          "version's words",
      ).toBeNull();
    }
  });

  test('and the digest it would store is the one the archived file hashes to', () => {
    // The assertion above compares the record with the same function the writer
    // uses, which proves the wiring and not the value. This is the other end of
    // the chain: for a version that *is* archived, the function answers the hash
    // of the words on disk.
    const entry = archivedTerms('2026-07-07');
    expect(entry, 'v2.0.0 is no longer archived').toBeTruthy();
    expect(archivedTermsSha256('2026-07-07')).toBe(sha256(normaliseTermsText(read(entry!.file))));
    expect(archivedTermsSha256('1999-01-01'), 'an unpublished version must not resolve to a digest').toBeNull();
    expect(archivedTermsSha256(null)).toBeNull();
  });
});
