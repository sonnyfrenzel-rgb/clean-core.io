import { NextRequest, NextResponse } from 'next/server';
import {
  verifyRequestAuth,
  getAdminDb,
  assertAccountActive,
  assertMfaSatisfied,
  auditActorEmail,
  QuotaError,
} from '@/lib/firebase-admin';
import { assertRateLimit } from '@/lib/rate-limit';
import { validateProjectCommand, type ProjectCommandState, type RecommendationBasis } from '@/lib/project-commands';
import { recommendationOfProject } from '@/lib/contract-build';
import { evidenceDigest } from '@/lib/run-evidence-digest';
import { deriveProjectDecision } from '@/lib/decision-facts';
import type { EvidenceChange } from '@/lib/run-evidence-digest';
import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { isFirestoreId } from '@/lib/firestore-id';
import { catalogSnapshotRefForProject } from '@/lib/abap/catalog-snapshots';
import { profileDrift, recordedProfileOf } from '@/lib/assessment-target';
import { logger, errMessage } from '@/lib/logger';
import { openQuestionBases } from '@/lib/open-questions';
import { notDetermined } from '@/lib/workspace-model';
import { rulesStatus } from '@/lib/rules-editor';
import { sha256Hex } from '@/lib/artefact-digest';
import { deriveBusinessRules } from '@/lib/abap/business-rule-set';
import { PROCESS_REVISION_COLLECTION, isProcessRevisionRecord } from '@/lib/process-revisions';
import {
  PROCESS_STATE_COLLECTION,
  PROCESS_STATE_FORMAT_VERSION,
  isStateEntry,
  type ProcessStateView,
  type StateEntry,
} from '@/lib/process-states';
import type { Project } from '@/lib/types';

/** The rules' size limit of `process-states/route.ts`: `deriveBusinessRules` is quadratic in the source. */
const MAX_RULES_SOURCE_BYTES = 256 * 1024;

/** A Firestore Timestamp, a Date or an ISO string, as ISO — as `process-states/route.ts` reads it. */
function isoOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  const maybe = value as { toDate?: () => Date } | null;
  if (maybe && typeof maybe.toDate === 'function') return maybe.toDate().toISOString();
  return '';
}

/**
 * ADR-081 — the rules and their answers as the list reads them
 * (`useOpenQuestions` → `rulesStatus` of `GET .../process-states`), derived here
 * from the same documents: revision 1 of the process, the source it was built
 * from, and the newest confirmations. `null` wherever the list has no rules
 * group either — no signed run, no revision 1, another source, a source too
 * large to derive rules from.
 */
async function rulesNow(
  tx: Transaction,
  ref: DocumentReference,
  project: Record<string, unknown>,
): Promise<{ total: number; open: string[] } | null> {
  const source = project.legacyCode;
  if (typeof project.activeRunId !== 'string' || project.activeRunId.length === 0) return null;
  if (typeof source !== 'string' || source.trim() === '') return null;
  if (Buffer.byteLength(source, 'utf8') > MAX_RULES_SOURCE_BYTES) return null;
  const baseline = await tx.get(ref.collection(PROCESS_REVISION_COLLECTION).doc('1'));
  if (!baseline.exists) return null;
  const data = baseline.data() as Record<string, unknown>;
  const record = { ...data, savedAt: isoOf(data.savedAt) };
  if (!isProcessRevisionRecord(record) || sha256Hex(source) !== record.sourceSha256) return null;
  const statesSnap = await tx.get(ref.collection(PROCESS_STATE_COLLECTION).orderBy('revision', 'desc').limit(1));
  let entries: StateEntry[] = [];
  let revision = 0;
  if (!statesSnap.empty) {
    const latest = (statesSnap.docs[0].data() || {}) as Record<string, unknown>;
    if (latest.formatVersion === PROCESS_STATE_FORMAT_VERSION) {
      revision = typeof latest.revision === 'number' ? latest.revision : 0;
      entries = (Array.isArray(latest.entries) ? latest.entries : [])
        .map((e) => ({ ...(e as Record<string, unknown>), confirmedAt: isoOf((e as Record<string, unknown>).confirmedAt) }))
        .filter(isStateEntry);
    }
  }
  const view: ProcessStateView = {
    formatVersion: PROCESS_STATE_FORMAT_VERSION,
    revision,
    baselineRevision: 1,
    subjects: deriveBusinessRules(source).rules.map((rule) => ({
      subject: rule.id,
      kind: 'rule' as const,
      label: rule.label,
      detail: rule.text,
      anchor: null,
    })),
    entries,
    links: [],
  };
  const status = rulesStatus({ ok: true, view }, null);
  return status ? { total: status.total, open: status.open } : null;
}

