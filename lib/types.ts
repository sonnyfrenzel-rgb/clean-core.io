/**
 * Central type definitions for the Clean-Core.io platform.
 * Replaces all `any` project state typings across pages and hooks.
 */

export interface TestCase {
  id: string;
  name: string;
  category: string;
  description: string;
  preconditions?: string;
  steps?: string[];
  expectedResult?: string;
  priority: 'High' | 'Medium' | 'Low';
  testData?: string;
  validationPoints?: string[];
  status?: 'Passed' | 'Failed' | 'Pending';
  message?: string;
}

export interface TestSuite {
  code: string;
  config?: string;
  spec?: string;
}

export interface CoverageEstimate {
  percentage: number;
  explanation: string;
  missingCoverage: string;
}

export interface ManualTestRequirement {
  area: string;
  reason: string;
  verificationSteps: string[];
}

export interface S4Config {
  url?: string;
  username?: string;
  password?: string;
  authType?: 'basic' | 'oauth2' | 'sap_hub' | 'btp_destination';
  btpDestinationJson?: string;
}

export interface Project {
  name: string;
  legacyCode?: string;
  analysis?: string;
  solutionDesign?: string;
  generatedCode?: string;
  testCases?: TestCase[];
  testSuite?: TestSuite;
  coverageEstimate?: CoverageEstimate;
  manualTestingRequirements?: ManualTestRequirement[];
  documentation?: string;
  businessDocumentation?: string;
  presentation?: string;
  extensibilityRoute?: string;
  s4Deployment?: 'public' | 'private';
  s4Environment?: 'mock' | 'live';
  /** @deprecated Use s4Meta — s4Config stored cleartext secrets */
  s4Config?: S4Config;
  s4Meta?: {
    configured: boolean;
    url: string;
    username: string;
    authType: string;
    tokenUrl: string;
  };
  status?: 'created' | 'analyzed' | 'designed' | 'transformed' | 'testing' | 'documented' | 'completed';
  exports?: Record<string, string>;
  cleanCoreScore?: number;
  highComplianceCharged?: boolean;
  charged?: boolean;
  transformationBypass?: boolean;
  fromExample?: boolean;
  isExample?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AnalysisData {
  projectTitle: string;
  cleanCoreScore: number;
  summary: string;
  asIsContext: string;
  standardFit: {
    potential: 'High' | 'Medium' | 'Low';
    targetStandardProcess: string;
    rationale: string;
  };
  gaps: Array<{
    title: string;
    severity: 'High' | 'Medium' | 'Low';
    strategy: string;
    rationale: string;
    complexity: 'High' | 'Medium' | 'Low';
  }>;
  recommendations: {
    keepCoreClean: string;
    decommissioning: string;
    cloudReadiness: string;
  };
  strategicNextSteps: string[];
  extensibilityRouting?: {
    recommendedRoute: 'Side-by-Side (SAP BTP)' | 'In-App (ABAP Cloud)';
    confidenceScore: number;
    rationale: string;
    targetArtifact: string;
    decisionTreeCheckpoints?: Array<{
      checkpointName: string;
      question: string;
      evaluation: string;
      resultState: 'In-App Preferred' | 'Side-by-Side Preferred' | 'Neutral';
      cleanCoreImpact: string;
    }>;
    comparativeAnalysis?: {
      inAppABAPCloud: {
        technicalFeasibility: 'Highly Compatible' | 'Partially Compatible' | 'Incompatible';
        fitDetails: string;
        pros: string[];
        cons: string[];
      };
      sideBySideBTP: {
        technicalFeasibility: 'Highly Compatible' | 'Partially Compatible' | 'Incompatible';
        fitDetails: string;
        pros: string[];
        cons: string[];
      };
    };
  };
  businessValueAnalysis?: {
    legacyAssetScore: number;
    technicalDebtLevel: 'Low' | 'Medium' | 'High';
    estimatedMaintenanceCost: number;
    valueDrivers: string[];
    cloudRoiSummary: string;
    plainEnglishActionPlan: string[];
  };
}

export interface DesignData {
  projectName: string;
  architectureOverview: {
    approachDescription: string;
    nodeFramework: string;
    runtimePlatform: string; // e.g. SAP BTP, AWS ECS, Google Cloud Run
  };
  nodeAppBlueprint: {
    projectStructure: Array<{ path: string; purpose: string }>;
    apiEndpoints: Array<{ path: string; method: 'GET' | 'POST' | 'PUT' | 'DELETE'; description: string }>;
  };
  cloudServices: Array<{
    serviceName: string;
    purpose: string;
    npmPackages: string[];
  }>;
  dataSync: {
    patternName: string;
    description: string;
  };
  sapStandardApiMapping?: Array<{
    legacyTableOrFunction: string;
    sapStandardApiName: string;
    apiHubUrl: string;
    apiId: string;
    description: string;
  }>;
  securityHardening: Array<{
    category: string;
    requirement: string;
    packageOrConfig: string;
  }>;
  roadmap: Array<{
    phase: string;
    title: string;
    deliverables: string[];
  }>;
}


