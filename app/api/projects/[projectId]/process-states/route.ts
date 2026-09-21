import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import {
  verifyRequestAuth,
  getAdminDb,
  assertAccountActive,
  assertMfaSatisfied,
  QuotaError,
} from '@/lib/firebase-admin';
import { mayReadProject } from '@/lib/project-readers';
import { assertRateLimit } from '@/lib/rate-limit';
import { sha256Hex } from '@/lib/artefact-digest';
import { kindWord, parseBpmn } from '@/lib/process-map';
import { deriveBusinessRules, rulesForElement, type BusinessRule } from '@/lib/abap/business-rule-set';
import { PROCESS_REVISION_COLLECTION, isProcessRevisionRecord } from '@/lib/process-revisions';
import {
  MAX_STATE_ENTRIES,
  PROCESS_STATE_COLLECTION,
  PROCESS_STATE_FORMAT_VERSION,
  applyStateChoices,
  checkStateChoices,
  isStateEntry,
  type ProcessStateView,
  type RuleLink,
  type StateEntry,
  type StateSubject,
} from '@/lib/process-states';

/**
 * Keep · Change deliberately · Drop · Clarify, per element and per rule —
 * roadmap 3.5.
 *
 *   GET  → `{ view }`: the subjects that exist, the confirmations made, and
 *          which elements each rule was drawn into.
 *   POST { baseRevision, choices } → `{ view, created }`: a new Bedarfsrevision.
 *
 * **Why the states are their own subcollection and not another process
 * revision.** A confirmation is a statement about the need; a process revision
 * is a drawing. Five reasons, and the second one is decisive:
 *
 *   1. a process revision has to carry BPMN — `checkRevisionXml` refuses
 *      anything that is not a `definitions` document, and the record type makes
 *      `xml` required. A confirmation draws nothing.
 *   2. `process-revisions` answers a save of unchanged bytes with *no write* on
 *      purpose. Confirming a rule changes no bytes, so storing a confirmation
 *      there would mean weakening that rule — which is the one thing that stops
 *      a retried save from becoming a second revision.
 *   3. revision 1 is the reconstructed Ist and nothing may change it. Sharing
 *      the collection would leave only two ways to record the first
 *      confirmation: write into revision 1, which is forbidden, or create a
 *      revision 2 that is a byte-for-byte copy of a drawing nobody drew.
 *   4. the two move independently. A model can be redrawn ten times with the
 *      need untouched, and the need confirmed twenty times with the model
 *      untouched; one counter for both would make "Bedarfsrevision 7" a number
 *      about nothing.
 *   5. the roadmap names it a *Bedarfsrevision* — a different noun, and it adds
 *      in the same line: no code conservation.
 *
 * Everything else is 3.2's shape, because the properties are the same ones:
 * `projects/{projectId}/process_states/{n}` through the Admin SDK, created with
 * `DocumentReference.create()` so a written revision is never written again;
 * account and time from the server and never from the body; owner only, for
 * reading as for writing. `firestore.rules` has no match for the subcollection,
 * so no client reads or writes it and **no rules change and no rules deploy**
 * are needed. Project and account deletion take it along: both call
 * `recursiveDelete` on the project document, which descends into every
 * subcollection, named or not.
 *
 * **What the subjects are, and why they are pinned to revision 1.** The need is
 * stated about the Ist — what the program does today — so the elements are the
 * elements of the reconstructed revision 1 and the rules are derived from the
 * source that revision 1 was reconstructed from. Revision 1 descends from a run
 * that was loaded and verified (`process-revisions`), so this route inherits
 * that check instead of repeating it, and refuses outright when the project's
 * source no longer hashes to what revision 1 was built from: rules derived from
 * other bytes would be rules of another program.
 *
 * **Not evidence.** A confirmation records that an account said something at a
 * time. It enters no signed run and no audit pack. Accountability is the
 * signed-in account — a self-declaration, not an organisational mandate.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProjectShape {
  userId?: unknown;
  legacyCode?: unknown;
}

type Gate =
  | { ok: true; uid: string; projectId: string; project: ProjectShape }
  | { ok: false; response: NextResponse };

async function openProject(
  req: NextRequest,
  params: Promise<{ projectId: string }>,
  mutating: boolean,
): Promise<Gate> {
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) {
    return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  }

  // The subjects are the process and the rules read out of the project's code.
  // A token from before the second factor reads neither, here as in Firestore.
  try {
    await assertMfaSatisfied(req, decodedToken);
  } catch (mfaErr: unknown) {
    const q = mfaErr as { message?: string; status?: number };
    return {
      ok: false,
      response: NextResponse.json(
        { error: q?.message || 'Multi-factor authentication required.' },
        { status: q?.status || 403 },
      ),
    };
  }

  if (mutating) {
    try {
      await assertRateLimit(`process-states:${decodedToken.uid}`, 120, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return {
        ok: false,
        response: NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 }),
      };
    }
    try {
      await assertAccountActive(decodedToken.uid, {
        requireCurrentTerms: true,
        isAdminClaim: decodedToken.admin === true,
      });
    } catch (gateErr: unknown) {
      if (gateErr instanceof QuotaError) {
        return { ok: false, response: NextResponse.json({ error: gateErr.message }, { status: gateErr.status }) };
      }
      throw gateErr;
    }
  }

  const { projectId } = await params;
  if (!projectId || typeof projectId !== 'string') {
    return { ok: false, response: NextResponse.json({ error: 'Missing project id.' }, { status: 400 }) };
  }

  const { db } = await getAdminDb();
  const snap = await db.collection('projects').doc(projectId).get();
  if (!snap.exists) {
    return { ok: false, response: NextResponse.json({ error: 'Project not found.' }, { status: 404 }) };
  }
  const project = (snap.data() || {}) as ProjectShape;
  // Reading is by membership, writing is the owner's: an invited reader may
  // open what the owner shared and never change or start anything. Until
  // 19.09.2026 this asked for the owner on GET as well, so a valid invitation
  // opened the project and hid its process (Gegenreview c5085bb, CR-13).
  if (mutating ? project.userId !== decodedToken.uid : !mayReadProject(project, decodedToken.uid)) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized.' }, { status: 403 }) };
  }
  return { ok: true, uid: decodedToken.uid, projectId, project };
}

type AdminDb = Awaited<ReturnType<typeof getAdminDb>>['db'];

function statesOf(db: AdminDb, projectId: string) {
  return db.collection('projects').doc(projectId).collection(PROCESS_STATE_COLLECTION);
}

/** A Firestore Timestamp, a Date or an ISO string, as ISO. */
function isoOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  const maybe = value as { toDate?: () => Date } | null;
  if (maybe && typeof maybe.toDate === 'function') return maybe.toDate().toISOString();
  return '';
}

