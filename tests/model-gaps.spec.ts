import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { readModelGaps, gapsUnreadableSentence } from '../lib/model-gaps';
import { formatAnalysisToMarkdown } from '../lib/markdownFormatter';

/**
 * The narrative's `gaps`, read one way everywhere (decision 24.09.2026).
 *
 * The prompt asks for a list. The product's default model answered the
 * 1,000-line starter example with a single object in two of three runs, and
 * every reader dropped it: `Array.isArray(...) ? ... : []`. A single object is
 * now a list of one; every other shape is reported, never guessed and never
 * dropped in silence.
 */

const gap = (title: string) => ({
  title,
  severity: 'High',
  strategy: 'Side-by-Side',
  rationale: 'because',
  complexity: 'Medium',
});

test.describe('readModelGaps', () => {
  test('a list is read as it is, entries untouched', () => {
    const list = [gap('A'), gap('B')];
    const reading = readModelGaps(list);
    expect(reading.unreadable).toBeNull();
    expect(reading.gaps).toEqual(list);
    // Same objects, not copies: a well-formed answer reads exactly as before.
    expect(reading.gaps[0]).toBe(list[0]);
  });

  test('an empty list is no gaps and nothing to report', () => {
    expect(readModelGaps([])).toEqual({ gaps: [], unreadable: null });
  });

  test('absent or null is no gaps and nothing to report', () => {
    expect(readModelGaps(undefined)).toEqual({ gaps: [], unreadable: null });
    expect(readModelGaps(null)).toEqual({ gaps: [], unreadable: null });
  });

  test('a single object is a list of exactly that one gap', () => {
    const only = gap('Only');
    const reading = readModelGaps(only);
    expect(reading.unreadable).toBeNull();
    expect(reading.gaps).toHaveLength(1);
    expect(reading.gaps[0]).toBe(only);
  });

  test('text is reported, not read', () => {
    const reading = readModelGaps('Several gaps exist.');
    expect(reading.gaps).toEqual([]);
    expect(reading.unreadable).toBe('text instead of a list');
  });

  test('a number is reported, not read', () => {
    const reading = readModelGaps(3);
    expect(reading.gaps).toEqual([]);
    expect(reading.unreadable).toBe('a number instead of a list');
  });

  test('an object without a title is reported, not invented', () => {
    for (const value of [{ severity: 'High' }, { title: '' }, { title: '   ' }, { title: 42 }]) {
      const reading = readModelGaps(value);
      expect(reading.gaps).toEqual([]);
      expect(reading.unreadable).toBe('an object without a title');
    }
  });

  test('a mixed list keeps the readable entries and reports the rest', () => {
    const good = gap('Good');
    const reading = readModelGaps([good, 'text', { severity: 'Low' }, null, 7]);
    expect(reading.gaps).toEqual([good]);
    expect(reading.unreadable).toBe('4 of 5 entries without a title');
  });

  test('a list with no readable entry says so', () => {
    expect(readModelGaps(['a', 'b']).unreadable).toBe('all 2 entries without a title');
    expect(readModelGaps([{}]).unreadable).toBe('one entry without a title');
  });

  test('the sentence names what could not be read and where it is not', () => {
    expect(gapsUnreadableSentence('text instead of a list')).toBe(
      'The model returned gaps in a form that could not be read (text instead of a list); they are not in the worklist.',
    );
  });
});

test.describe('every reader of the model gaps goes through readModelGaps', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

  for (const file of [
    'lib/analysis-run.ts',
    'lib/markdownFormatter.ts',
    'app/api/runs/create/route.ts',
    'app/(app)/project/[projectId]/analyze/page.tsx',
  ]) {
    test(`${file} reads gaps only through it`, () => {
      const src = read(file);
      expect(src).toContain('readModelGaps(');
      // The old readers: `obj.gaps || []`, `Array.isArray(x.gaps)`, `data.gaps?.map`.
      expect(src).not.toMatch(/\.gaps\s*\|\|\s*\[\]/);
      expect(src).not.toMatch(/Array\.isArray\(\s*\w+\.gaps\s*\)/);
      expect(src).not.toMatch(/\.gaps\?\.map/);
    });
  }

  test('the signing route reads the gaps and never rewrites them into the narrative it hashes', () => {
    // `finalAnalysisText` is `JSON.stringify(analysisObj)` and its SHA-256 is
    // inside the signed payload (`aiNarrativeMeta.responseHash`). Writing the
    // normalised list back would change those bytes for a single-object answer
    // and is not needed: every screen reads the stored shape through the same
    // function.
    const src = read('app/api/runs/create/route.ts');
    expect(src).not.toMatch(/analysisObj\.gaps\s*=/);
    expect(src).toMatch(/gapsList = readModelGaps\(analysisObj\.gaps\)\.gaps;/);
  });
});

