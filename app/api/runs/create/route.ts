import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import crypto from 'crypto';
import { verifyRequestAuth, getAdminDb, assertAccountActive, QuotaError, reserveRunQuota, refundRunQuota, assertMfaSatisfied, type RunQuotaResult } from '@/lib/firebase-admin';
import { APP_VERSION } from '@/lib/version';
import { getMergedCatalogVersion } from '@/lib/abap/catalog-service';
import { buildAbapEvidence } from '@/lib/abap/evidence-model';
import { routeExtensibility } from '@/lib/abap/extensibility-router';
import { extractCodeInventory, extractDataCoupling, computeComplexityScore, computeCriticalityScore } from '@/lib/abap/code-assessment';
import { AnalysisRun } from '@/lib/types';
import { canonicalizeJson } from '@/lib/run-signature';
import { getAuditSigningKey, MISSING_SIGNING_KEY_LOG } from '@/lib/audit-signing-key';
import { buildSourceChangeRecord } from '@/lib/artefact-digest';
import { analysisRunInputs, buildInputManifest } from '@/lib/input-manifest';
import type { ModelParticipation } from '@/lib/model-stages';
import { verifyModelReceipt } from '@/lib/model-receipt';
import { looksLikeAbap } from '@/lib/abap-input-check';
import { assertRateLimit } from '@/lib/rate-limit';

/**
 * The most ABAP one request may be asked to analyse.
 *
 * Measured, not guessed: `deriveBusinessRules` is quadratic in the source, and
 * on this machine it took 2.5 s at 380 KB, 10.4 s at 780 KB and 67 s at
 * 1.58 MB. `firestore.rules` caps a stored `legacyCode` at 1 MB, which is about
 * 17 s of CPU per request — and this route does not read from Firestore at all
 * when the body carries its own `legacyCode`, so even that cap was not in the
 * way (security audit of b88c77b). 256 KiB is roughly a second at the far end,
 * and seven times the largest ABAP anybody has put through the product (the
 * 37 KB starter example). Refused before the quota is reserved, like the
 * `looksLikeAbap` gate below, so an input we will not read costs nothing.
 *
 * The same ceiling is declared in
 * `app/api/projects/[projectId]/process-states/route.ts`, the other route that
 * runs the expensive derivation. It is two constants rather than one because
 * its home would be `lib/`, and the algorithmic half of this finding — an index
 * instead of a linear scan per statement — is being changed there at the same
 * time.
 */
const MAX_ANALYSED_SOURCE_BYTES = 256 * 1024;

// The canonicaliser moved to lib/run-signature.ts so the route that verifies a
// run uses the same one that produced it. Two implementations of "canonical"
// drift, and a verification that drifts is a verification that passes.