/** The name on the profile, or the e-mail. Read here, never sent by a browser. */
async function accountOf(db: AdminDb, uid: string): Promise<StateEntry['account']> {
  let name = '';
  let email = '';
  try {
    const snap = await db.collection('users').doc(uid).get();
    const data = (snap.data() || {}) as { firstName?: string; lastName?: string; email?: string };
    name = [data.firstName, data.lastName].filter(Boolean).join(' ').trim();
    email = typeof data.email === 'string' ? data.email : '';
  } catch {
    /* a missing profile must not stop the confirmation — it is named by its account id below */
  }
  return { uid, name: name || email || uid };
}

interface StoredStates {
  revision: number;
  entries: StateEntry[];
}

/** The newest Bedarfsrevision, or revision 0 with no entries when there is none. */
async function latestStates(db: AdminDb, projectId: string): Promise<StoredStates> {
  // Ordered by the field and not by the document id: ids are "1", "2" … "10",
  // and as strings "10" sorts before "2".
  const snap = await statesOf(db, projectId).orderBy('revision', 'desc').limit(1).get();
  if (snap.empty) return { revision: 0, entries: [] };
  const data = (snap.docs[0].data() || {}) as Record<string, unknown>;
  if (data.formatVersion !== PROCESS_STATE_FORMAT_VERSION) return { revision: 0, entries: [] };
  const raw = Array.isArray(data.entries) ? data.entries : [];
  return {
    revision: typeof data.revision === 'number' ? data.revision : 0,
    entries: raw
      .map((e) => {
        const entry = e as Record<string, unknown>;
        return { ...entry, confirmedAt: isoOf(entry.confirmedAt) } as StateEntry;
      })
      .filter(isStateEntry),
  };
}

/* ------------------------------------------------------------------ *
 * The subjects: the elements of the Ist and the rules of its source.
 * ------------------------------------------------------------------ */

/** "line 5", "lines 5 to 9", or null — the wording `lib/process-map.ts` uses. */
function anchorWords(start: number | null, end: number | null): string | null {
  if (start === null) return null;
  if (end === null || end === start) return `line ${start}`;
  return `lines ${start} to ${end}`;
}

/**
 * Every place a rule stands, and not a range from the first to the last.
 *
 * `BusinessRule` carries no line range on purpose — a rule copied into fourteen
 * routines stands at fourteen places, and one range over them would claim the
 * nine hundred lines in between. So the anchor line names the places, up to six
 * of them, and says how many more there are rather than dropping them silently.
 */
