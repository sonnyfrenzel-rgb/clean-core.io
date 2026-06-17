/**
 * Single source of truth for the construct support matrix.
 *
 * EVERYTHING derives from this module:
 *   - the in-product SupportFinding engine (default levels, sign-off),
 *   - the deep links into https://clean-core.io/how-it-works,
 *   - the public "How it works" page (rendered from SUPPORT_MATRIX),
 *   - the exported transformation report.
 *
 * Because the public page is rendered/validated against this same object, the
 * page cannot silently drift from the engine's real behaviour. When a construct's
 * support level changes here, it changes everywhere — including the public page
 * (enforced by the drift test, see support-matrix.drift.test.ts).
 */

export type SupportLevel = 'fully' | 'partial' | 'not-supported';

export type ConstructType =
  | 'direct-select'
  | 'simple-wrapper'
  | 'static-call'
  | 'complex-sql-join'
  | 'badi-enhancement'
  | 'dynamic-call'
  | 'dynpro-screen'
  | 'kernel-call'
  | 'deep-inheritance'
  | 'rtti-dynamic-type'
  | 'missing-dependency';

export const HOW_IT_WORKS_BASE = 'https://clean-core.io/how-it-works';

export interface SupportMatrixEntry {
  construct: ConstructType;
  /** Published default level for this construct (a single finding may override downward). */
  level: SupportLevel;
  /** Human label — identical to what the public page shows. */
  title: string;
  /** Short notes — identical to the public page's "Notes" column. */
  notes: string;
  /** Anchor id on the how-it-works page (#anchor). */
  anchor: string;
  /** Whether findings of this construct require architect sign-off by default. */
  requiresSignOff: boolean;
}

export const SUPPORT_MATRIX: Record<ConstructType, SupportMatrixEntry> = {
  'direct-select': {
    construct: 'direct-select', level: 'fully', anchor: 'direct-select',
    title: 'Direct SELECT on standard tables',
    notes: 'Deterministic mapping to released CDS views / APIs.',
    requiresSignOff: false,
  },
  'simple-wrapper': {
    construct: 'simple-wrapper', level: 'fully', anchor: 'simple-wrapper',
    title: 'Simple wrapper classes / reports',
    notes: 'Full AST decomposition and target generation.',
    requiresSignOff: false,
  },
  'static-call': {
    construct: 'static-call', level: 'fully', anchor: 'static-call',
    title: 'Static CALL FUNCTION',
    notes: 'Resolved to equivalent API calls.',
    requiresSignOff: false,
  },
  'complex-sql-join': {
    construct: 'complex-sql-join', level: 'partial', anchor: 'complex-sql-join',
    title: 'Complex SQL Joins (3+ tables)',
    notes: 'Generated with review flags; architect sign-off recommended.',
    requiresSignOff: true,
  },
  'badi-enhancement': {
    construct: 'badi-enhancement', level: 'partial', anchor: 'badi-enhancement',
    title: 'BAdI / Enhancement Implementations',
    notes: 'Wiring generated; method body logic requires manual review.',
    requiresSignOff: true,
  },
  'dynamic-call': {
    construct: 'dynamic-call', level: 'partial', anchor: 'dynamic-call',
    title: 'Dynamic CALL FUNCTION / PERFORM',
    notes: 'Flagged with low-confidence warning; cannot resolve at parse time.',
    requiresSignOff: true,
  },
  'dynpro-screen': {
    construct: 'dynpro-screen', level: 'not-supported', anchor: 'dynpro-screen',
    title: 'SAP GUI Dynpro screens (MODULE POOL)',
    notes: 'UI layer requires manual Fiori/UI5 redesign; backend logic extracted separately.',
    requiresSignOff: true,
  },
  'kernel-call': {
    construct: 'kernel-call', level: 'not-supported', anchor: 'kernel-call',
    title: 'Kernel calls (ABAP system internals)',
    notes: 'No public API equivalent exists; must be re-architected or removed.',
    requiresSignOff: true,
  },
  'deep-inheritance': {
    construct: 'deep-inheritance', level: 'fully', anchor: 'deep-inheritance',
    title: 'ABAP OO with inheritance chains',
    notes: 'Fully resolved when all ancestor sources are provided; missing ancestors are requested explicitly.',
    requiresSignOff: false,
  },
  'rtti-dynamic-type': {
    construct: 'rtti-dynamic-type', level: 'partial', anchor: 'rtti-dynamic-type',
    title: 'RTTI / dynamic type resolution',
    notes: 'Runtime-dependent; cannot be resolved statically. Manual verification required.',
    requiresSignOff: true,
  },
  'missing-dependency': {
    construct: 'missing-dependency', level: 'partial', anchor: 'missing-dependency',
    title: 'Missing source dependency',
    notes: 'A referenced class/interface source was not provided. Upload it to complete resolution.',
    requiresSignOff: true,
  },
};

/** Deep link into the public how-it-works page for a given construct. */
export function howItWorksUrl(construct: ConstructType): string {
  return `${HOW_IT_WORKS_BASE}#${SUPPORT_MATRIX[construct].anchor}`;
}

/** Worst-case roll-up: one not-supported ⇒ overall not-supported; any partial ⇒ partial. */
export function rollupLevel(levels: SupportLevel[]): SupportLevel {
  if (levels.includes('not-supported')) return 'not-supported';
  if (levels.includes('partial')) return 'partial';
  return 'fully';
}

/** Human labels / emojis — the single source the UI renders from (no hardcoded table). */
export const LEVEL_LABEL: Record<SupportLevel, string> = {
  'fully': 'Fully Supported',
  'partial': 'Partial',
  'not-supported': 'Not Supported',
};

export const LEVEL_EMOJI: Record<SupportLevel, string> = {
  'fully': '✅',
  'partial': '⚠️',
  'not-supported': '❌',
};

/** Ordered rows for rendering (matrix order). */
export function supportMatrixRows(): SupportMatrixEntry[] {
  return Object.values(SUPPORT_MATRIX);
}
