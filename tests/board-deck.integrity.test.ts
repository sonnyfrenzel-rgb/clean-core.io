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

  test('partial-only findings ask for the architect, and report the sign-off as it is', () => {
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
    expect(slide1.subtitle).toContain('Release only with architect sign-off');
    expect(slide1.leftContent).toContain('MEDIUM RISK');
    expect(slide1.leftContent).toContain('Lead Architect sign-off');
    // The deck used to say "Conditional Go-Live Approved" here, an approval
    // nobody had given: baseProject carries no sign-off, and the deck says so.
    expect(slide1.leftContent).toContain('sign-off not recorded');
    expect(slide1.rightContent).toContain('Architect Sign-Off**: not recorded');
    expect(JSON.stringify(deck)).not.toMatch(/approved/i);

    const signed = buildBoardDeck({ project: { ...baseProject, approvedByArchitect: true, approvedBy: 'lead@example.com' }, findings });
    expect(signed.slides[0].rightContent).toContain('recorded — self-attested by lead@example.com, not an organisational approval');
    expect(JSON.stringify(signed)).not.toMatch(/go-live approved|unconditional/i);
  });

  test('zero findings is no verdict — not a clean bill, not a risk rating, not a recommendation', () => {
    // A trivial program and a detector that threw both arrive here as an
    // empty list. The deck used to seal both as "Unconditional Go-Live
    // Approved / LOW RISK" (UX-002, critical).
    const deck = buildBoardDeck({ project: baseProject, findings: [] });

    const slide1 = deck.slides[0];
    expect(slide1.subtitle).toContain('No verdict');
    expect(slide1.leftContent).toContain('NOT DETERMINED');
    expect(slide1.leftContent).toContain('Establish coverage first');
    expect(slide1.leftContent).not.toContain('LOW RISK');
    expect(slide1.speakerNotes).toContain('No verdict');
    const text = JSON.stringify(deck);
    expect(text).not.toMatch(/approved|proceed to release|fully compliant|zero gaps|LOW RISK/i);

    // Slides 2–5 say "not established" instead of drawing a green row or a
    // capability, and the whole serialised deck carries no capability or
    // zero-work claim anywhere (QA 30215a402132).
    expect(deck.slides[1].title).toBe('Capabilities — Not Determined');
    expect(deck.slides[1].metrics?.find((m) => m.label === 'Findings by Level')?.value).toBe('none detected');
    for (const i of [2, 3]) {
      const row = deck.slides[i].rows?.[0];
      expect(row?.col1).toBe('No findings detected');
      expect(row?.col4).toBe('— Not determined');
      expect(row?.status).toBe('info');
    }
    for (const label of ['Needs Hand Work', 'Needs Review']) {
      expect(deck.slides[4].metrics?.find((m) => m.label === label)?.value).toBe('not determined');
    }
    expect(text).not.toMatch(/fully supported|high-confidence|resolved to released|fully decomposed|fully resolved|zero manual|cannot be transformed automatically/i);
  });

  test('with findings and no blocking one, the deck reports low risk and leaves the release decision open', () => {
    const findings: SupportFinding[] = [
      {
        construct: 'direct-select',
        level: 'fully',
        title: SUPPORT_MATRIX['direct-select'].title,
        detail: 'SELECT on VBAK',
        recommendation: 'Map to I_SalesDocument',
        howItWorks: howItWorksUrl('direct-select'),
        requiresSignOff: false,
      },
    ];
    const deck = buildBoardDeck({ project: baseProject, findings });
    const slide1 = deck.slides[0];
    expect(slide1.subtitle).toContain('No blocking findings — release decision open');
    expect(slide1.leftContent).toContain('LOW RISK');
    expect(slide1.leftContent).toContain("the release decision is the architect's");
    expect(JSON.stringify(deck)).not.toMatch(/approved|proceed to release queue/i);
    // Findings by level, not an object count derived from finding counts.
    expect(deck.slides[1].metrics?.find((m) => m.label === 'Findings by Level')?.value).toBe('1 · 0 · 0');
    expect(JSON.stringify(deck)).not.toContain('Resolved Objects');
    expect(deck.slides[2].rows?.[0]?.col3).toBe('None of the 1 finding(s) is partial.');
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

  test('the deck states no savings, and lists the data-coupling risk', () => {
    const projectWithCoupling: Project = {
      ...baseProject,
      dataCoupling: [
        { tableName: 'BSEG', accessType: 'Write', isCustom: false, riskLevel: 'High', recommendation: 'CDS View replacement' }
      ]
    };
    
    const deck = buildBoardDeck({ project: projectWithCoupling, findings: [] });
    
    // Slide 5 used to carry "Estimated Effort Saved" and "Annual Tech-Debt Saved",
    // computed as complexity * 0.4 weeks and complexity * 850 euros — from a
    // complexity that itself defaulted to 50 when nothing had been measured. This
    // test asserted the first of those labels was present, which is how two
    // unsourceable multipliers stayed in a deck meant for a steering committee.
    const slide5 = deck.slides[4];
    expect(slide5.type).toBe('metrics');
    expect(slide5.metrics).toBeDefined();

    const labels = slide5.metrics!.map((m) => m.label);
    for (const gone of ['Estimated Effort Saved', 'Annual Tech-Debt Saved']) {
      expect(labels, `${gone} came back`).not.toContain(gone);
    }
    // Nothing anywhere on the slide may quote money or person-weeks.
    const slideText = JSON.stringify(slide5);
    expect(slideText).not.toMatch(/€|person-weeks|Weeks Saved/i);

    // What it does carry is what the run measured.
    expect(labels).toContain('Complexity Score');
    expect(labels).toContain('Needs Hand Work');

    // Slide 7 (risk) should contain BSEG table write risk
    const slide7 = deck.slides[6];
    expect(slide7.type).toBe('risk');
    const tableWriteRisk = slide7.rows?.find(r => r.col1.includes('Table Coupling'));
    expect(tableWriteRisk).toBeDefined();
    expect(tableWriteRisk?.status).toBe('danger');
    expect(tableWriteRisk?.col4).toBe('PostgreSQL Schema Verification');
  });
});
