import type { Project } from '@/lib/types';
import type { SupportFinding } from '@/lib/abap/class-model';
import { rollupLevel } from '@/lib/abap/support-matrix';
import { APP_VERSION } from '@/lib/version';
import type { PresentationData, SlideData } from '@/components/PresentationViewer';

/** A lightweight, per-run snapshot used to render the run-over-run trend slide. */
export interface RunTrendPoint {
  createdAt: string;
  cleanCoreScore: number;
  complexityScore: number;
  criticalityScore: number;
  findings: number;
  version?: string;
}

/** Format a run-over-run delta with a direction arrow and a good/bad verdict. */
function fmtDelta(delta: number, higherIsBetter: boolean): string {
  if (delta === 0) return 'no change vs. previous run';
  const arrow = delta > 0 ? '▲' : '▼';
  const good = higherIsBetter ? delta > 0 : delta < 0;
  const sign = delta > 0 ? '+' : '';
  return `${arrow} ${sign}${delta} — ${good ? 'improved' : 'regressed'}`;
}

/** Build the "Progress vs. Previous Run" slide from ≥2 immutable analysis runs. */
function buildRunTrendSlide(history: RunTrendPoint[]): SlideData {
  const sorted = [...history].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const curr = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const dScore = curr.cleanCoreScore - prev.cleanCoreScore;
  const dFindings = curr.findings - prev.findings;
  const dComplexity = curr.complexityScore - prev.complexityScore;
  const overall = curr.cleanCoreScore - sorted[0].cleanCoreScore;

  return {
    title: 'Progress vs. Previous Run',
    type: 'metrics',
    subtitle: `Run-over-run delta across ${sorted.length} immutable, signed analysis runs`,
    metrics: [
      { label: 'Clean Core Score', value: `${curr.cleanCoreScore}/100`, sub: fmtDelta(dScore, true) },
      { label: 'Findings', value: `${curr.findings}`, sub: fmtDelta(dFindings, false) },
      { label: 'Complexity', value: `${curr.complexityScore}/100`, sub: fmtDelta(dComplexity, false) },
    ],
    content: [
      `**Trajectory**: Clean Core Score has moved **${overall >= 0 ? '+' : ''}${overall} point${Math.abs(overall) === 1 ? '' : 's'}** since the first recorded run (${sorted.length} runs total).`,
      `**Latest change**: ${dScore > 0 ? `Score improved by ${dScore}` : dScore < 0 ? `Score dropped by ${Math.abs(dScore)}` : 'Score held steady'}; ${dFindings < 0 ? `${Math.abs(dFindings)} fewer finding${Math.abs(dFindings) === 1 ? '' : 's'}` : dFindings > 0 ? `${dFindings} new finding${dFindings === 1 ? '' : 's'}` : 'no change in findings'} versus the previous run.`,
      `**Governance value**: Each run is immutable and HMAC-signed, so this trend is a tamper-evident record of remediation progress — not a re-editable status slide.`,
    ],
    speakerNotes: `Compares the current run against the previous one and the baseline. Score delta ${dScore >= 0 ? '+' : ''}${dScore}, findings delta ${dFindings >= 0 ? '+' : ''}${dFindings}. Because runs are signed and immutable, the progression is auditable, not a self-reported claim.`,
  };
}

