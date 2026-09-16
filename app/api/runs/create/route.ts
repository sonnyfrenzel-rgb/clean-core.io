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
    const isOwner = projectData?.userId === decodedToken.uid;

    if (!isOwner && !isAdmin) {
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

    let targetDeployment = body.s4Deployment || projectData?.s4Deployment || 'public';
    if (targetDeployment !== 'public' && targetDeployment !== 'private') {
      targetDeployment = 'public'; // Strict validation
    }

    // Load user profile from database to determine BYOK configuration server-side (Finding P0/P1)
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    const byokUsed = userData?.byokConfigured === true;

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
      
      if (analysisObj) {
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

    // Roadmap 1.2 — the zero-LLM path: did a model have any part in this run?
    //
    // The server decides it here, from the one fact it can check: whether a
    // narrative arrived. Nothing the client says about the model is taken; the
    // request used to carry a `modelCard` and the route recorded the default
    // provider and model id whether or not anything had been generated, so a
    // run with no narrative still claimed a model wrote one. The claim was
    // inside the signed payload, which is the worst place for a claim nobody
    // checked.
    //
    // Deliberately not a reason: *why* no model ran (no key, the stage switched
    // off, a call that failed) is live state the screens read from
    // `/api/model-stages`. Putting a client-supplied reason in the signed run
    // would sign a sentence the client chose.
    const modelParticipation: ModelParticipation = finalAnalysisText.trim().length > 0 ? 'narrative' : 'none';
    const modelRan = modelParticipation === 'narrative';

    const provider = 'google-gemini';
    const modelId = byokUsed ? (userData?.byokModel || 'gemini-3-flash-preview') : 'gemini-3-flash-preview';

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
        model: modelRan ? { provider, modelId, byokUsed } : null,
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
      model: modelRan
        ? {
            provider,
            modelId,
            engineVersion: APP_VERSION,
            byokUsed,
          }
        : {
            // No model took part. `provider` and `modelId` are null rather than
            // absent so that a reader of an old run and a reader of a zero-LLM
            // run are told two different things: "this field was not recorded"
            // and "there was no model". The engine still computed the evidence,
            // and it is still named.
            provider: null,
            modelId: null,
            engineVersion: APP_VERSION,
            byokUsed,
          },
      /** Roadmap 1.2 — inside the signature, so a run says for itself what it is. */
      modelParticipation,
      aiNarrativeMeta: modelRan
        ? {
            provider,
            modelId,
            responseHash,
            evidentiary: false,
          }
        : {
            provider: null,
            modelId: null,
            responseHash: null,
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
    const projectRef = db.collection('projects').doc(projectId);
    let sourceMoved = false;
    await db.runTransaction(async (tx: any) => {
      const fresh = await tx.get(projectRef);
      const freshData = (fresh.exists ? fresh.data() : {}) || {};
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
              provider: modelRan ? provider : null,
              model: modelRan ? modelId : null,
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
    });
  } catch (error: any) {
    // The run never completed — give back whatever was reserved: the unit and its
    // fingerprint, so the next attempt is charged normally rather than passing as a
    // re-analysis, or the starter example's one free run.
    if (chargedUid && chargedHash) {
      await refundRunQuota(chargedUid, chargedHash, reservation ?? undefined);
    }
    logger.error('runs/create failed', { route: 'api/runs/create', error: errMessage(error) });
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
