import type { Project } from '@/lib/types';
import type { SupportFinding } from '@/lib/abap/class-model';
import { rollupLevel, type SupportLevel } from '@/lib/abap/support-matrix';
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
  
  /**
   * A verdict needs findings to be a verdict about.
   *
   * Zero findings used to roll up to 'fully' — the best level there is — and
   * the deck went on to print "Unconditional Go-Live Approved / LOW RISK" for
   * a parse that had returned nothing (UX-002, critical). The delivery page
   * hands this function an empty list both for genuinely trivial code and for a
   * detector that threw, and nothing here can tell the two apart; so an empty
   * list is *not determined*: no level, no risk rating, no recommendation.
   *
   * And no "approved" anywhere. The deck's own wording granted a go-live —
   * conditional or unconditional — from a static roll-up alone, with the
   * architect's sign-off never read (QA 4a4321a45f3c). A roll-up says what
   * the code is; whether it may go live is the architect's, and the deck
   * reports that sign-off as what it is: recorded, self-attested, or absent.
   */
  const overallLevel: SupportLevel | null = findings.length > 0 ? rollupLevel(findings.map((f) => f.level)) : null;
  const counts = {
    fully: findings.filter((f) => f.level === 'fully').length,
    partial: findings.filter((f) => f.level === 'partial').length,
    notSupported: findings.filter((f) => f.level === 'not-supported').length,
  };
  const signOff = project.approvedByArchitect
    ? `recorded — self-attested${project.approvedBy ? ` by ${project.approvedBy}` : ''}, not an organisational approval`
    : 'not recorded';

  let recommendation: string;
  let riskRating: string;
  let requiredActions: string;

  if (overallLevel === null) {
    recommendation = 'No verdict — no findings were detected, so coverage is not established';
    riskRating = 'NOT DETERMINED';
    requiredActions = 'Establish coverage first: analyse the complete source, and check the delivery page for a detector error.';
  } else if (overallLevel === 'not-supported') {
    recommendation = 'Core Redesign Required before release';
    riskRating = 'HIGH RISK';
    requiredActions = 'Block deployment, redesign unsupported structures.';
  } else if (overallLevel === 'partial') {
    recommendation = 'Release only with architect sign-off';
    riskRating = 'MEDIUM RISK';
    requiredActions = `Lead Architect sign-off before transport (sign-off ${signOff}).`;
  } else {
    recommendation = 'No blocking findings — release decision open';
    riskRating = 'LOW RISK';
    requiredActions = `No blocking finding among ${findings.length}; the release decision is the architect's (sign-off ${signOff}).`;
  }

  /**
   * A measurement, or an honest gap — never a stand-in that reads like one.
   *
   * This deck goes in front of a steering committee, which makes it the worst
   * place in the product for `?? 100`. A project that was never scored used to
   * present "100/100" and "100% coverage" here, and slide 5 turned an unmeasured
   * complexity of 50 into "20 Weeks saved" and "€42,500/yr". See
   * docs/ARCHITECTURE.md §5.3.
   */
  const measured = (n: number | null | undefined, fmt: (v: number) => string): string =>
    typeof n === 'number' && Number.isFinite(n) ? fmt(n) : 'not computed';

  // Slide 1: BLUF (split slide)
  const slide1: SlideData = {
    title: 'Clean-Core Transformation Briefing',
    type: 'split',
    subtitle: `Recommendation: ${recommendation}`,
    leftContent: `**Decision summary:**\n\n• **Target Architecture**: Clean Core Compliance tier using ${project.extensibilityRoute || 'In-App RAP / Side-by-Side CAP'}.\n• **Overall Readiness**: Clean Core Score is **${measured(project.cleanCoreScore, (v) => `${v}/100`)}**.\n• **Rollup Risk Rating**: **${riskRating}** (${overallLevel ? overallLevel.toUpperCase() : 'no findings to roll up'}).\n• **Required Actions**: ${requiredActions}`,
    rightContent: `**Governance Status:**\n\n• **Risk Assessment**: ${riskRating}\n• **Architect Sign-Off**: ${signOff}\n• **Evidence Level**: Evidentiary Board Presentation derived from the deterministic evidence engine\n• **Fingerprint Identity**: ${project.auditMetadata?.inputFingerprint?.sha256?.substring(0, 12) || 'N/A'}\n• **Model Registry**: ${project.auditMetadata?.modelCard?.model || `Clean-Core Compiler ${APP_VERSION}`}`,
    speakerNotes: overallLevel
      ? `Decision-first board briefing. This project is rated as ${riskRating} due to worst-case rollup of ${overallLevel} compliance across ${findings.length} finding(s). The target architecture is ${project.extensibilityRoute || 'standard Cloud SDK'}. Architect sign-off ${signOff}.`
      : 'No verdict: the static analysis returned no findings, which is what a trivial program and a failed detector have in common. Establish coverage before this briefing is used for a decision.'
  };

  // Slide 2: What We Can Do (Fully Supported) (metrics slide)
  //
  // "Resolved Objects" used to be the object count minus the number of partial
  // and not-supported *findings* — two findings on one object erased another,
  // fully supported object from the figure (QA a71be0146d3c). A finding does
  // not name its object, so no object count can be derived from findings; the
  // deck reports what it has: findings by level.

  // With no findings there is no capability to state either: the title, the
  // bullets and the "zero manual rewrites" note all read as a clean bill, and
  // slide 1 has just said there is no verdict (QA 30215a402132).
  const nothingEstablished = findings.length === 0;
  const slide2: SlideData = {
    title: nothingEstablished ? 'Capabilities — Not Determined' : 'Fully Supported Capabilities',
    type: 'metrics',
    subtitle: nothingEstablished ? 'No findings were detected; coverage is not established' : 'High-confidence automated Clean Core migrations',
    metrics: [
      // With nothing established, a coverage figure on a slide titled "Not
      // Determined" reads as coverage of these findings, which it is not (QA
      // 1f94420f3234). The Clean Core Score is the signed run's own measure,
      // taken by the evidence engine over the whole source — it stays, labelled
      // as what it is, and never as a statement about these findings.
      { label: 'Coverage Estimate', value: nothingEstablished ? 'not determined' : measured(project.coverageEstimate?.percentage, (v) => `${v}%`), sub: nothingEstablished ? 'no findings — nothing to map' : 'Fully mapped constructs' },
      { label: 'Clean Core Score', value: measured(project.cleanCoreScore, (v) => `${v}/100`), sub: nothingEstablished ? "the signed run's score — independent of these findings" : 'Out of 100 maximum' },
      { label: 'Findings by Level', value: findings.length ? `${counts.fully} · ${counts.partial} · ${counts.notSupported}` : 'none detected', sub: findings.length ? 'fully · partial · not supported' : 'coverage not established' }
    ],
    content: nothingEstablished
      ? [
          'No capability can be stated: the static analysis returned no findings, which is what a trivial program and a failed detector have in common.',
          'Establish coverage — analyse the complete source, check the delivery page for a detector error — before this slide is used.',
        ]
      : [
          'Direct SELECT mappings resolved to released CDS views / APIs.',
          'Static CALL FUNCTION replaced with equivalent Cloud SDK actions.',
          'Simple wrapper classes fully decomposed into target modern framework architecture.',
          'ABAP OO inheritance chains fully resolved to cloud-compatible types.',
        ],
    speakerNotes: nothingEstablished
      ? 'Nothing to present here: no findings, no coverage, no capability statement.'
      : 'These metrics show the automated conversion confidence. These parts of the code require zero manual code rewrites or custom logic redesigns.'
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
    // An empty row is not a clean bill: with no findings at all, nothing was
    // established; with findings and none partial, that is what is said.
    partialRows.push(
      findings.length === 0
        ? { col1: 'No findings detected', col2: '—', col3: 'Not a compliance statement — coverage is not established.', col4: '— Not determined', status: 'info', url: undefined }
        : { col1: 'No partial constructs detected', col2: '—', col3: `None of the ${findings.length} finding(s) is partial.`, col4: '✅ None partial', status: 'success', url: undefined },
    );
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
    notSupportedRows.push(
      findings.length === 0
        ? { col1: 'No findings detected', col2: '—', col3: 'Not a compliance statement — coverage is not established.', col4: '— Not determined', status: 'info', url: undefined }
        : { col1: 'No unsupported constructs detected', col2: '—', col3: `None of the ${findings.length} finding(s) is a kernel call, dynpro or static legacy screen layout.`, col4: '✅ Zero gaps among the findings', status: 'success', url: undefined },
    );
  }

  const slide4: SlideData = {
    title: 'Governance Gaps — Not Supported',
    type: 'matrix',
    subtitle: 'Core refactoring required before modernization can proceed',
    rows: notSupportedRows,
    speakerNotes: 'Unsupported patterns are hard blockers for automatic modernization. These areas require re-architecting (e.g. converting SAP GUI Dynpro screens to SAP Fiori/UI5).'
  };

  // Slide 5: Migration & Impact (metrics slide)
  //
  // "Estimated Effort Saved" and "Annual Tech-Debt Saved" used to live here,
  // computed as `complexity * 0.4` weeks and `complexity * 850` euros — from a
  // complexity that itself defaulted to 50 when nothing had been measured. Two
  // multipliers nobody can source, applied to a placeholder, printed as money in
  // front of a board. They are gone rather than rewritten: there is no honest
  // version of a savings figure this product can compute.
  //
  // What replaces them is what the run actually knows.
  const complexity = project.complexityScore;
  const criticality = project.criticalityScore;
  const blastRadius =
    typeof complexity !== 'number'
      ? 'not computed'
      : complexity > 70
        ? 'High Impact'
        : complexity > 40
          ? 'Moderate Impact'
          : 'Localized Impact';

  const slide5: SlideData = {
    title: 'Refactoring Impact',
    type: 'metrics',
    subtitle: 'What the analysis measured — no savings are estimated',
    metrics: [
      { label: 'Complexity Score', value: measured(complexity, (v) => `${v}/100`), sub: `Criticality: ${measured(criticality, (v) => `${v}/100`)}` },
      { label: 'Needs Hand Work', value: nothingEstablished ? 'not determined' : `${counts.notSupported}`, sub: nothingEstablished ? 'no findings — coverage not established' : 'Constructs no generator can transform' },
      { label: 'Needs Review', value: nothingEstablished ? 'not determined' : `${counts.partial}`, sub: nothingEstablished ? 'no findings — coverage not established' : 'Transformable, architect decides' }
    ],
    content: [
      `**Refactoring Blast Radius**: **${blastRadius}** based on external coupling and nesting depths.`,
      `**Migration Sequence**: Standardize custom databases first, followed by method signatures, and then UI integration.`,
      `**Effort and cost**: not estimated here. This deck reports what the engine measured; converting that into person-days or euros needs your own rates and your own delivery model.`
    ],
    speakerNotes: `Complexity is ${measured(complexity, (v) => `${v}/100`)} and criticality ${measured(criticality, (v) => `${v}/100`)}. ${nothingEstablished ? 'No findings were detected, so nothing can be said about hand work or review needs.' : `${counts.notSupported} construct(s) cannot be transformed automatically and ${counts.partial} need an architect decision.`} This deck deliberately carries no savings estimate — the figures it would take are not ours to invent.`
  };

  // Slide 6: Trust & Security Boundaries (bullets slide)
  const slide6: SlideData = {
    title: 'Trust & Security Posture',
    type: 'bullets',
    subtitle: 'Stateless processing and credential isolation boundaries',
    content: [
      '**Deterministic Evidence Analysis**: Code parsing and evidence extraction run server-side. Source code is stored only in your encrypted, access-controlled project workspace and is not used for model training.',
      '**Credential Isolation**: Optional ERP connectivity credentials are encrypted at rest (AES-256-GCM), stored server-side only and never returned to the browser.',
      '**GDPR-aligned & EU-hosted**: Application storage and primary processing run in the EU region (europe-west1). AI and transactional-email subprocessors are disclosed and process data under their own terms.',
      '**Cryptographic Integrity Checks**: The audit pack manifest is hashed and HMAC-signed server-side. Fingerprints are stored in the Audit Pack.'
    ],
    speakerNotes: 'SAP credentials are encrypted at rest and never returned to the browser; standard data is not used for model training. Application storage and primary processing run in the EU.'
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

  if (typeof complexity !== 'number') {
    // Complexity used to default to 50 here, which is below this threshold — so a
    // project that was never scored quietly produced no complexity risk row at
    // all. Silence from a missing measurement reads exactly like a clean result.
    riskRows.push({
      col1: 'Complexity was not measured for this project',
      col2: 'Lead Architect',
      col3: 'Re-run the analysis so the complexity risk can be judged',
      col4: 'Complexity score present in the run record',
      status: 'warning'
    });
  } else if (complexity > 60) {
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