/**
 * POST /api/projects/{projectId}/commands  — roadmap 0.7
 *
 * The only writer of the project fields a browser may no longer touch:
 * `targetArchitecture`, `approvedByArchitect`, `architectJustifiedOverride`,
 * `architectSignOffAt`, `approvedBy`, `usageReport`, `atcReport` and — since
 * roadmap 8.4 — `decision`.
 *
 * *"An approval is created on the server or not at all."*
 * (`docs/archiv/roadmap-2.8/SCHNITT-0-UMFANG.md` §8.) Until this route existed, the design
 * stage wrote all five release fields straight from the browser — `approvedBy`
 * included, taken from `auth.currentUser.email`, which is to say the browser
 * chose whose name went on the sign-off. It now comes off the verified ID
 * token, and the timestamp off the server clock.
 *
 * What is checked, in order: a verified token · the second factor, when the
 * account requires one · a rate limit · the account is not suspended · the
 * caller **owns** the project — an administrator does not qualify, for the same
 * reason `firestore.rules` stopped letting one read a project at all · then the
 * transition itself, in `lib/project-commands.ts`, which the design stage reads
 * too so that both halves refuse the same things.
 *
 * Every accepted command writes an `audit_events` row (server-only collection,
 * Admin SDK). The refusals write nothing.
 */
