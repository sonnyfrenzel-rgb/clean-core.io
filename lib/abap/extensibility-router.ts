import { AbapEvidenceReport, EvidenceKind } from './evidence-model';

export interface DecisionCheckpoint {
  checkpointName: string;
  question: string;
  evaluation: string;
  resultState: 'In-App Preferred' | 'Side-by-Side Preferred' | 'Neutral';
  cleanCoreImpact: string;
}

export interface ComparativeTrack {
  technicalFeasibility: 'Highly Compatible' | 'Partially Compatible' | 'Incompatible';
  fitDetails: string;
  pros: string[];
  cons: string[];
}

export interface ExtensibilityRouteReport {
  recommendedRoute: 'Side-by-Side (SAP BTP)' | 'In-App (ABAP Cloud)';
  confidenceScore: number;
  rationale: string;
  targetArtifact: string;
  cleanCoreScore: number;
  checkpoints: DecisionCheckpoint[];
  comparativeAnalysis: {
    inAppABAPCloud: ComparativeTrack;
    sideBySideBTP: ComparativeTrack;
  };
  evidenceCounts: {
    totalFindings: number;
    criticalFindings: number;
    supportingFindings: number;
  };
  assumptions: string[];
}

/**
 * A finding kind in the words a report may print.
 *
 * The checkpoints and the track comparison used to print fixed lists of
 * constructs — "BDC, RFC, Custom writes", "custom data persistence or legacy
 * GUI/local file dependencies" — whenever a side-by-side route was chosen, so a
 * program whose only finding was an RFC call was told that BDC screens, native
 * SQL and direct standard-table writes had to be replaced and that its route
 * came from custom persistence. None of it was in its evidence (QA review of
 * b88c77b, 134330d50e4e / 3e102c51d7dc / 708c2f956b51 / 725c5d80afc6). A signed
 * route report that names constructs the source does not contain is not
 * project-specific evidence, whatever else it gets right — so every sentence
 * that names a construct now names one that was found, through this map.
 */
const KIND_LABELS: Record<string, string> = {
  'table-access': 'reads of custom tables',
  'standard-table-read': 'reads of SAP standard tables',
  'standard-table-write': 'direct writes to SAP standard tables',
  'custom-table-write': 'writes to custom persistence',
  'rfc-call': 'RFC calls',
  bdc: 'BDC screen automation',
  dynpro: 'Dynpro screens',
  'classic-alv': 'classic ALV output',
  'gui-download': 'frontend file services',
  'native-sql': 'native SQL',
  'update-task': 'update-task processing',
  'commit-work': 'explicit COMMIT WORK',
  submit: 'SUBMIT program coupling',
  'authority-check': 'authority checks',
  'hardcoded-value': 'hardcoded environment values',
  'unreleased-api': 'use of unreleased APIs',
  'legacy-mail': 'legacy SAPOffice mail',
  'credit-management': 'custom credit management logic',
  'batch-input': 'batch input',
  'business-rule': 'business rules',
  enhancement: 'enhancement technologies',
  modification: 'core modifications',
};

const labelFor = (kind: string) => KIND_LABELS[kind] ?? kind;

/**
 * One construct that drove the route off the stack, with its evidence.
 *
 * Roadmap 8.2 needs the *reason an alternative was rejected*, at the line it
 * stands on. That reason is exactly the rule below, so it is exported rather
 * than reproduced: a second implementation of "what forces side-by-side" is a
 * second answer, and the two would disagree the first time one of them moved.
 */
export interface RouteDriver {
  kind: EvidenceKind;
  /** The words a report may print for this kind — `KIND_LABELS`. */
  label: string;
  count: number;
  /** The lowest `lineStart` among the findings of this kind. */
  firstLine: number;
  /** Finding ids, in the order the evidence reports them. */
  findingIds: string[];
}

/**
 * The constructs that choose a side-by-side route, in the order the rule reads
 * them. Empty means on-stack: `needsBtp` is `drivers.length > 0` and nothing
 * else.
 *
 * `deploymentModel` decides two of the six — custom persistence and direct
 * writes to standard tables are triggers in the Public Edition only (CR-04,
 * see `routeExtensibility`).
 */
