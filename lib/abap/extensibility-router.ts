import { AbapEvidenceReport } from './evidence-model';

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
}

export function routeExtensibility(
  evidence: AbapEvidenceReport,
  deploymentModel: 'public' | 'private'
): ExtensibilityRouteReport {
  const findings = evidence.findings;

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

  // Category-based deductions (capped per category, diminishing returns)
  // First occurrence of a category costs more; additional occurrences add less
  const deduct = (count: number, first: number, additional: number, cap: number) =>
    count === 0 ? 0 : Math.min(cap, first + (count - 1) * additional);

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
  // Side-by-Side (BTP) is required if:
  // - There are custom table writes (requires external persistence decouple)
  // - There are RFC calls or BDC calls
  // - There is Native SQL or GUI file downloads (local client files don't work in cloud)
  // - Public Cloud is selected and we have standard table writes (no Tier-2 allowed)
  const needsBtp =
    customWrites.length > 0 ||
    bdcCalls.length > 0 ||
    rfcCalls.length > 0 ||
    nativeSql.length > 0 ||
    fileAccess.length > 0 ||
    (deploymentModel === 'public' && standardWrites.length > 0);

  const recommendedRoute = needsBtp ? 'Side-by-Side (SAP BTP)' : 'In-App (ABAP Cloud)';

  // Calculate confidence score based on the weight of findings
  let confidenceScore = 80;
  if (needsBtp) {
    confidenceScore = Math.min(95, 80 + customWrites.length * 5 + rfcCalls.length * 5);
  } else {
    confidenceScore = Math.min(90, 70 + standardReads.length * 5);
  }

  // Rationale
  let rationale = '';
  if (customWrites.length > 0) {
    rationale = `Detected ${customWrites.length} custom database persistence writes. Custom tables and side-effect logging require decoupled Side-by-Side architecture (CAP).`;
  } else if (standardWrites.length > 0 && deploymentModel === 'public') {
    rationale = `Direct writes to standard SAP tables are strictly prohibited in S/4HANA Public Cloud. Side-by-Side integration is required.`;
  } else if (rfcCalls.length > 0) {
    rationale = `RFC integrations are present. These should be externalized via SAP Integration Suite destination service.`;
  } else if (fileAccess.length > 0) {
    rationale = `Frontend GUI file services are used. Decoupled web client uploads on BTP are required.`;
  } else if (standardWrites.length > 0) {
    rationale = `Direct writes to standard tables are present. In Private Cloud, these can be wrapped via Tier-2, but RAP extensibility is preferred for cleaning the core.`;
  } else {
    rationale = `Only standard table reads and low-criticality code patterns detected. On-Stack Developer Extensibility (RAP) is the recommended path.`;
  }

  const targetArtifact = needsBtp ? 'CAP Node.js / Java Application' : 'RAP Business Object';

  // 3. Build checkpoints
  const checkpoints: DecisionCheckpoint[] = [
    {
      checkpointName: 'Standard Process Fit',
      question: 'Can this requirement be covered by standard SAP Fiori / S/4HANA features?',
      evaluation: standardWrites.length === 0 && customWrites.length === 0
        ? 'Yes, code reads standard tables only. Standard Fiori elements might cover the business process.'
        : 'No, custom database persistency or standard table modifications are present, requiring custom extensibility.',
      resultState: standardWrites.length === 0 && customWrites.length === 0 ? 'In-App Preferred' : 'Neutral',
      cleanCoreImpact: 'Zero modification. Minimizes technical debt by using standard SAP processes.'
    },
    {
      checkpointName: 'Key User Extensibility (Tier 3)',
      question: 'Can the extension be implemented using low-code/no-code Key User tools?',
      evaluation: findings.length === 0
        ? 'Highly feasible. Trivial extension with no database writes or external integrations.'
        : 'Infeasible. Custom logic, DB writes, or complex calculations exceed Key User capabilities.',
      resultState: findings.length === 0 ? 'In-App Preferred' : 'Neutral',
      cleanCoreImpact: 'Safe upgrades guaranteed. Completely isolated from the SAP core.'
    },
    {
      checkpointName: 'In-App Developer Extensibility (Tier 1)',
      question: 'Is the logic compatible with strict ABAP Cloud (RAP) on the S/4HANA stack?',
      evaluation: needsBtp
        ? 'Partial compatibility. Complex legacy dependencies (BDC, RFC, Custom writes) prevent pure on-stack execution without significant refactoring.'
        : 'High compatibility. Standard reads and helper logic can be directly modernized using RAP CDS views and classes.',
      resultState: needsBtp ? 'Side-by-Side Preferred' : 'In-App Preferred',
      cleanCoreImpact: 'Clean core compliant. Custom objects are clearly separated via Tier-1 API release gates.'
    },
    {
      checkpointName: 'Side-by-Side Extensibility (SAP BTP CAP)',
      question: 'Does the extension require external persistency, non-ABAP runtime, or decoupling?',
      evaluation: needsBtp
        ? 'Required. Custom data persistence or legacy GUI/local file dependencies necessitate side-by-side decoupling on SAP BTP.'
        : 'Optional. Simple reads do not justify the architectural overhead of a separate BTP runtime.',
      resultState: needsBtp ? 'Side-by-Side Preferred' : 'In-App Preferred',
      cleanCoreImpact: 'Maximum upgrade safety. Code is completely decoupled from S/4HANA.'
    }
  ];

  // 4. Build Comparative Track Analysis
  const inAppABAPCloud: ComparativeTrack = {
    technicalFeasibility: needsBtp ? 'Partially Compatible' : 'Highly Compatible',
    fitDetails: needsBtp
      ? 'Requires refactoring. BDC screens, native SQL, and direct standard table writes must be replaced with released APIs or wrapped in Tier-2.'
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
    technicalFeasibility: 'Highly Compatible',
    fitDetails: needsBtp
      ? 'Perfect fit. SAP BTP CAP decoupled persistence safely isolates custom code and legacy APIs from S/4HANA core.'
      : 'Feasible, but introduces architectural overhead for simple read-only reports.',
    pros: [
      '100% upgrade safety for S/4HANA core',
      'Supports modern web runtimes (Node.js, Java, Python)',
      'Decoupled scaling and independent lifecycle management'
    ],
    cons: [
      'Network latency for database queries (OData overhead)',
      'Requires separate licensing for SAP BTP runtimes'
    ]
  };

  return {
    recommendedRoute,
    confidenceScore,
    rationale,
    targetArtifact,
    cleanCoreScore: score,
    checkpoints,
    comparativeAnalysis: {
      inAppABAPCloud,
      sideBySideBTP
    }
  };
}