function ruleAnchor(rule: BusinessRule): string | null {
  const seen = new Set<string>();
  for (const sentence of rule.sentences) {
    for (const anchor of sentence.anchors) {
      const words = anchorWords(anchor.lineStart, anchor.lineEnd);
      if (words) seen.add(words);
    }
  }
  const places = [...seen];
  if (places.length === 0) return null;
  const shown = places.slice(0, 6).join(' · ');
  return places.length > 6 ? `${shown} · ${places.length - 6} more places` : shown;
}

interface Subjects {
  subjects: StateSubject[];
  links: RuleLink[];
  ids: { elements: string[]; rules: string[] };
}

/**
 * The subjects of this project, read out of revision 1 and the source it was
 * reconstructed from.
 *
 * The join between a rule and an element is the whole of what W22-A14's
 * "affected derivation" means: a rule names skeleton nodes in
 * `processElements`, an element carries the skeleton node it was drawn from in
 * `cc:trace/@node`, and `rulesForElement` is asked, once per element, which
 * rules name that node. Nothing else is called affected — not the rest of the
 * sub-process, not what comes after it, not the model.
 */
function readSubjects(xml: string, source: string): Subjects {
  const parsed = parseBpmn(xml);
  const subjects: StateSubject[] = [];
  const elementIds: string[] = [];

  const set = deriveBusinessRules(source);
  const linkOf = new Map<string, string[]>();
  for (const rule of set.rules) linkOf.set(rule.id, []);

  for (const element of parsed.elements) {
    elementIds.push(element.id);
    subjects.push({
      subject: element.id,
      kind: 'element',
      label: element.name || element.id,
      detail: kindWord(element.tag),
      anchor: anchorWords(element.trace?.lineStart ?? null, element.trace?.lineEnd ?? null),
    });
    const node = element.trace?.node ?? null;
    if (!node) continue;
    for (const rule of rulesForElement(set, node)) {
      linkOf.get(rule.id)?.push(element.id);
    }
  }

  for (const rule of set.rules) {
    subjects.push({
      subject: rule.id,
      kind: 'rule',
      label: rule.label,
      detail: rule.text,
      anchor: ruleAnchor(rule),
    });
  }

  return {
    subjects,
    // A rule the skeleton draws nothing for keeps an empty list rather than
    // being left out: "this rule marks nothing" is a fact, and a missing entry
    // would read as "not looked at".
    links: set.rules.map((rule) => ({ rule: rule.id, elements: linkOf.get(rule.id) ?? [] })),
    ids: { elements: elementIds, rules: set.rules.map((r) => r.id) },
  };
}

type Opened =
  | { ok: true; subjects: Subjects; stored: StoredStates }
  | { ok: false; response: NextResponse };

/**
 * Revision 1, the source it was built from, and what has been confirmed so far.
 *
 * Revision 1 is read and never made here: reconstructing it is the one write
 * that has to verify the run, and that write lives in `process-revisions`. A
 * project with no revision 1 is refused with the reason and the next step.
 */
async function open(db: AdminDb, gate: Extract<Gate, { ok: true }>): Promise<Opened> {
  const snap = await db
    .collection('projects')
    .doc(gate.projectId)
    .collection(PROCESS_REVISION_COLLECTION)
    .doc('1')
    .get();
  if (!snap.exists) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'This process has not been reconstructed yet, so there is nothing to confirm. Open the process first.',
          code: 'no-baseline',
        },
        { status: 409 },
      ),
    };
  }
  const baseline = snap.data() as Record<string, unknown>;
  const record = { ...baseline, savedAt: isoOf(baseline.savedAt) };
  if (!isProcessRevisionRecord(record)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Revision 1 of this process was written in a shape this build cannot read.', code: 'format-version' },
        { status: 409 },
      ),
    };
  }

  const source = gate.project.legacyCode;
  if (typeof source !== 'string' || source.trim() === '') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'This project has no source, so there are no rules to confirm.', code: 'no-source' },
        { status: 409 },
      ),
    };
  }
  if (sha256Hex(source) !== record.sourceSha256) {
    // Rules derived from other bytes are the rules of another program, and a
    // confirmation made against them would be a statement about a need nobody
    // read. Refused rather than answered with a different set of subjects.
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'The source changed since this process was reconstructed. Analyse it again before the need is confirmed.',
          code: 'source-moved',
        },
        { status: 409 },
      ),
    };
  }

  return { ok: true, subjects: readSubjects(record.xml, source), stored: await latestStates(db, gate.projectId) };
}