export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    // The sign-off is carried by the audit pack's decision record. A token
    // obtained before the second factor must not be able to record one.
    try {
      await assertMfaSatisfied(req, decodedToken);
    } catch (mfaErr: unknown) {
      const q = mfaErr as { message?: string; status?: number };
      return NextResponse.json(
        { error: q?.message || 'Multi-factor authentication required.' },
        { status: q?.status || 403 },
      );
    }

    try {
      await assertRateLimit(`project-command:${decodedToken.uid}`, 60, 60_000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return NextResponse.json(
        { error: q?.message || 'Too many requests. Please wait and try again.' },
        { status: q?.status || 429 },
      );
    }

    try {
      await assertAccountActive(decodedToken.uid, { isAdminClaim: decodedToken.admin === true });
    } catch (gateErr: unknown) {
      if (gateErr instanceof QuotaError) {
        return NextResponse.json({ error: gateErr.message }, { status: gateErr.status });
      }
      throw gateErr;
    }

    const { projectId } = await params;
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'Missing project id.' }, { status: 400 });
    }
    // Checked before the id forms any document path (SEC-2026-514).
    if (!isFirestoreId(projectId)) {
      return NextResponse.json({ error: 'Invalid project id.' }, { status: 400 });
    }

    const { db } = await getAdminDb();
    const ref: DocumentReference = db.collection('projects').doc(projectId);
    const body = await req.json().catch(() => null);
    const email = typeof decodedToken.email === 'string' ? decodedToken.email : '';
    // Resolved before the transaction: it reads a different document, and a
    // transaction's reads all have to happen before its first write.
    const actorEmail = await auditActorEmail(db, decodedToken.uid);

    const commandName =
      typeof body === 'object' && body !== null ? (body as { command?: unknown }).command : undefined;

    // Read, decide and write in one transaction.
    //
    // The three used to be three separate steps: the project was read, the
    // command was validated against that snapshot, and a batch then merged the
    // decision onto whatever the project had become. Between the read and the
    // commit, `/api/runs/create` can make a different run the active one — the
    // evidence build takes seconds and a second tab is all it needs. The
    // sign-off was then validated against run A and landed on a project whose
    // active run was B, so the audit pack carried an architect's approval for a
    // run the architect never saw (QA full review of a19945ef01dc).
    //
    // A transaction closes it at the source: the snapshot the decision is made
    // on is the snapshot the write is conditional on, and Firestore retries the
    // whole body if the document moved underneath. The project fields and the
    // journal entry still commit together or not at all, which is what the batch
    // was there for (QA review of fafb3299ae6c) — a transaction is a batch that
    // also promises nothing changed while it was deciding.
    //
    // Roadmap 8.8 adds a second read inside the same transaction: the run
    // document the sign-off claims to have been read from. It is read here and
    // not before, for the reason the comment above gives for the project —
    // `activeRunId` and the run it points at have to be the pair the write is
    // conditional on, and a comparison made before the transaction is a window,
    // not a binding.
    type CommandOutcome =
      | { status: 200; fields: Record<string, unknown>; recommendationBasis?: RecommendationBasis; notice?: string }
      | {
          status: number;
          error: string;
          code?: string;
          details?: EvidenceChange[];
          activeRunId?: string;
          recommendationBasis?: RecommendationBasis;
        };
    const outcome: CommandOutcome = await db.runTransaction(
      async (tx: Transaction): Promise<CommandOutcome> => {
        const snap = await tx.get(ref);
        // Same answer for "no such project" and "not yours": a 404 that only
        // appears for projects that exist is a way to ask whether one does. The
        // wording is the one `app/api/projects/[projectId]/route.ts:56` and
        // `readers/route.ts:144` already use, so that the three do not drift
        // apart. Both refusals carry no `code`, so the body is the same too.
        if (!snap.exists) return { status: 404, error: 'Project not found.' };
        const project = snap.data() || {};
        // Owner only. An operator recording somebody else's sign-off is the worse
        // half of an operator reading their code, and the rules stopped allowing
        // that on 16.09.2026. An invited reader is a non-owner here and is told
        // the same as everyone else, exactly as `readers/route.ts` tells one.
        if (project.userId !== decodedToken.uid) {
          return { status: 404, error: 'Project not found.' };
        }

        // The evidence the sign-off will be bound to, taken from the immutable
        // run and from nowhere else. `firestore.rules` leaves
        // `projects/{projectId}/runs/{runId}` `allow write: if false`, so this
        // is the one part of the comparison the approver cannot have authored —
        // unlike the draft fields of `project` above, which the owner writes
        // from the browser. The pointer to the run is not one of them:
        // `activeRunId` is on neither client allowlist of /projects/{projectId}
        // (create or update), so only the server sets it (`/api/runs/create`),
        // and tests/firestore-rules.spec.ts asserts an owner cannot. `null`
        // when there is no run to read; the validator refuses on it rather
        // than treating an unreadable run as an unchanged one.
        let activeRunEvidence: string | null = null;
        // Roadmap 7.10 - the run's target profile against the project's now,
        // read from the same run document in the same transaction. `null` for
        // a run signed before 7.10: labelled, not reinterpreted.
        let profileDriftNow: { recorded: string; now: string } | null = null;
        // Roadmap 8.4 adds the second command that is bound to the run it was
        // read from. Both are named here rather than "any command that sends an
        // expectedRunId": the set of commands that must be bound is a decision
        // of this product, not of whoever writes the request body.
        const wantsBinding = commandName === 'approve-architecture' || commandName === 'confirm-decision';
        if (wantsBinding && typeof project.activeRunId === 'string' && project.activeRunId.length > 0) {
          const runSnap = await tx.get(ref.collection('runs').doc(project.activeRunId));
          activeRunEvidence = runSnap.exists ? evidenceDigest(runSnap.data()) : null;
          const recordedProfile = runSnap.exists ? recordedProfileOf(runSnap.data()) : null;
          if (recordedProfile) {
            profileDriftNow = profileDrift({ project, recorded: recordedProfile, catalogSnapshot: catalogSnapshotRefForProject(project) });
          }
        }

        // `confirm-decision` confirms a record that came in from the browser, so
        // it is compared with the decision this server derives from the project
        // the transaction just read (`lib/decision-facts.ts`) — derived from
        // this snapshot and not from an earlier one, for the reason the run is
        // read here. Only for this command: it runs the catalog-backed engine.
        let derivedDecisionFingerprint: string | null = null;
        if (commandName === 'confirm-decision') {
          const derived = await deriveProjectDecision(db, projectId, project, new Date().toISOString(), tx);
          derivedDecisionFingerprint = derived.ok ? derived.answer.draft.fingerprint : null;
        }

        // Owner decision 02.10.2026 — the sign-off's "recommended" is the
        // architecture contract's, derived here from the source this
        // transaction just read and the project's catalog snapshot
        // (`recommendationOfProject`, the derivation `GET .../contract` makes),
        // not the client-writable `extensibilityRoute`. `null` when no contract
        // can be derived; the validator then falls back and says so.
        const contractRecommendation =
          commandName === 'approve-architecture' ? recommendationOfProject(project) : null;

        // ADR-081 — the questions the project has now, from the source and the
        // rule answers this transaction reads, so an answer is stored only for
        // a group the list shows with the basis the list shows (QA review of
        // dd8e99691c8d). The rules are derived only for an answer about them.
        let questionBases: ProjectCommandState['openQuestionBases'] = null;
        if (commandName === 'record-open-question') {
          const action = (body as { action?: unknown }).action;
          const rules = action === 'confirm-rules' ? await rulesNow(tx, ref, project) : null;
          questionBases = openQuestionBases(notDetermined(project as Project), rules, project as Project);
        }

        const state: ProjectCommandState = {
          activeRunId: project.activeRunId,
          approvedByArchitect: project.approvedByArchitect,
          originalRecommendation: project.originalRecommendation,
          extensibilityRoute: project.extensibilityRoute,
          activeRunEvidence,
          // Roadmap 8.4 — the decision record as it sits on the project. Read
          // inside the transaction for the same reason the run is: a
          // confirmation compared against a draft that has been redrafted since
          // is a confirmation of something else.
          decision: project.decision,
          derivedDecisionFingerprint,
          profileDrift: profileDriftNow,
          contractRecommendation,
          // ADR-081 — the stored answers, read in this transaction, so one
          // answer is merged into them rather than replacing the others.
          openQuestions: project.openQuestions,
          openQuestionBases: questionBases,
        };
        const decision = validateProjectCommand(body, state, { email, now: new Date().toISOString() });
        if (!decision.ok) {
          return {
            status: decision.status,
            error: decision.error,
            code: decision.code,
            ...(decision.details ? { details: decision.details } : {}),
            ...(decision.activeRunId ? { activeRunId: decision.activeRunId } : {}),
            ...(decision.recommendationBasis ? { recommendationBasis: decision.recommendationBasis } : {}),
          };
        }

        // Every change into the journal (SCHNITT-0-UMFANG §8, package 1), written
        // by the Admin SDK into `audit_events`, which no client can read or write.
        // The command still writes exactly the fields `validateProjectCommand`
        // returns and no others — the transaction changes when they are written,
        // not what.
        tx.set(ref, { ...decision.fields, updatedAt: new Date() }, { merge: true });
        tx.set(db.collection('audit_events').doc(), {
          actorUid: decodedToken.uid,
          actorEmail,
          action: `${decision.action}:${projectId}`,
          targetUid: decodedToken.uid,
          timestamp: new Date(),
        });
        return {
          status: 200,
          fields: decision.fields,
          ...(decision.recommendationBasis ? { recommendationBasis: decision.recommendationBasis } : {}),
          ...(decision.notice ? { notice: decision.notice } : {}),
        };
      },
    );

    if (!('fields' in outcome)) {
      return NextResponse.json(
        outcome.code
          ? {
              error: outcome.error,
              code: outcome.code,
              // Roadmap 8.8 — the diff travels beside the sentence, so a screen
              // can show a table and an API caller does not have to parse prose.
              ...(outcome.details ? { details: outcome.details } : {}),
              ...(outcome.activeRunId ? { activeRunId: outcome.activeRunId } : {}),
              ...(outcome.recommendationBasis ? { recommendationBasis: outcome.recommendationBasis } : {}),
            }
          : { error: outcome.error },
        { status: outcome.status },
      );
    }

    return NextResponse.json({
      ok: true,
      fields: outcome.fields,
      // Which recommendation a sign-off was checked against, and a sentence when
      // it was not the contract's (owner decision 02.10.2026).
      ...(outcome.recommendationBasis ? { recommendationBasis: outcome.recommendationBasis } : {}),
      ...(outcome.notice ? { notice: outcome.notice } : {}),
    });
  } catch (err: unknown) {
    // The reason goes to the server log; the caller gets a fixed sentence
    // (SEC-2026-481).
    logger.error('project command failed', {
      route: 'api/projects/[projectId]/commands',
      error: errMessage(err),
    });
    return NextResponse.json({ error: 'Failed to run the command.' }, { status: 500 });
  }
}
