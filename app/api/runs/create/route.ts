import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { verifyRequestAuth, getAdminDb } from '@/lib/firebase-admin';
import { APP_VERSION } from '@/lib/version';
import { SAP_API_CATALOG_VERSION } from '@/lib/abap/sap-api-catalog';
import { buildAbapEvidence } from '@/lib/abap/evidence-model';
import { routeExtensibility } from '@/lib/abap/extensibility-router';
import { extractCodeInventory, extractDataCoupling, computeComplexityScore, computeCriticalityScore } from '@/lib/abap/code-assessment';
import { AnalysisRun } from '@/lib/types';

// Stable canonical JSON serializer to secure cryptographic run integrity (Finding 2)
function canonicalizeJson(obj: any): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalizeJson(item)).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const parts = keys.map(key => {
    return JSON.stringify(key) + ':' + canonicalizeJson(obj[key]);
  });
  return '{' + parts.join(',') + '}';
}

export async function POST(req: NextRequest) {
  try {
    // 1. Production Key Check (Finding 3)
    const isProduction = process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== 'true';
    const signingKey = process.env.AUDIT_SIGNING_KEY;
    if (!signingKey && isProduction) {
      console.error('CRITICAL: AUDIT_SIGNING_KEY environment variable is missing in production!');
      return NextResponse.json({ error: 'System configuration error: Signing key missing.' }, { status: 500 });
    }

    // 2. Authenticate caller
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
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
    const evidenceReport = buildAbapEvidence(legacyCode, targetFileName);
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

    // Build the server-authoritative initial worklist
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

    const initialWorklist = [
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
      ...gapsList.map((g: any, idx: number) => ({
        id: `gap-${idx}`,
        title: g.title,
        category: 'Functional Gap',
        severity: g.severity,
        location: 'S/4HANA Configuration',
        recommendation: g.rationale,
        strategy: g.strategy,
        status: 'open',
        effort: g.complexity
      }))
    ];

    // 5. Construct run document properties
    const runsRef = db.collection('projects').doc(projectId).collection('runs');
    const newRunDoc = runsRef.doc(); // Generate random auto-ID
    const runId = newRunDoc.id;

    const provider = 'google-gemini';
    const modelId = byokUsed ? (userData?.byokModel || 'gemini-3-flash-preview') : 'gemini-3-flash-preview';

    // Create intermediate payload for hashing
    const unsignedRunPayload: Omit<AnalysisRun, 'runHash' | 'signature'> = {
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
      rulesetVersion: 'rules-v1.0',
      sapApiCatalogVersion: SAP_API_CATALOG_VERSION,
      model: {
        provider,
        modelId,
        engineVersion: APP_VERSION,
        byokUsed,
      },
      extensibilityRoute: extensibilityReport.recommendedRoute,
      cleanCoreScore,
      complexityScore,
      criticalityScore,
      analysis: finalAnalysisText,
      evidenceReport: evidenceReport.findings,
      // v1.17: Store full assessment data for Audit Pack completeness
      dataCoupling,
      codeInventory,
      worklist: initialWorklist as import('@/lib/types').WorklistItem[],
      originalRecommendation: extensibilityReport.recommendedRoute,
      recommendationConfidence: extensibilityReport.confidenceScore,
      recommendationJustification: extensibilityReport.rationale,
    };

    // Calculate cryptographic runHash over sorted canonical representation of complete payload (Finding 2)
    const canonicalPayloadStr = canonicalizeJson(unsignedRunPayload);
    const runHash = crypto.createHash('sha256').update(canonicalPayloadStr).digest('hex');

    // Generate HMAC Signature using AUDIT_SIGNING_KEY or dev fallback
    const finalKey = signingKey || 'dev_audit_signing_key_fallback_clean_core';
    if (!signingKey) {
      console.warn('WARNING: AUDIT_SIGNING_KEY is missing. Using development fallback signing key.');
    }
    const signature = crypto.createHmac('sha256', finalKey).update(runHash).digest('hex');

    const analysisRun: AnalysisRun = {
      ...unsignedRunPayload,
      runHash,
      signature,
    };

    // 6. Save the run document (runs/{runId} is client-write-blocked)
    await newRunDoc.set(analysisRun);

    // 7. Update parent project (Only metadata! Finding 6)
    await db.collection('projects').doc(projectId).set({
      activeRunId: runId,
      status: 'analyzed',
      charged: true,
      transformationBypass: true,
      legacyCode,
      s4Deployment: targetDeployment,
      updatedAt: new Date(),
      
      // Save client-writable/interactive fields initially
      worklist: initialWorklist,
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
          provider,
          model: modelId,
          engineVersion: APP_VERSION,
          catalogVersion: SAP_API_CATALOG_VERSION,
          byokUsed,
          analysisTimestamp: new Date().toISOString(),
        }
      }
    }, { merge: true });

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
    console.error('Error creating analysis run:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