function viewOf(subjects: Subjects, stored: StoredStates): ProcessStateView {
  return {
    formatVersion: PROCESS_STATE_FORMAT_VERSION,
    revision: stored.revision,
    baselineRevision: 1,
    subjects: subjects.subjects,
    entries: stored.entries,
    links: subjects.links,
  };
}

const ALREADY_EXISTS = 6;

function isAlreadyExists(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown };
  return e?.code === ALREADY_EXISTS || String(e?.message ?? '').includes('ALREADY_EXISTS');
}

/* ------------------------------------------------------------------ */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const gate = await openProject(req, params, false);
    if (!gate.ok) return gate.response;

    const { db } = await getAdminDb();
    const opened = await open(db, gate);
    if (!opened.ok) return opened.response;

    return NextResponse.json({ view: viewOf(opened.subjects, opened.stored) });
  } catch (err: unknown) {
    logger.error('process-states read failed', { route: 'api/projects/process-states', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read what has been confirmed for this process.' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const gate = await openProject(req, params, true);
    if (!gate.ok) return gate.response;

    const { db } = await getAdminDb();
    const opened = await open(db, gate);
    if (!opened.ok) return opened.response;
    const { subjects, stored } = opened;

    const body = (await req.json().catch(() => null)) as { choices?: unknown; baseRevision?: unknown } | null;
    const checked = checkStateChoices(body?.choices, subjects.ids);
    if (!checked.ok) {
      return NextResponse.json(
        { error: checked.error, code: checked.code },
        { status: checked.code === 'unknown-subject' ? 409 : 400 },
      );
    }

    if (!Number.isInteger(body?.baseRevision) || (body!.baseRevision as number) < 0) {
      return NextResponse.json(
        { error: 'Expected { choices, baseRevision }: the revision these answers were read from.', code: 'bad-request' },
        { status: 400 },
      );
    }
    if (body!.baseRevision !== stored.revision) {
      return NextResponse.json(
        {
          error: `These answers were read from revision ${body!.baseRevision}, and revision ${stored.revision} has been confirmed since. Reload the process before confirming.`,
          code: 'revision-moved',
          latest: stored.revision,
        },
        { status: 409 },
      );
    }

    // The same answers again. Confirming a subject that already carries exactly
    // this state and this note adds a revision saying nothing happened — and a
    // browser retrying on a dropped connection would add one every time. The
    // cost is that re-affirming an unchanged need does not restamp it with
    // today's date, which is the right trade: the date on a confirmation is the
    // date the answer was *given*, and it did not change.
    const held = new Map(stored.entries.map((e) => [e.subject, e]));
    const moved = checked.choices.some((choice) => {
      const entry = held.get(choice.subject);
      return !entry || entry.state !== choice.state || (entry.note ?? null) !== (choice.note ?? null);
    });
    if (!moved) {
      return NextResponse.json({ view: viewOf(subjects, stored), created: false, unchanged: true });
    }

    const revision = stored.revision + 1;
    const entries = applyStateChoices(stored.entries, checked.choices, {
      account: await accountOf(db, gate.uid),
      // The server's clock. A time a browser supplied would be a time anyone
      // could choose, and every confirmation would say whatever the last caller
      // wanted it to say.
      confirmedAt: new Date().toISOString(),
      revision,
    });
    if (entries.length > MAX_STATE_ENTRIES) {
      return NextResponse.json(
        { error: `A revision holds at most ${MAX_STATE_ENTRIES} confirmations; this one would hold ${entries.length}.`, code: 'too-many' },
        { status: 413 },
      );
    }

    const record = {
      formatVersion: PROCESS_STATE_FORMAT_VERSION,
      revision,
      // Who made *this* revision. Every entry keeps the account and the time of
      // the confirmation that made it, which is not the same thing: a subject
      // confirmed at revision 2 and untouched since still shows revision 2's
      // name and time when it is read at revision 9.
      account: await accountOf(db, gate.uid),
      savedAt: new Date().toISOString(),
      baselineRevision: 1,
      entries,
    };

    try {
      await statesOf(db, gate.projectId).doc(String(revision)).create(record);
    } catch (err: unknown) {
      if (!isAlreadyExists(err)) throw err;
      // Somebody else took this number between the read and the write. Nothing
      // was overwritten, and the caller is told what to reload.
      const now = await latestStates(db, gate.projectId);
      return NextResponse.json(
        {
          error: `Revision ${revision} was confirmed by another session while this one was being written. Reload the process before confirming again.`,
          code: 'revision-moved',
          latest: now.revision,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { view: viewOf(subjects, { revision, entries }), created: true },
      { status: 201 },
    );
  } catch (err: unknown) {
    logger.error('process-states write failed', { route: 'api/projects/process-states', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not store this confirmation.' }, { status: 500 });
  }
}