export function routeDrivers(
  evidence: AbapEvidenceReport,
  deploymentModel: 'public' | 'private',
): RouteDriver[] {
  const of = (kind: EvidenceKind) => evidence.findings.filter((f) => f.kind === kind);
  const driver = (kind: EvidenceKind): RouteDriver | null => {
    const hits = of(kind);
    if (hits.length === 0) return null;
    return {
      kind,
      label: labelFor(kind),
      count: hits.length,
      firstLine: hits.reduce((min, f) => Math.min(min, f.lineStart), hits[0].lineStart),
      findingIds: hits.map((f) => f.id),
    };
  };
  const ordered: Array<RouteDriver | null> = [
    deploymentModel === 'public' ? driver('custom-table-write') : null,
    driver('bdc'),
    driver('rfc-call'),
    driver('native-sql'),
    driver('gui-download'),
    deploymentModel === 'public' ? driver('standard-table-write') : null,
  ];
  return ordered.filter((d): d is RouteDriver => d !== null);
}

export function routeExtensibility(
  evidence: AbapEvidenceReport,
  deploymentModel: 'public' | 'private'
): ExtensibilityRouteReport {
  const findings = evidence.findings;
  /**
   * What the engine did not assess.
   *
   * A file of nothing but application-server dataset I/O produces no findings,
   * because no detector claims those statements — and "no findings" then became
   * a Clean Core Score of 100, "Highly feasible. Trivial extension" and "No
   * legacy patterns detected". The code had not been found clean; it had not
   * been read (QA review of 33471220d6e9, 45737310a1d7). Incomplete coverage is
   * unknown, and unknown is not clean.
   */
  const coverage = evidence.coverage;
  const coverageIncomplete = coverage ? !coverage.complete : false;
  const unassessedSummary = coverage && coverage.gaps.length
    ? coverage.gaps.map((g) => `${g.count} \u00d7 ${g.label.toLowerCase()} (from line ${g.firstLine})`).join(', ')
    : '';

  // 1. Calculate Clean Core Score deterministically
  // Start at 100%. Deduct per CATEGORY (not per-finding) with diminishing returns.
  // Rationale: even heavily legacy code retains some reusable business logic,
  // AUTHORITY-CHECK patterns, and clear structure. Score 0% should be reserved
  // for code that is 100% unreleased and untransformable.
  let score = 100;
  
  const standardWrites = findings.filter(f => f.kind === 'standard-table-write');
  const customWrites = findings.filter(f => f.kind === 'custom-table-write');
  const standardReads = findings.filter(f => f.kind === 'standard-table-read');
  const bdcCalls = findings.filter(f => f.kind === 'bdc');
  const rfcCalls = findings.filter(f => f.kind === 'rfc-call');
  const nativeSql = findings.filter(f => f.kind === 'native-sql');
  const updateTasks = findings.filter(f => f.kind === 'update-task');
  const fileAccess = findings.filter(f => f.kind === 'gui-download');
  const dynproUi = findings.filter(f => f.kind === 'dynpro');
  // Enhancement technologies decide the clean core LEVEL, not just the score.
  // Modifications are level D outright; enhancement implementations and points
  // are not-recommended technologies; BAdIs are the level-B case and must not
  // be penalised like the others.
  const modifications = findings.filter(f => f.kind === 'modification');
  const enhancements = findings.filter(
    f => f.kind === 'enhancement' && f.objectType !== 'BAdI',
  );

  // Category-based deductions (capped per category, diminishing returns)
  // First occurrence of a category costs more; additional occurrences add less
  const deduct = (count: number, first: number, additional: number, cap: number) =>
    count === 0 ? 0 : Math.min(cap, first + (count - 1) * additional);

  score -= deduct(modifications.length,   30, 5, 40);    // Core modifications — the hardest blocker
  score -= deduct(enhancements.length,    12, 3, 20);   // Enhancement implementations / points
  score -= deduct(standardWrites.length, 20, 3, 25);   // Direct writes to standard tables
  score -= deduct(customWrites.length,   12, 2, 18);    // Custom table writes (still transformable)
  score -= deduct(bdcCalls.length,        10, 3, 15);   // BDC screen automation
  score -= deduct(nativeSql.length,       10, 3, 15);   // Native SQL bypass
  score -= deduct(rfcCalls.length,         8, 2, 12);   // RFC remote calls
  score -= deduct(updateTasks.length,      5, 2, 10);   // Update task patterns
  score -= deduct(fileAccess.length,       5, 2, 10);   // GUI file operations
  score -= deduct(dynproUi.length,         5, 1,  8);   // Dynpro/Screen Painter
  score -= deduct(standardReads.length,    2, 1,  5);   // Standard reads (low penalty)

  // Floor: even the worst legacy code retains some reusable structure (5%)
  score = Math.max(5, score);

  // 2. Determine target route
  //
  // CR-04: a write to the customer's own Z-table used to set this on its own, in
  // both deployment models, with the rationale "custom tables require decoupled
  // Side-by-Side architecture". In Private Edition / RISE that is backwards.
  // Custom persistence in the customer namespace is the textbook developer
  // extensibility case: the table is an ABAP Dictionary object and a RAP business
  // object is built on it, on-stack. A Z-table is not a clean core violation —
  // modifying SAP's tables is. So the most common legacy pattern there is was
  // routing people off-stack to BTP.
  //
  // It stays a Side-by-Side trigger in Public Edition, where the strict SaaS
  // model does not offer that path for custom persistence. The distinction is
  // the deployment, not the construct, which is why it is read from
  // `deploymentModel` and not from the finding.
  const customPersistenceForcesBtp = deploymentModel === 'public' && customWrites.length > 0;

  // The constructs that actually chose the route, in the order the rule reads
  // them, and the one definition of that rule (`routeDrivers` above). Every
  // sentence below that names a construct takes it from here, and so does the
  // architecture contract of roadmap 8.2, which has to give the *same* reason
  // for rejecting the other track.
  const drivers = routeDrivers(evidence, deploymentModel);
  const needsBtp = drivers.length > 0;

  const recommendedRoute = needsBtp ? 'Side-by-Side (SAP BTP)' : 'In-App (ABAP Cloud)';

  const btpTriggerList = drivers.map((d) => d.label).join(', ');
  const presentCategories = [...new Set(findings.map((f) => f.kind))].map(labelFor).join(', ');

  // What this router can say about persistence: a count, not a fit.
  const writeSummary =
    standardWrites.length === 0 && customWrites.length === 0
      ? 'no database write at all'
      : [
          standardWrites.length > 0 ? `${standardWrites.length} write(s) to SAP standard tables` : '',
          customWrites.length > 0 ? `${customWrites.length} write(s) to custom persistence` : '',
        ]
          .filter(Boolean)
          .join(' and ');

  // Calculate confidence score based on the weight of findings
  let confidenceScore = 80;
  // A route chosen from a partial reading is a less confident route, and says so.
  const confidencePenalty = coverageIncomplete ? Math.min(25, (coverage?.gaps.length || 0) * 5 + 10) : 0;
  if (needsBtp) {
    // Custom writes only add confidence where they actually drove the decision.
    const customWeight = customPersistenceForcesBtp ? customWrites.length * 5 : 0;
    confidenceScore = Math.min(95, 80 + customWeight + rfcCalls.length * 5);
  } else {
    confidenceScore = Math.min(90, 70 + standardReads.length * 5);
  }

  // Rationale
  let rationale = '';
  if (modifications.length > 0) {
    rationale = `Detected ${modifications.length} core modification(s) to SAP standard code. Modifications are clean core level D: they must be reset to standard via SPAU and the requirement rebuilt on a released extension point before any cloud target is reachable.`;
    // `!needsBtp` for the same reason the two private branches moved below the
    // triggers: this sentence recommends an on-stack target, so it may not be
    // the explanation of a side-by-side route.
  } else if (enhancements.length > 0 && !needsBtp && customWrites.length === 0 && standardWrites.length === 0) {
    rationale = `Detected ${enhancements.length} enhancement implementation(s) or enhancement point(s). These are not-recommended technologies under the clean core level concept; re-point them to a released BAdI or API, which ABAP Cloud (RAP) supports on-stack.`;
  } else if (customPersistenceForcesBtp) {
    // What this sentence may not claim. It used to read "the strict SaaS model
    // does not offer on-stack custom persistence", which is false: S/4HANA
    // Cloud Public Edition has had developer extensibility since ABAP Cloud
    // arrived with ADT and the three-system landscape, and a custom database
    // table is one of the objects it can hold (SAP Learning, "Using Developer
    // In-App Extensibility in SAP S/4HANA Cloud Public Edition"). The route
    // below is a recommendation with a precondition, not a technical
    // impossibility, and it says so (external counter-review, CR-03).
    rationale = `Detected ${customWrites.length} write(s) to custom database persistence. This recommendation routes it to a decoupled Side-by-Side service (CAP). It is not the only option: S/4HANA Cloud Public Edition can hold custom tables on-stack through developer extensibility (ABAP Cloud), where that is set up and the data belongs on the stack — a decision to take on the requirement, not one this analysis can settle from the code.`;
  } else if (standardWrites.length > 0 && deploymentModel === 'public') {
    rationale = `Direct writes to standard SAP tables are strictly prohibited in S/4HANA Public Cloud. Side-by-Side integration is required.`;
  } else if (rfcCalls.length > 0) {
    rationale = `RFC integrations are present. These should be externalized via SAP Integration Suite destination service.`;
  } else if (fileAccess.length > 0) {
    rationale = `Frontend GUI file services are used. Decoupled web client uploads on BTP are required.`;
  } else if (nativeSql.length > 0) {
    // Native SQL and BDC set `needsBtp` and had no branch of their own, so a
    // program whose only finding was an `EXEC SQL` block was routed
    // Side-by-Side and told in the same report that only standard-table reads
    // and low-criticality patterns had been found and that on-stack RAP was the
    // path (QA review of b88c77b, 789e072a0f28 / 6b8949b2e013 / 9fca7145d0bf /
    // 8b1862e32291). Two contradictory recommendations in one signed report is
    // worse than either of them alone.
    rationale = `Detected ${nativeSql.length} native SQL statement(s) (EXEC SQL or ADBC). Native SQL bypasses the database abstraction and does not run in ABAP Cloud at all; the access has to be rewritten in ABAP SQL against released objects, or moved to a decoupled service.`;
  } else if (bdcCalls.length > 0) {
    rationale = `Detected ${bdcCalls.length} BDC screen automation(s) (CALL TRANSACTION). Screen automation depends on SAP GUI dynpros that carry no stability contract; it has to be replaced by a released API, which is a side-by-side integration where none exists on-stack.`;
  } else if (customWrites.length > 0) {
    rationale = `Detected ${customWrites.length} write(s) to custom database persistence. In Private Edition / RISE this is on-stack developer extensibility, not a reason to leave the stack: the table is a Dictionary object in the customer namespace and a RAP business object is built on it. Writing to your own table is not a clean core violation — writing to SAP's is.`;
  } else if (standardWrites.length > 0) {
    // Not "wrappable". A Tier-2 wrapper encapsulates an unreleased SAP object
    // so that ABAP Cloud code may reach it; it does not make a direct write to
    // SAP's rows a supported operation, and presenting it as the remedy invited
    // the reader to keep the write and hide it (QA review of b88c77b,
    // dbbc1bf8f01d / 7d9778a8a847 / 32ca5741aeb1 / fbc8bdcaa983).
    rationale = `Direct writes to standard SAP tables are present. In Private Edition the write can stay on-stack, but it has to be replaced by a released write API, a BAPI or a RAP action: no wrapper makes a direct modification of SAP's own rows a supported operation.`;
  } else if (findings.length > 0) {
    rationale = `No construct that forces a side-by-side split was detected. What was found — ${presentCategories} — is addressed on-stack, so Developer Extensibility (RAP) is the recommended path.`;
  } else {
    rationale = `No legacy pattern was detected in the part of the code the engine assessed. On-Stack Developer Extensibility (RAP) is the recommended path.`;
  }

  const targetArtifact = needsBtp ? 'CAP Node.js / Java Application' : 'RAP Business Object';

  // 3. Build checkpoints
  const checkpoints: DecisionCheckpoint[] = [
    {
      checkpointName: 'Standard Process Fit',
      question: 'Can this requirement be covered by standard SAP Fiori / S/4HANA features?',
      /**
       * This step answered "Yes, code reads standard tables only" from nothing
       * but the absence of writes — a sentence that was false for every program
       * that writes no table and reads none either, and an answer to a question
       * about the *business requirement* derived from a technical count
       * (QA review of b88c77b, 134330d50e4e / 725c5d80afc6; external
       * counter-review CR-04). Whether SAP standard already covers the
       * capability is what the standard-coverage analysis asks, with evidence
       * levels and a counter-check; this router has no input that could answer
       * it. So it reports what it did measure and leaves the question open
       * rather than answering it by proxy.
       */
      evaluation: `Not determined here. What this step can see is the code, and the code performs ${writeSummary}. Whether SAP standard already covers the requirement is a question about the business capability — the standard-coverage analysis answers it against scope items, with its own evidence.`,
      resultState: 'Neutral',
      cleanCoreImpact: 'Zero modification where standard covers the process — whether it does is not established by this step.'
    },
    {
      checkpointName: 'Key User Extensibility (Tier 3)',
      question: 'Can the extension be implemented using low-code/no-code Key User tools?',
      evaluation: findings.length === 0 && coverageIncomplete
        ? `Not established. No pattern was found, but ${unassessedSummary || 'part of the code'} was not assessed by any detector \u2014 feasibility cannot be judged from what was not read.`
        : findings.length === 0
          ? 'Highly feasible. Trivial extension with no database writes or external integrations.'
          : 'Infeasible. Custom logic, DB writes, or complex calculations exceed Key User capabilities.',
      resultState: findings.length === 0 && !coverageIncomplete ? 'In-App Preferred' : 'Neutral',
      cleanCoreImpact: 'Safe upgrades guaranteed. Completely isolated from the SAP core.'
    },
    {
      checkpointName: 'In-App Developer Extensibility (Tier 1)',
      question: 'Is the logic compatible with strict ABAP Cloud (RAP) on the S/4HANA stack?',
      evaluation: needsBtp
        ? `Partial compatibility. What was found — ${btpTriggerList} — cannot run unchanged on the strict ABAP Cloud stack and has to be replaced or decoupled.`
        : 'High compatibility. Standard reads and helper logic can be directly modernized using RAP CDS views and classes.',
      resultState: needsBtp ? 'Side-by-Side Preferred' : 'In-App Preferred',
      cleanCoreImpact: 'Clean core compliant. Custom objects are clearly separated via Tier-1 API release gates.'
    },
    {
      checkpointName: 'Side-by-Side Extensibility (SAP BTP CAP)',
      question: 'Does the extension require external persistency, non-ABAP runtime, or decoupling?',
      evaluation: needsBtp
        ? `Required by the evidence that chose this route: ${btpTriggerList}.`
        : 'Optional. Simple reads do not justify the architectural overhead of a separate BTP runtime.',
      resultState: needsBtp ? 'Side-by-Side Preferred' : 'In-App Preferred',
      cleanCoreImpact: 'Maximum upgrade safety. Code is completely decoupled from S/4HANA.'
    }
  ];

  // 4. Build Comparative Track Analysis
  /**
   * A core modification blocks both tracks, and the report used to rate them
   * anyway.
   *
   * `modifications` is not part of `needsBtp` — nothing about a modification
   * says the requirement belongs off-stack — so a source whose only finding was
   * a modification marker came out as In-App, "Highly Compatible", "Excellent
   * fit", target RAP Business Object, in the same report whose rationale said no
   * cloud target is reachable until the modification is reset via SPAU
   * (QA review of b88c77b, 4148377496a6 / 85fe8d3e915a / a160b494e1f3). The
   * route stays: it is where the requirement goes once the modification is
   * gone. What cannot stay is a positive feasibility rating for code that today
   * lives inside SAP's own program — so both tracks report the blocker, and the
   * assumptions say what the route describes.
   */
  const modificationBlocks = modifications.length > 0;

  const inAppABAPCloud: ComparativeTrack = {
    technicalFeasibility: modificationBlocks ? 'Incompatible' : needsBtp ? 'Partially Compatible' : 'Highly Compatible',
    fitDetails: modificationBlocks
      ? `Not reachable as it stands. ${modifications.length} core modification(s) sit inside SAP standard code and have to be reset via SPAU before any ABAP Cloud target applies.`
      : needsBtp
      ? `Requires refactoring: ${btpTriggerList} must be replaced with released APIs or decoupled.`
      : 'Excellent fit. On-stack RAP execution provides high performance and direct access to standard released views.',
    pros: [
      'High-performance database access (local reads)',
      'Direct integration with SAP GUI / Fiori Launchpad',
      'No latency or external networking overhead'
    ],
    cons: [
      'Increases memory load on S/4HANA application server',
      'Requires Tier-2 wrapping if unreleased APIs are needed'
    ]
  };

  const sideBySideBTP: ComparativeTrack = {
    technicalFeasibility: modificationBlocks ? 'Incompatible' : 'Highly Compatible',
    fitDetails: modificationBlocks
      ? 'Not reachable as it stands either. Code that was inserted into an SAP program cannot be moved off the stack before it is removed from it.'
      : needsBtp
      ? 'Perfect fit. SAP BTP CAP decoupled persistence safely isolates custom code and legacy APIs from S/4HANA core.'
      : 'Feasible, but introduces architectural overhead for simple read-only reports.',
    pros: [
      'Maximizes upgrade readiness and isolates extensions',
      'Supports modern web runtimes (Node.js, Java, Python)',
      'Decoupled scaling and independent lifecycle management'
    ],
    cons: [
      'Network latency for database queries (OData overhead)',
      'Requires separate licensing for SAP BTP runtimes'
    ]
  };

  // 5. Calculate evidence counts
  const supportingFindings = needsBtp
    ? customWrites.length + bdcCalls.length + rfcCalls.length + nativeSql.length + fileAccess.length + (deploymentModel === 'public' ? standardWrites.length : 0)
    : standardReads.length;

  const evidenceCounts = {
    totalFindings: findings.length,
    criticalFindings: findings.filter(f => f.severity === 'Critical').length,
    supportingFindings,
  };

  // 6. Generate context-sensitive assumptions
  const assumptions: string[] = [];
  if (deploymentModel === 'public') {
    assumptions.push('S/4HANA Public Cloud deployment model selected — no Tier-2 unreleased API access available.');
  } else {
    assumptions.push('S/4HANA Private Cloud deployment model selected — Tier-2 unreleased API wrapping is available.');
  }
  if (modificationBlocks) {
    assumptions.push(`The recommended route is where the requirement goes once the ${modifications.length} core modification(s) have been reset to SAP standard. Until then neither track is reachable: the code runs inside SAP's own program.`);
  }
  if (standardWrites.length > 0 && !needsBtp) {
    // Tier 2 wraps an unreleased SAP object so ABAP Cloud may *use* it. It does
    // not turn a direct modification of SAP's rows into a supported operation,
    // and this line told the reader it did (dbbc1bf8f01d and its three carries).
    assumptions.push('Direct writes to SAP standard tables are replaced with a released write API, a BAPI or a RAP action. A Tier-2 wrapper may encapsulate an unreleased object for use; it does not make a direct write supported.');
  }
  if (rfcCalls.length > 0) {
    assumptions.push('RFC destinations are not yet migrated to SAP Integration Suite or Event Mesh.');
  }
  if (customWrites.length > 0) {
    assumptions.push('Custom table persistence is not yet decoupled into a BTP-managed database or CAP service.');
  }
  if (bdcCalls.length > 0) {
    assumptions.push('BDC screen automations have no equivalent Fiori/API-based replacement yet.');
  }
  if (findings.length === 0 && coverageIncomplete) {
    assumptions.push(`No legacy pattern was found, but the engine did not assess ${unassessedSummary} \u2014 the score and the route below describe the part that was read, not the whole object.`);
  } else if (findings.length === 0) {
    assumptions.push('No legacy patterns detected \u2014 code may already be partially modernized or very simple.');
  }
  if (coverageIncomplete && findings.length > 0) {
    assumptions.push(`Beyond the findings, the engine did not assess ${unassessedSummary}.`);
  }

  return {
    recommendedRoute,
    confidenceScore: Math.max(30, confidenceScore - confidencePenalty),
    rationale,
    targetArtifact,
    // The score describes what was read. A construct no detector claims cannot
    // count towards a clean result, so an incomplete reading costs the score
    // rather than flattering it: five points per unassessed kind, capped at 30,
    // which is enough that "100 %" never comes out of a file nobody assessed
    // (QA review of 33471220d6e9, 45737310a1d7).
    //
    // The floor is the global one. Written as `Math.max(50, …)` the penalty had
    // a floor of its own, and a floor above the scores it was applied to: a
    // heavily legacy program deducted to 25 with two unassessed kinds was
    // published at 50, twice the score, for knowing less about it. A penalty
    // that raises the number is not a penalty (QA review of b88c77b,
    // b2b85826caf3 / f65525eb6d7c).
    cleanCoreScore: coverageIncomplete
      ? Math.max(5, score - Math.min(30, (coverage?.gaps.length || 0) * 5))
      : score,
    checkpoints,
    comparativeAnalysis: {
      inAppABAPCloud,
      sideBySideBTP
    },
    evidenceCounts,
    assumptions,
  };
}