export async function POST(req: NextRequest) {
  // Tracked outside the try so the catch below can refund a reserved unit when the
  // run fails after it was charged.
  let chargedUid: string | null = null;
  let chargedHash: string | null = null;
  let reservation: RunQuotaResult | null = null;

  try {
    // 1. Signing key. Unconditional: the check used to run only when NODE_ENV was
    // 'production' and the emulator flag was off, which meant every other
    // deployment signed runs with a constant committed to a public repository.
    const signingKey = getAuditSigningKey();
    if (!signingKey) {
      console.error(MISSING_SIGNING_KEY_LOG);
      return NextResponse.json({ error: 'System configuration error: Signing key missing.' }, { status: 500 });
    }

    // 2. Authenticate caller
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    // Server-side MFA gate. Without it, a user with mfaEnabled could mint a
    // signed run or a signed audit pack from a valid ID token alone, because
    // the client obtains that token BEFORE the TOTP prompt — the prompt is a
    // modal, not an authentication step. A stolen token was therefore enough
    // to write into the very chain that is supposed to prove provenance.
    try {
      await assertMfaSatisfied(req, decodedToken);
    } catch (mfaErr: any) {
      return NextResponse.json(
        { error: mfaErr?.message || 'Multi-factor authentication required.' },
        { status: mfaErr?.status || 403 },
      );
    }

    // Per account. Nothing in this file bounded how often a run could be asked
    // for: the community quota is not a bound, because re-analysing the same
    // fingerprint is free by design, so one account could repeat the same
    // expensive analysis of a large source without limit (security audit of
    // b88c77b). 30/h is far above what a person analysing ABAP produces.
    try {
      await assertRateLimit(`runs-create:${decodedToken.uid}`, 30, 60 * 60 * 1000);
    } catch (rateErr: any) {
      if (rateErr instanceof QuotaError) {
        return NextResponse.json({ error: rateErr.message }, { status: rateErr.status });
      }
      throw rateErr;
    }

    const body = await req.json().catch(() => ({}));
    const {
      projectId,
      analysis,
      uploadedFileName,
    } = body;

    // Validation
    if (!projectId) {
      return NextResponse.json({ error: 'Missing required parameter: projectId.' }, { status: 400 });
    }

    const { db, FieldValue } = await getAdminDb();

    // 3. Fetch project and check authorization
    const projectDoc = await db.collection('projects').doc(projectId).get();
    if (!projectDoc.exists) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    const projectData = projectDoc.data();
    const isAdmin = decodedToken.admin === true;
    // Owner only. The administrator claim does not open this door either.
    //
    // The same shape as `DELETE /api/projects/{id}` before f8bc33b: `admin ===
    // true` stood in for ownership, and the only gate behind it is
    // `assertMfaSatisfied`, which lets any token through for an account whose
    // profile does not say `mfaEnabled` (`mfaSatisfied` in lib/mfa-gate.ts
    // returns null for such an account). An administrator who never enrolled a
    // second factor could therefore mint a signed run *inside somebody else's
    // project* from a plain ID token — writing `legacyCode`, `activeRunId` and
    // `auditMetadata` onto a stranger's document, spending a unit of their own
    // quota on it, and attributing the run to their own uid. That is not reading
    // a customer's ABAP; it is writing into the chain that is supposed to prove
    // where the customer's evidence came from.
    //
    // Nothing loses a function. The only caller is the owner's own analyze stage,
    // and `firestore.rules` took the operator's read of a project away on
    // 16.09.2026 — an administrator cannot open somebody else's project at all,
    // so a route that let them add signed evidence to one had no way to be
    // reached on purpose. `isAdminClaim` below is a different question and stays:
    // it relaxes the approval and Terms gates on the caller's **own** account,
    // and decides nothing about whose project this is.
    const isOwner = projectData?.userId === decodedToken.uid;
    if (!isOwner) {
      return NextResponse.json({ error: 'Unauthorized to write to this project.' }, { status: 403 });
    }

    // F-02: account-state gate — a pending/suspended/stale-Terms account cannot mint signed runs.
    try {
      await assertAccountActive(decodedToken.uid, { requireApproved: true, requireCurrentTerms: true, isAdminClaim: isAdmin });
    } catch (gateErr: any) {
      if (gateErr instanceof QuotaError) return NextResponse.json({ error: gateErr.message }, { status: gateErr.status });
      throw gateErr;
    }

    let legacyCode = body.legacyCode || projectData?.legacyCode || '';
    if (!legacyCode) {
      return NextResponse.json({ error: 'Project does not contain ABAP source code to analyze.' }, { status: 400 });
    }
    // Refused before anything is computed, and before the quota is reserved.
    // `legacyCode` comes straight off the body here, so nothing else had looked
    // at its size — not `firestore.rules`, which only governs what is stored.
    const sourceBytes = Buffer.byteLength(legacyCode, 'utf8');
    if (sourceBytes > MAX_ANALYSED_SOURCE_BYTES) {
      return NextResponse.json(
        {
          error: `That source is ${Math.round(sourceBytes / 1024)} KB. One analysis run takes at most ${MAX_ANALYSED_SOURCE_BYTES / 1024} KB — analyse the object in parts.`,
          code: 'source-too-large',
        },
        { status: 413 },
      );
    }
    // The same gate the analyze stage applies, applied where the run is signed.
    //
    // `looksLikeAbap` existed and ran only in the browser, so the check that
    // stops a pasted e-mail becoming a signed ABAP analysis was on the side that
    // does not decide. Posting prose straight here passed the truthiness test
    // above, fell through `detectObjectType` to the catch-all `ABAP Source`, cost
    // a unit of the community quota and produced a run with `status: 'completed'`
    // — a completed analysis of something that contains no ABAP construct.
    //
    // Refused before the quota is reserved, so an input the engine cannot read
    // costs nothing. The gate is the same module the page imports, not a second
    // copy of its idea: two implementations of "is this ABAP" drift, and the one
    // that drifts is the one nobody looks at.
    if (!looksLikeAbap(legacyCode)) {
      return NextResponse.json(
        {
          error:
            'That does not look like ABAP. A run is signed as an ABAP analysis, so it needs at least one ABAP construct — a REPORT, CLASS, FORM, FUNCTION, METHOD, a declaration or a SELECT.',
          code: 'not-abap',
        },
        { status: 400 },
      );
    }

    let targetDeployment = body.s4Deployment || projectData?.s4Deployment || 'public';
    if (targetDeployment !== 'public' && targetDeployment !== 'private') {
      targetDeployment = 'public'; // Strict validation
    }

    // Load user profile from database to determine BYOK configuration server-side (Finding P0/P1)
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    const byokConfigured = userData?.byokConfigured === true;

    // 4. Server-Authoritative Analysis Recomputations (Finding 1)
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(legacyCode));
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // v2.3 — THE metering point. One analysis run = one community unit; every
    // downstream stage (design → delivery) and the glossary chatbot are free, so a
    // free account can take an ABAP object through the whole 7-stage workflow.
    // Idempotent per source fingerprint: re-analysing the same code costs nothing.
    // Reserved before the expensive evidence build so an exhausted account fails fast.
    // Roadmap 0.9: a shipped starter example, recognised here by fingerprint, is
    // free the first time an account runs it — and every later run of it is
    // charged. Either reservation is released again by the catch below if this run
    // does not complete.
    try {
      const quota = await reserveRunQuota(decodedToken.uid, hashHex);
      if (quota.charged || quota.reason === 'starter-example') {
        chargedUid = decodedToken.uid;
        chargedHash = hashHex;
        reservation = quota;
      }
    } catch (quotaErr: any) {
      if (quotaErr instanceof QuotaError) {
        return NextResponse.json({ error: quotaErr.message }, { status: quotaErr.status });
      }
      throw quotaErr;
    }

    const detectObjectType = (code: string): string => {
      if (/^\s*CLASS\s+/im.test(code)) return 'Class';
      if (/^\s*INTERFACE\s+/im.test(code)) return 'Interface';
      if (/^\s*FUNCTION\s+/im.test(code)) return 'Function Module';
      if (/^\s*REPORT\s+/im.test(code)) return 'Report';
      if (/^\s*FORM\s+/im.test(code)) return 'Form Routine';
      return 'ABAP Source';
    };

    const targetFileName = uploadedFileName || 'unknown_file.abap';

    // deterministic server-side calculations
    const evidenceReport = buildAbapEvidence(legacyCode, targetFileName, targetDeployment as 'public' | 'private');
    const extensibilityReport = routeExtensibility(evidenceReport, targetDeployment);
    const codeInventory = extractCodeInventory(legacyCode);
    const dataCoupling = extractDataCoupling(legacyCode);
    const complexityScore = computeComplexityScore(legacyCode);
    const criticalityScore = computeCriticalityScore(legacyCode);
    const cleanCoreScore = extensibilityReport.cleanCoreScore;

    // Parse and override LLM narrative JSON with server-calculated scores and extensibility route
    //
    // `analysis` is the model's text as `/api/gemini` returned it, byte for
    // byte. That is what makes the receipt checkable: a receipt is issued over
    // the text the proxy produced, so anything the browser rewrote on the way
    // here would make every honest run fail the hash comparison. The two
    // normalisations the Analyze page used to perform on its way to this route
    // — unwrapping a top-level array and dropping the three figures the model
    // must not own — are therefore performed here instead, where the run is
    // signed. The page still normalises its *own* copy for the screen.
    let finalAnalysisText = analysis || '';
    let gapsList: any[] = [];
    try {
      let analysisObj: any = null;
      if (typeof analysis === 'string') {
        const cleaned = analysis.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim();
        analysisObj = JSON.parse(cleaned);
      } else if (typeof analysis === 'object' && analysis !== null) {
        analysisObj = analysis;
      }
      // A model that answers with `[{…}]` used to be unwrapped in the browser.
      // Unwrapped nowhere, the overrides below would be set as properties on an
      // array and `JSON.stringify` would drop every one of them silently.
      if (Array.isArray(analysisObj)) analysisObj = analysisObj[0] ?? null;

      if (analysisObj && typeof analysisObj === 'object') {
        // The deterministic figures belong to the run, not to the model. Stored
        // alongside the signed ones they become a second, unsigned truth that
        // the screen and the Confluence export are happy to print. `cleanCoreScore`
        // is overwritten with the authoritative value one line down; the other
        // two have no place in the narrative at all.
        delete analysisObj.complexityScore;
        delete analysisObj.criticalityScore;
        analysisObj.cleanCoreScore = cleanCoreScore;
        if (!analysisObj.extensibilityRouting) {
          analysisObj.extensibilityRouting = {};
        }
        analysisObj.extensibilityRouting.recommendedRoute = extensibilityReport.recommendedRoute;
        analysisObj.extensibilityRouting.confidenceScore = extensibilityReport.confidenceScore;
        analysisObj.extensibilityRouting.rationale = extensibilityReport.rationale;
        analysisObj.extensibilityRouting.targetArtifact = extensibilityReport.targetArtifact;
        analysisObj.extensibilityRouting.decisionTreeCheckpoints = extensibilityReport.checkpoints;
        analysisObj.extensibilityRouting.comparativeAnalysis = extensibilityReport.comparativeAnalysis;
        
        gapsList = analysisObj.gaps || [];
        finalAnalysisText = JSON.stringify(analysisObj);
      }
    } catch (err) {
      console.warn('Failed to parse and override fields in analysis narrative:', err);
    }

    // Build the server-authoritative initial worklist.
    //
    // Findings only. The narrative's `gaps` — whatever the model, or the
    // client posting as the model, put under that key — used to be mapped in
    // here as "Functional Gap" items, title, severity, rationale and effort
    // taken as sent, and the whole list went into the signed payload; the
    // run's hash and HMAC then attested to claims the client had chosen. The
    // narrative is excluded from the signature by design (see `aiNarrativeMeta`
    // below), and its gaps are narrative. They still reach the project's
    // interactive worklist, which is the owner's to edit anyway.
    const findingsGrouped = new Map<string, { finding: any; lines: number[] }>();
    for (const f of evidenceReport.findings) {
      const groupKey = `${f.kind}::${f.objectName || f.title}`;
      const existing = findingsGrouped.get(groupKey);
      if (existing) {
        existing.lines.push(f.lineStart);
      } else {
        findingsGrouped.set(groupKey, { finding: f, lines: [f.lineStart] });
      }
    }

    const signedWorklist = [
      ...Array.from(findingsGrouped.values()).map(({ finding: f, lines }, idx) => ({
        id: `finding-${f.kind}-${idx}`,
        title: lines.length > 1 ? `${f.title} (${lines.length}×)` : f.title,
        category: 'Finding',
        level: f.severity === 'Critical' || f.severity === 'High' ? 'not-supported' : 'partial',
        severity: f.severity === 'Critical' || f.severity === 'High' ? 'High' : f.severity === 'Medium' ? 'Medium' : 'Low',
        location: lines.length > 1
          ? `${targetFileName}:${lines.join(', ')}`
          : `${targetFileName}:${lines[0]}`,
        recommendation: f.recommendation,
        status: 'open',
        effort: f.severity === 'Critical' ? 'High' : f.severity === 'High' || f.severity === 'Medium' ? 'Medium' : 'Low',
        targetAnchor: f.kind,
        detail: f.technicalDetail
      })),
    ];
    // Narrative, not evidence: project worklist only, never the signed run.
    const narrativeGapItems = gapsList.map((g: any, idx: number) => ({
      id: `gap-${idx}`,
      title: g.title,
      category: 'Functional Gap',
      severity: g.severity,
      location: 'S/4HANA Configuration',
      recommendation: g.rationale,
      strategy: g.strategy,
      status: 'open',
      effort: g.complexity
    }));

    // 5. Construct run document properties
    const runsRef = db.collection('projects').doc(projectId).collection('runs');
    const newRunDoc = runsRef.doc(); // Generate random auto-ID
    const runId = newRunDoc.id;

    // Roadmap 1.2, and the step that finished it — did a model have any part in
    // this run, and can the server say so of its own knowledge?
    //
    // Nothing the client says about the model is taken. The request used to
    // carry a `modelCard` and the route recorded the default provider and model
    // id whether or not anything had been generated, so a run with no narrative
    // still claimed a model wrote one. 1.2 fixed the `none` direction. The
    // positive one stayed wrong for one more step: any text in the body made the
    // signed run record `provider: 'google-gemini'` and a model id, for a call
    // the server had never seen. The model card documented that in a "Narrative
    // origin" row, and documenting a claim is not the same as making it true.
    //
    // Now it is an observation. `/api/gemini` — the only path from this product
    // to a model — issues a receipt over the account, the SHA-256 of the text it
    // returned, the model that served it and the time (`lib/model-receipt.ts`).
    // It is authenticated with `AUDIT_SIGNING_KEY`, which the browser never
    // holds. The receipt is checked against **the narrative as submitted**, not
    // against the normalised text stored below: the proxy hashed what it
    // returned, and that is the only string the two sides can both name.
    //
    // A run is never refused for a receipt. An older client, a retry that lost
    // it, a deployment with no key: all of them still get a signed run with the
    // narrative kept. What changes is what the run is allowed to say about where
    // that narrative came from.
    //
    // Deliberately not a reason: *why* no model ran (no key, the stage switched
    // off, a call that failed) is live state the screens read from
    // `/api/model-stages`. Putting a client-supplied reason in the signed run
    // would sign a sentence the client chose.
    const narrativeAsSubmitted = typeof analysis === 'string' ? analysis : '';
    const receiptVerdict = verifyModelReceipt(body.modelReceipt, {
      uid: decodedToken.uid,
      text: narrativeAsSubmitted,
      key: signingKey,
    });
    const attested = receiptVerdict.ok ? receiptVerdict.receipt : null;
    if (!receiptVerdict.ok && receiptVerdict.refusal !== 'absent') {
      // Worth a line: `text-mismatch` and `wrong-account` are what a tampered
      // or borrowed receipt looks like, and `expired` is what a slow client
      // looks like. The narrative itself is never logged.
      logger.warn('runs/create: a model receipt did not establish the narrative origin', {
        route: 'api/runs/create',
        refusal: receiptVerdict.refusal,
        projectId,
      });
    }

    const modelParticipation: ModelParticipation =
      finalAnalysisText.trim().length === 0 ? 'none' : attested ? 'narrative-attested' : 'narrative';

    // Named only when observed. Null covers both other cases, and the run's own
    // `modelParticipation` is what tells them apart: `none` means nothing was
    // submitted, `narrative` means something was and its origin is unknown.
    const provider = attested ? attested.provider : null;
    const modelId = attested ? attested.modelId : null;
    // Whose key served the call, where that is known. `byokConfigured` answers a
    // different question — whether BYOK is set up on the account *now* — and the
    // model card prints this as though it answered the first one.
    const byokUsed = attested ? attested.byok : byokConfigured;

    // v1.20 §6 — Server-authoritative narrative separation.
    // The AI narrative (`finalAnalysisText`) is client/LLM-produced, not server
    // evidence. We commit only its content hash into the signed payload; the raw
    // text is stored on the run doc (below) OUTSIDE the signed set. This keeps
    // arbitrary client free-text out of the cryptographic evidence guarantee.
    const responseHash = crypto.createHash('sha256').update(finalAnalysisText).digest('hex');

    // Roadmap 0.5 — what this run was computed from, by name, revision and hash.
    //
    // The five fields below (`inputFingerprint`, `analyzerVersion`,
    // `rulesetVersion`, `sapApiCatalogVersion`, `model`) each named one input
    // and nothing tied them together; the only one any reader ever compared was
    // the source digest, so a catalog re-sync or a different deployment target
    // left every earlier result reading as current. The manifest is the one
    // list, inside the signed payload, and `lib/input-manifest.ts` is the only
    // place that knows how it is formed.
    const rulesetVersion = 'rules-v1.0';
    const catalogVersion = getMergedCatalogVersion();
    const inputManifest = buildInputManifest(
      analysisRunInputs({
        sourceSha256: hashHex,
        deploymentTarget: targetDeployment,
        catalogVersion,
        rulesetVersion,
        engineVersion: APP_VERSION,
        // Three states, three revisions: a named model, `unattested` for a
        // narrative whose origin was not established, `none` for no narrative
        // at all. The manifest is inside the signature, so recording a model
        // here on the strength of an unchecked claim would sign it.
        model:
          attested && provider && modelId
            ? { provider, modelId, byokUsed }
            : modelParticipation === 'narrative'
              ? 'unattested'
              : null,
      }),
      projectData?.auditMetadata?.inputManifest || null,
    );

    // Create intermediate payload for hashing (analysis excluded — see above)
    const unsignedRunPayload: Omit<AnalysisRun, 'runHash' | 'signature' | 'analysis'> = {
      runId,
      projectId,
      userId: decodedToken.uid,
      createdAt: new Date().toISOString(),
      status: 'completed',
      inputFingerprint: {
        sha256: hashHex,
        fileName: targetFileName,
        lineCount: legacyCode.split('\n').length,
        byteSize: encoder.encode(legacyCode).byteLength,
        objectType: detectObjectType(legacyCode),
      },
      analyzerVersion: APP_VERSION,
      rulesetVersion,
      sapApiCatalogVersion: catalogVersion,
      inputManifest,
      model: {
        // Null unless a receipt established it — and null rather than absent, so
        // that a reader of an old run and a reader of this one are told two
        // different things: "this field was not recorded" and "there was nothing
        // to record". Which of the two nulls it is, `modelParticipation` says.
        // The engine still computed the evidence, and it is still named.
        provider,
        modelId,
        engineVersion: APP_VERSION,
        byokUsed,
      },
      /** Roadmap 1.2 — inside the signature, so a run says for itself what it is. */
      modelParticipation,
      aiNarrativeMeta: {
        provider,
        modelId,
        // Present whenever a narrative is, whatever its origin: the hash is of
        // the text this run stores, and that is true either way. It is not the
        // receipt's hash — the receipt covers the text as the proxy returned it,
        // this covers the text after the server's overrides.
        responseHash: modelParticipation === 'none' ? null : responseHash,
        evidentiary: false,
      },
      extensibilityRoute: extensibilityReport.recommendedRoute,
      cleanCoreScore,
      complexityScore,
      criticalityScore,
      evidenceReport: evidenceReport.findings,
      // v1.17: Store full assessment data for Audit Pack completeness
      dataCoupling,
      codeInventory,
      worklist: signedWorklist as import('@/lib/types').WorklistItem[],
      originalRecommendation: extensibilityReport.recommendedRoute,
      recommendationConfidence: extensibilityReport.confidenceScore,
      recommendationJustification: extensibilityReport.rationale,
    };

    // Calculate cryptographic runHash over sorted canonical representation of complete payload (Finding 2)
    const canonicalPayloadStr = canonicalizeJson(unsignedRunPayload);
    const runHash = crypto.createHash('sha256').update(canonicalPayloadStr).digest('hex');

    // Generate HMAC signature. `signingKey` is non-null past the guard above.
    const signature = crypto.createHmac('sha256', signingKey).update(runHash).digest('hex');

    const analysisRun: AnalysisRun = {
      ...unsignedRunPayload,
      // Narrative stored for display/downstream, but NOT part of the signed hash.
      analysis: finalAnalysisText,
      runHash,
      signature,
    };

    // 6a. Did the source change? (roadmap E01-F01-US02)
    //
    // A new run used to leave the design, the code, the tests, the documentation
    // and the architect's sign-off in place, all reading as current, although
    // every one of them was built for the previous source. Nothing is deleted
    // here — it is the reader's work — but the digests of what stood at the
    // moment of change are recorded where only the server writes. Anything that
    // still carries one of them afterwards was not regenerated, and the phase
    // contract, the delivery page and the audit-pack route treat it as stale.
    //
    // Same digest, nothing recorded: re-analysing unchanged code changes no
    // artefact's basis, and whatever was stale before stays stale.
    let previousSha256: string | undefined = projectData?.auditMetadata?.inputFingerprint?.sha256;
    if (!previousSha256 && projectData?.activeRunId) {
      // Projects older than auditMetadata: the previous run carries the digest.
      const prevRun = await db.collection('projects').doc(projectId).collection('runs').doc(projectData.activeRunId).get();
      previousSha256 = prevRun.exists ? prevRun.data()?.inputFingerprint?.sha256 : undefined;
    }
    // 6+7. Run document and project metadata, in one transaction that is bound
    // to the source this run actually analysed (roadmap 0.6, acceptance W22-A06:
    // *"Neue Analyse trifft nach Quellenänderung ein — Ergebnis bleibt an alte
    // Eingabe gebunden; kein stilles Überschreiben des aktuellen Stands"*).
    //
    // The evidence build and the model call take time. The route used to write
    // `legacyCode` and `activeRunId` from what it had read at the start, so an
    // analysis that began on source A and finished after the project had moved
    // to source B put A back on the project and made the A-run the current
    // state — the later, correct source silently replaced by the older result.
    // Now the project's source is re-read at commit time: if it moved, nothing
    // is written at all. The conservative direction is to lose the late result,
    // not the current state.
    //
    // A deleted project is the other way the target can move, and it was not
    // the same question. `fresh.exists` was folded into an empty object, so the
    // only remaining bar was `nowSource !== readSource` — and when the source
    // came from the request body while the stored one was empty (the analyze
    // stage's normal shape: `body.legacyCode || projectData?.legacyCode`), both
    // sides were `''`. The comparison passed, and `tx.set(…, { merge: true })`
    // on a document that no longer exists *creates* it: the project came back
    // complete, ABAP source included, with a freshly signed run under it, after
    // account deletion had finished removing both. The window is the evidence
    // build plus the model call — many seconds — and no race is even needed for
    // the profile half of the same defect (see request-tenant-access).
    const projectRef = db.collection('projects').doc(projectId);
    let sourceMoved = false;
    let projectGone = false;
    await db.runTransaction(async (tx: any) => {
      const fresh = await tx.get(projectRef);
      if (!fresh.exists) {
        projectGone = true;
        return;
      }
      const freshData = fresh.data() || {};
      const readSource = typeof projectData?.legacyCode === 'string' ? projectData.legacyCode : '';
      const nowSource = typeof freshData.legacyCode === 'string' ? freshData.legacyCode : '';
      if (nowSource !== readSource) {
        sourceMoved = true;
        return;
      }
      // Rebuilt from the transaction's own snapshot rather than the one read at
      // the start: the source is proven unchanged, the artefacts around it are not.
      const previousInTx: string | undefined = freshData.auditMetadata?.inputFingerprint?.sha256 || previousSha256;
      const sourceChange =
        previousInTx && previousInTx !== hashHex
          ? buildSourceChangeRecord(freshData as Record<string, unknown>, previousInTx, runId, new Date().toISOString())
          : null;

      // runs/{runId} is client-write-blocked; written here so the new run cannot
      // become the active one without its source-change record being written
      // alongside — a run switched in without the record would make every
      // artefact of the old source read as current again.
      tx.set(newRunDoc, analysisRun);
      tx.set(
        projectRef,
        {
          activeRunId: runId,
          status: 'analyzed',
          charged: true,
          transformationBypass: true,
          legacyCode,
          s4Deployment: targetDeployment,
          updatedAt: new Date(),

          // Save client-writable/interactive fields initially — findings plus the
          // narrative's gaps, which belong here and not in the signed run.
          worklist: [...signedWorklist, ...narrativeGapItems],
          extensibilityRoute: extensibilityReport.recommendedRoute,

          // Write a minimal auditMetadata summary on the project
          auditMetadata: {
            inputFingerprint: {
              sha256: hashHex,
              fileName: targetFileName,
              lineCount: legacyCode.split('\n').length,
              byteSize: encoder.encode(legacyCode).byteLength,
              uploadedAt: new Date().toISOString(),
              objectType: detectObjectType(legacyCode),
            },
            modelCard: {
              // Mirrors the run's own answer: a card that named a provider and
              // a model for a run no model took part in was the same untrue
              // claim one document further out, and this is the copy the
              // delivery screen and the audit pack read.
              provider,
              model: modelId,
              modelParticipation,
              engineVersion: APP_VERSION,
              catalogVersion,
              byokUsed,
              analysisTimestamp: new Date().toISOString(),
            },
            // Roadmap 0.5 — the same manifest the run signed, mirrored where a
            // reader that holds only the project document can find it.
            inputManifest,
          },
        },
        { merge: true },
      );
      // An `update` with a field path rather than part of the merge above: a merge
      // would keep keys from an earlier record that this one no longer has.
      if (sourceChange) {
        tx.update(projectRef, { 'auditMetadata.sourceChange': sourceChange });
      }
    });

    if (projectGone) {
      // The same rule as `sourceMoved`: nothing was written, so nothing is
      // charged. Answered as 404 rather than as the 409 above, and with a code
      // of its own, because the two are different facts and the caller acts on
      // them differently. "The source moved" invites a re-run on the current
      // source; there is no current source here and no project to put one on,
      // so a re-run would do nothing but produce the same refusal. 404 is also
      // the answer this very route gives at its first read for exactly this
      // condition (`Project not found.`) — the project is simply found to be
      // gone later, and one condition should not have two status codes.
      if (chargedUid && chargedHash) {
        await refundRunQuota(chargedUid, chargedHash, reservation ?? undefined);
        chargedUid = null;
        chargedHash = null;
        reservation = null;
      }
      logger.warn('runs/create refused: the project was deleted while the analysis ran', {
        route: 'api/runs/create',
        projectId,
      });
      return NextResponse.json(
        {
          error:
            'This project no longer exists. Nothing was written — the analysis was discarded rather than recreating a deleted project.',
          code: 'project-gone',
        },
        { status: 404 },
      );
    }

    if (sourceMoved) {
      // Nothing was written. The unit goes back, because the analysis did not
      // become this project's state — the same rule as any other failure.
      //
      // The reservation has to travel with it. Since 0.9 a reservation is one of
      // two things, and they are given back differently: a charged one releases
      // the unit and the fingerprint, a free starter example releases the
      // example's first run. Refunding without it took the charged branch for a
      // starter example — it decremented a unit that was never taken and left
      // the example marked as used, so the reader lost the free run for good
      // (QA review of 6a24b632ff44).
      if (chargedUid && chargedHash) {
        await refundRunQuota(chargedUid, chargedHash, reservation ?? undefined);
        chargedUid = null;
        chargedHash = null;
        reservation = null;
      }
      logger.warn('runs/create refused: the source changed while the analysis ran', {
        route: 'api/runs/create',
        projectId,
      });
      return NextResponse.json(
        {
          error:
            'The source on this project changed while this analysis was running. Nothing was overwritten — re-run the analysis on the current source.',
          code: 'source-moved',
        },
        { status: 409 },
      );
    }

    // Clean up old denormalized results fields from parent project (Finding 6)
    await db.collection('projects').doc(projectId).update({
      analysis: FieldValue.delete(),
      evidenceReport: FieldValue.delete(),
      cleanCoreScore: FieldValue.delete(),
      complexityScore: FieldValue.delete(),
      criticalityScore: FieldValue.delete(),
      codeInventory: FieldValue.delete(),
      dataCoupling: FieldValue.delete(),
      originalRecommendation: FieldValue.delete(),
      recommendationConfidence: FieldValue.delete(),
      recommendationJustification: FieldValue.delete(),
    }).catch(() => {}); // Non-blocking if fields already absent

    return NextResponse.json({
      success: true,
      runId,
      runHash,
      signature,
      // What the run actually recorded about the model's part in it. The caller
      // cannot work this out for itself — whether the receipt verified is
      // decided here — and a browser that reported its own guess would be the
      // unchecked claim again, one layer further out.
      modelParticipation,
    });
  } catch (error: any) {
    // The run never completed — give back whatever was reserved: the unit and its
    // fingerprint, so the next attempt is charged normally rather than passing as a
    // re-analysis, or the starter example's one free run.
    if (chargedUid && chargedHash) {
      await refundRunQuota(chargedUid, chargedHash, reservation ?? undefined);
    }
    logger.error('runs/create failed', { route: 'api/runs/create', error: errMessage(error) });
    // The log line above is where the reason belongs. Forwarding it handed the
    // caller Admin SDK text about our own collections, signing-key handling and
    // the evidence engine's internals (security audit of b88c77b); every
    // refusal a caller is meant to act on is returned by name further up.
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