export function buildBoardDeck(input: {
  project: Project;
  findings: SupportFinding[];
  runHistory?: RunTrendPoint[];
}): PresentationData {
  const { project, findings, runHistory } = input;
  
  // Calculate rollup level
  const levels = findings.map(f => f.level);
  const overallLevel = findings.length > 0 ? rollupLevel(levels) : 'fully';
  
  // Determine overall status, recommendation, and risk rating
  let recommendation = '';
  let riskRating = '';
  let colorStatus = 'success';
  
  if (overallLevel === 'not-supported') {
    recommendation = 'Core Redesign Required (Rejection / Hold)';
    riskRating = 'HIGH RISK';
    colorStatus = 'danger';
  } else if (overallLevel === 'partial') {
    recommendation = 'Conditional Go-Live Approved';
    riskRating = 'MEDIUM RISK';
    colorStatus = 'warning';
  } else {
    recommendation = 'Unconditional Go-Live Approved';
    riskRating = 'LOW RISK';
    colorStatus = 'success';
  }

  // Slide 1: BLUF (split slide)
  const slide1: SlideData = {
    title: 'Clean-Core Transformation Briefing',
    type: 'split',
    subtitle: `Recommendation: ${recommendation}`,
    leftContent: `**Decision summary:**\n\n• **Target Architecture**: Clean Core Compliance tier using ${project.extensibilityRoute || 'In-App RAP / Side-by-Side CAP'}.\n• **Overall Readiness**: Clean Core Score is **${project.cleanCoreScore ?? 100}/100**.\n• **Rollup Risk Rating**: **${riskRating}** (${overallLevel.toUpperCase()}).\n• **Required Actions**: ${overallLevel === 'not-supported' ? 'Block deployment, redesign unsupported structures.' : overallLevel === 'partial' ? 'Require Lead Architect sign-off before transport.' : 'Proceed to release queue.'}`,
    rightContent: `**Governance Status:**\n\n• **Risk Assessment**: ${riskRating}\n• **Evidence Level**: Evidentiary Board Presentation derived from Static AST Analysis\n• **Fingerprint Identity**: ${project.auditMetadata?.inputFingerprint?.sha256?.substring(0, 12) || 'N/A'}\n• **Model Registry**: ${project.auditMetadata?.modelCard?.model || `Clean-Core Compiler ${APP_VERSION}`}`,
    speakerNotes: `Decision-first board recommendation. This project is rated as ${riskRating} due to worst-case rollup of ${overallLevel} compliance. The target architecture is ${project.extensibilityRoute || 'standard Cloud SDK'}.`
  };

  // Slide 2: What We Can Do (Fully Supported) (metrics slide)
  const inventoryCount = project.codeInventory?.length ?? 0;
  const partialCount = findings.filter(f => f.level === 'partial').length;
  const notSupportedCount = findings.filter(f => f.level === 'not-supported').length;
  const fullySupportedCount = Math.max(0, inventoryCount - partialCount - notSupportedCount);

  const slide2: SlideData = {
    title: 'Fully Supported Capabilities',
    type: 'metrics',
    subtitle: 'High-confidence automated Clean Core migrations',
    metrics: [
      { label: 'Coverage Estimate', value: `${project.coverageEstimate?.percentage ?? 100}%`, sub: 'Fully mapped constructs' },
      { label: 'Clean Core Score', value: `${project.cleanCoreScore ?? 100}/100`, sub: 'Out of 100 maximum' },
      { label: 'Resolved Objects', value: `${fullySupportedCount} / ${inventoryCount || 1}`, sub: 'Static decomposition success' }
    ],
    content: [
      'Direct SELECT mappings resolved to released CDS views / APIs.',
      'Static CALL FUNCTION replaced with equivalent Cloud SDK actions.',
      'Simple wrapper classes fully decomposed into target modern framework architecture.',
      'ABAP OO inheritance chains fully resolved to cloud-compatible types.'
    ],
    speakerNotes: 'These metrics show the automated conversion confidence. These parts of the code require zero manual code rewrites or custom logic redesigns.'
  };

  // Slide 3: Where an Expert Must Step In (Partial Support) (matrix slide)
  const partialFindings = findings.filter(f => f.level === 'partial');
  const partialRows = Object.values(
    partialFindings.reduce((acc, f) => {
      if (!acc[f.construct]) {
        acc[f.construct] = {
          col1: f.title,
          col2: 0,
          col3: f.recommendation,
          col4: '⚠️ Partial',
          status: 'warning',
          url: f.howItWorks
        };
      }
      acc[f.construct].col2++;
      return acc;
    }, {} as Record<string, any>)
  ).map((r: any) => ({
    col1: r.col1,
    col2: `${r.col2} occurrence${r.col2 > 1 ? 's' : ''}`,
    col3: r.col3,
    col4: r.col4,
    status: r.status,
    url: r.url
  }));

  if (partialRows.length === 0) {
    partialRows.push({
      col1: 'No partial constructs detected',
      col2: '—',
      col3: 'All analyzed objects are fully compliant.',
      col4: '✅ Fully Supported',
      status: 'success',
      url: undefined
    });
  }

  const slide3: SlideData = {
    title: 'Architect Attention — Partial Compliance',
    type: 'matrix',
    subtitle: 'Manual code verification and custom logic review recommended',
    rows: partialRows,
    speakerNotes: 'These constructs require manual developer verification or architect sign-off because they cannot be statically resolved with 100% confidence.'
  };

  // Slide 4: Where Gaps Exist (Not Supported) (matrix slide)
  const notSupportedFindings = findings.filter(f => f.level === 'not-supported');
  const notSupportedRows = Object.values(
    notSupportedFindings.reduce((acc, f) => {
      if (!acc[f.construct]) {
        acc[f.construct] = {
          col1: f.title,
          col2: 0,
          col3: f.recommendation,
          col4: '❌ Not Supported',
          status: 'danger',
          url: f.howItWorks
        };
      }
      acc[f.construct].col2++;
      return acc;
    }, {} as Record<string, any>)
  ).map((r: any) => ({
    col1: r.col1,
    col2: `${r.col2} occurrence${r.col2 > 1 ? 's' : ''}`,
    col3: r.col3,
    col4: r.col4,
    status: r.status,
    url: r.url
  }));

  if (notSupportedRows.length === 0) {
    notSupportedRows.push({
      col1: 'No unsupported constructs detected',
      col2: '—',
      col3: 'Zero kernel calls, dynpros, or static legacy screen layouts found.',
      col4: '✅ Zero Gaps',
      status: 'success',
      url: undefined
    });
  }

  const slide4: SlideData = {
    title: 'Governance Gaps — Not Supported',
    type: 'matrix',
    subtitle: 'Core refactoring required before modernization can proceed',
    rows: notSupportedRows,
    speakerNotes: 'Unsupported patterns are hard blockers for automatic modernization. These areas require re-architecting (e.g. converting SAP GUI Dynpro screens to SAP Fiori/UI5).'
  };

  // Slide 5: Migration & Impact (metrics slide)
  const complexity = project.complexityScore ?? 50;
  const criticality = project.criticalityScore ?? 50;
  const weeksSaved = Math.max(1, Math.round(complexity * 0.4));
  const techDebtSaved = Math.round(complexity * 850);
  const blastRadius = complexity > 70 ? 'High Impact' : complexity > 40 ? 'Moderate Impact' : 'Localized Impact';

  const slide5: SlideData = {
    title: 'Modernization Business Case & Blast Radius',
    type: 'metrics',
    subtitle: 'Evidentiary estimation of savings and refactoring impact',
    metrics: [
      { label: 'Complexity Score', value: `${complexity}/100`, sub: `Criticality: ${criticality}/100` },
      { label: 'Estimated Effort Saved', value: `${weeksSaved} Weeks`, sub: 'Automated target generation' },
      { label: 'Annual Tech-Debt Saved', value: `€${techDebtSaved.toLocaleString()}/yr`, sub: 'Reduced maintenance footprint' }
    ],
    content: [
      `**Refactoring Blast Radius**: **${blastRadius}** based on external coupling and nesting depths.`,
      `**Migration Sequence**: Standardize custom databases first, followed by method signatures, and then UI integration.`,
      `**Business Advantage**: Decoupling reduces SAP update cycles from months to days by isolating standard extensions from core upgrades.`
    ],
    speakerNotes: `Complexity rating is ${complexity}/100. This translates to an estimated effort savings of ${weeksSaved} person-weeks via automated code generation. Tech debt reduction yields roughly €${techDebtSaved} annually in avoided custom maintenance.`
  };

  // Slide 6: Trust & Security Boundaries (bullets slide)
  const slide6: SlideData = {
    title: 'Trust & Security Posture',
    type: 'bullets',
    subtitle: 'Stateless processing and credential isolation boundaries',
    content: [
      '**Stateless Analysis Sandbox**: Source code parsing and AST analysis is completed entirely in memory. Zero user source code is stored or used for model training.',
      '**Credential Sandbox Isolation**: ERP connectivity uses short-lived tokens and BTP Destinations. Credentials are never written to disk.',
      '**GDPR-aligned & EU-hosted**: Application storage and primary processing run in the EU region (europe-west1). AI and transactional-email subprocessors are disclosed and process data under their own terms.',
      '**Cryptographic Integrity Checks**: Every generated release pack is cryptographically signed and hashed. Fingerprints are stored in the Audit Pack.'
    ],
    speakerNotes: 'Our platform enforces strict isolation boundaries. We never store SAP credentials or let standard data leak into model training cycles.'
  };

  // Slide 7: Risk Register & Quality Gates (risk slide)
  const riskRows: any[] = [];
  
  const hasCustomWrite = (project.dataCoupling || []).some(dc => dc.accessType !== 'Read');
  if (hasCustomWrite) {
    riskRows.push({
      col1: 'Database Table Coupling writes',
      col2: 'Architect',
      col3: 'Migrate custom persistence to BTP PostgreSQL / isolated schema',
      col4: 'PostgreSQL Schema Verification',
      status: 'danger'
    });
  }
  
  const hasDynamic = findings.some(f => f.construct === 'dynamic-call');
  if (hasDynamic) {
    riskRows.push({
      col1: 'Dynamic code execution (CALL/PERFORM)',
      col2: 'Lead Dev',
      col3: 'Replace with typed wrappers or static interface lookups',
      col4: 'Static Wrapper Code Sign-off',
      status: 'warning'
    });
  }

  const hasUI = findings.some(f => f.construct === 'dynpro-screen');
  if (hasUI) {
    riskRows.push({
      col1: 'SAP GUI Dynpro Screen layout legacy coupling',
      col2: 'UX Lead',
      col3: 'Redesign UI components inside SAP Fiori/UI5',
      col4: 'UI Acceptance Test Pass',
      status: 'danger'
    });
  }

  if (complexity > 60) {
    riskRows.push({
      col1: 'High legacy code complexity',
      col2: 'QA Lead',
      col3: 'Cover transformed logic with ABAP Unit testing',
      col4: 'Unit Test Coverage >= 85%',
      status: 'warning'
    });
  }

  if (riskRows.length === 0) {
    riskRows.push({
      col1: 'Transformation Sandbox Deploy',
      col2: 'Release Mgr',
      col3: 'Execute deployment testing on a mock BTP sandbox tenant',
      col4: 'Sandbox Smoke Test Pass',
      status: 'success'
    });
  }

  const slide7: SlideData = {
    title: 'Strategic Risk Register & Quality Gates',
    type: 'risk',
    subtitle: 'Evidentiary mitigations required prior to production release',
    rows: riskRows,
    speakerNotes: 'This register summarizes the project-specific risks identified during static analysis. Each risk has an assigned owner, clear mitigation strategy, and a concrete gate.'
  };

  const slides: SlideData[] = [slide1, slide2, slide3, slide4, slide5, slide6, slide7];

  // Run-over-run progress — only meaningful with at least two recorded runs.
  if (runHistory && runHistory.length >= 2) {
    // Insert after the business case (slide5), before the trust/security posture.
    slides.splice(5, 0, buildRunTrendSlide(runHistory));
  }

  return {
    title: project.name || 'Executive Summary',
    date: new Date().toLocaleDateString(),
    author: 'Clean-Core Transformation Board',
    slides
  };
}
