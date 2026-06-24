import { test, expect } from '@playwright/test';
import { buildBoardDeck } from '../lib/board-deck';
import { SUPPORT_MATRIX, howItWorksUrl } from '../lib/abap/support-matrix';
import type { Project } from '../lib/types';
import type { SupportFinding } from '../lib/abap/class-model';

test.describe('Board Deck Integrity & Drift Verification', () => {
  const baseProject: Project = {
    name: 'Integrity Test Project',
    cleanCoreScore: 85,
    extensibilityRoute: 'Side-by-Side (SAP BTP)',
    complexityScore: 45,
    criticalityScore: 30,
    codeInventory: [
      { objectName: 'ZCL_COMPLIANT', type: 'Class', criticality: 'Low' },
      { objectName: 'ZCL_PARTIAL', type: 'Class', criticality: 'Medium' }
    ],
    dataCoupling: []
  };

  test('should enforce worst-case rollup of not-supported findings (Slide 1 Recommendation and Risk Rating)', () => {
    const findings: SupportFinding[] = [
      {
        construct: 'dynamic-call',
        level: 'partial',
        title: SUPPORT_MATRIX['dynamic-call'].title,
        detail: 'Dynamic CALL FUNCTION detected',
        recommendation: 'Replace with static wraps',
        howItWorks: howItWorksUrl('dynamic-call'),
        requiresSignOff: true
      },
      {
        construct: 'dynpro-screen',
        level: 'not-supported',
        title: SUPPORT_MATRIX['dynpro-screen'].title,
        detail: 'Dynpro MODULE POOL screen layout',
        recommendation: 'Redesign in Fiori',
        howItWorks: howItWorksUrl('dynpro-screen'),
        requiresSignOff: true
      }
    ];

    const deck = buildBoardDeck({ project: baseProject, findings });
    
    // Slide 1 (type split) should recommend Core Redesign / High Risk
    const slide1 = deck.slides[0];
    expect(slide1.subtitle).toContain('Core Redesign Required');
    expect(slide1.leftContent).toContain('HIGH RISK');
    expect(slide1.leftContent).toContain('Block deployment');
  });

  test('should recommend Conditional Go-Live with partial-only findings', () => {
    const findings: SupportFinding[] = [
      {
        construct: 'dynamic-call',
        level: 'partial',
        title: SUPPORT_MATRIX['dynamic-call'].title,
        detail: 'Dynamic CALL FUNCTION detected',
        recommendation: 'Replace with static wraps',
        howItWorks: howItWorksUrl('dynamic-call'),
        requiresSignOff: true
      }
    ];

    const deck = buildBoardDeck({ project: baseProject, findings });
    
    const slide1 = deck.slides[0];
    expect(slide1.subtitle).toContain('Conditional Go-Live Approved');
    expect(slide1.leftContent).toContain('MEDIUM RISK');
    expect(slide1.leftContent).toContain('Lead Architect sign-off');
  });

  test('should recommend Unconditional Go-Live with zero findings', () => {
    const deck = buildBoardDeck({ project: baseProject, findings: [] });
    
    const slide1 = deck.slides[0];
    expect(slide1.subtitle).toContain('Unconditional Go-Live Approved');
    expect(slide1.leftContent).toContain('LOW RISK');
    expect(slide1.leftContent).toContain('Proceed to release queue');
  });

  test('should enforce drift-free matrix specification urls matching SUPPORT_MATRIX', () => {
    const findings: SupportFinding[] = [
      {
        construct: 'dynamic-call',
        level: 'partial',
        title: SUPPORT_MATRIX['dynamic-call'].title,
        detail: 'Dynamic CALL FUNCTION detected',
        recommendation: 'Replace with static wraps',
        howItWorks: howItWorksUrl('dynamic-call'),
        requiresSignOff: true
      },
      {
        construct: 'dynpro-screen',
        level: 'not-supported',
        title: SUPPORT_MATRIX['dynpro-screen'].title,
        detail: 'Dynpro MODULE POOL screen layout',
        recommendation: 'Redesign in Fiori',
        howItWorks: howItWorksUrl('dynpro-screen'),
        requiresSignOff: true
      }
    ];

    const deck = buildBoardDeck({ project: baseProject, findings });
    
    // Slide 3 (matrix: partial) should contain dynamic-call with correct specification URL
    const slide3 = deck.slides[2];
    expect(slide3.type).toBe('matrix');
    const dynamicRow = slide3.rows?.find(r => r.col1 === SUPPORT_MATRIX['dynamic-call'].title);
    expect(dynamicRow).toBeDefined();
    expect(dynamicRow?.url).toBe(howItWorksUrl('dynamic-call'));

    // Slide 4 (matrix: not-supported) should contain dynpro-screen with correct spec URL
    const slide4 = deck.slides[3];
    expect(slide4.type).toBe('matrix');
    const dynproRow = slide4.rows?.find(r => r.col1 === SUPPORT_MATRIX['dynpro-screen'].title);
    expect(dynproRow).toBeDefined();
    expect(dynproRow?.url).toBe(howItWorksUrl('dynpro-screen'));
  });

  test('should correctly compute metrics savings and list risk register based on data-coupling writes', () => {
    const projectWithCoupling: Project = {
      ...baseProject,
      dataCoupling: [
        { tableName: 'BSEG', accessType: 'Write', isCustom: false, riskLevel: 'High', recommendation: 'CDS View replacement' }
      ]
    };
    
    const deck = buildBoardDeck({ project: projectWithCoupling, findings: [] });
    
    // Slide 5 (metrics) should contain Complexity and Effort Savings
    const slide5 = deck.slides[4];
    expect(slide5.type).toBe('metrics');
    expect(slide5.metrics).toBeDefined();
    expect(slide5.metrics?.[1].label).toBe('Estimated Effort Saved');

    // Slide 7 (risk) should contain BSEG table write risk
    const slide7 = deck.slides[6];
    expect(slide7.type).toBe('risk');
    const tableWriteRisk = slide7.rows?.find(r => r.col1.includes('Table Coupling'));
    expect(tableWriteRisk).toBeDefined();
    expect(tableWriteRisk?.status).toBe('danger');
    expect(tableWriteRisk?.col4).toBe('PostgreSQL Schema Verification');
  });
});