test.describe('a real answer: gemini-3.8-flash on the 1,000-line starter example', () => {
  // Model output for a public starter example (roadmap 17.4, results-174),
  // one of the two runs in which `gaps` arrived as a single object.
  const answer = JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 'model-gaps-single-object.gemini-3.8-flash.json'), 'utf8'),
  );

  test('the fixture is the case it claims to be', () => {
    expect(Array.isArray(answer.gaps)).toBe(false);
    expect(typeof answer.gaps).toBe('object');
  });

  test('its one gap is read, not dropped', () => {
    const reading = readModelGaps(answer.gaps);
    expect(reading.unreadable).toBeNull();
    expect(reading.gaps).toHaveLength(1);
    expect(reading.gaps[0].title).toBe(answer.gaps.title);
  });

  test('the Markdown export carries it', () => {
    const md = formatAnalysisToMarkdown(JSON.stringify(answer));
    expect(md).toContain('Functional Gaps & Extensibility Strategies');
    expect(md).toContain(`**${answer.gaps.title}**`);
  });

  test('the Markdown export says so when the shape cannot be read', () => {
    const md = formatAnalysisToMarkdown(JSON.stringify({ ...answer, gaps: 'see above' }));
    expect(md).toContain(gapsUnreadableSentence('text instead of a list'));
  });
});

/* ======================== the signing route, driven with the model's answer */
//
// QA review of 4b4586aff273 (bd6aa69c347b): the source check above proves the
// route *calls* readModelGaps; this proves what it does with the answer. The
// single-object fixture is the answer the product's model actually returned.
// Seeded and read through the Admin SDK against the emulator, like
// `tests/input-manifest.spec.ts`. Needs the app and the emulators.

test.describe('runs/create with the model’s single-object gaps (server side)', () => {
  test.describe.configure({ mode: 'serial' });

  const EMAIL = `modelgaps-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'ModelGaps123!';
  const PROJECT_ID = `p-modelgaps-${Date.now()}`;
  const SOURCE = 'REPORT z_gaps.\nDATA lv_c TYPE i.\nSELECT COUNT(*) FROM ekpo INTO lv_c.\nWRITE lv_c.\n';
  const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'model-gaps-single-object.gemini-3.8-flash.json'), 'utf8');
  let token = '';
  let db: Firestore;

  const read = async (path: string) => (await db.doc(path).get()).data()!;
  const functionalGaps = (worklist: unknown): Array<{ category?: string; title?: string }> =>
    (Array.isArray(worklist) ? worklist : []).filter((item: { category?: string }) => item.category === 'Functional Gap');

  test.beforeAll(async () => {
    const adminApp = getAdminApps()[0] ?? initAdminApp({ projectId: firebaseConfig.projectId });
    db = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    token = await cred.user.getIdToken();
    await db.doc(`users/${cred.user.uid}`).set({
      firstName: 'Model', lastName: 'Gaps', email: EMAIL, tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 10, termsVersionAccepted: TERMS_VERSION,
      mfaEnabled: false, createdAt: new Date(),
    });
    await db.doc(`projects/${PROJECT_ID}`).set({
      name: 'Model gaps fixture', userId: cred.user.uid, createdAt: new Date(), status: 'uploaded', legacyCode: SOURCE,
    });
  });

  test('a single-object answer is signed, and its one gap reaches the worklist, not the signed run', async ({ request }) => {
    const answer = JSON.parse(FIXTURE) as { gaps: { title: string } };
    expect(Array.isArray(answer.gaps), 'the fixture is no longer the single-object answer').toBe(false);

    const res = await request.post('/api/runs/create', {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: PROJECT_ID, legacyCode: SOURCE, s4Deployment: 'public', analysis: FIXTURE, uploadedFileName: 'z_gaps.abap' },
    });
    expect(res.status(), await res.text()).toBe(200);
    const { runId } = await res.json();

    const project = await read(`projects/${PROJECT_ID}`);
    const gaps = functionalGaps(project.worklist);
    expect(gaps, 'the single gap was dropped on the way to the worklist').toHaveLength(1);
    expect(gaps[0].title).toBe(answer.gaps.title);

    const run = await read(`projects/${PROJECT_ID}/runs/${runId}`);
    // Narrative, not evidence: the signed worklist carries findings only.
    expect(functionalGaps(run.worklist)).toHaveLength(0);
    // And the narrative keeps the gaps as the model sent them: read, not rewritten.
    expect(JSON.parse(run.analysis).gaps).toEqual(answer.gaps);
  });

  test('an unreadable shape is not signed as an empty list: the narrative keeps it, and the reader reports it', async ({ request }) => {
    const answer = { ...JSON.parse(FIXTURE), gaps: 'see the recommendations above' };
    const res = await request.post('/api/runs/create', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        projectId: PROJECT_ID,
        legacyCode: `${SOURCE}* second run\n`,
        s4Deployment: 'public',
        analysis: JSON.stringify(answer),
        uploadedFileName: 'z_gaps.abap',
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const { runId } = await res.json();

    const project = await read(`projects/${PROJECT_ID}`);
    expect(functionalGaps(project.worklist), 'a gap was guessed out of text').toHaveLength(0);
    const run = await read(`projects/${PROJECT_ID}/runs/${runId}`);
    const stored = JSON.parse(run.analysis).gaps;
    expect(stored, 'the unreadable answer was replaced by an empty list').toBe('see the recommendations above');
    // What every screen and the Markdown export do with it: say so.
    expect(readModelGaps(stored).unreadable).toBe('text instead of a list');
  });
});
