/**
 * The part of the demo's browser state the demo workspace and the demo's
 * Analyze, Business read — the answers to the rules and the confirmed route —
 * kept under the demo's key (`DEMO_STORAGE_KEY`, shared with `/demo/{stage}`).
 * Moved out of `components/demo/DemoWorkspaceShell.tsx` when the demo's
 * Business view moved to `/demo/analyze` (v3.1.0, AB-2, O10), so both pages
 * read and write it one way.
 *
 * Browser only, every access wrapped: a browser that refuses storage still runs
 * the demo; it just forgets. Nothing here reaches a route, Firestore or a model.
 */
import { DEMO_STORAGE_KEY } from '@/lib/demo-marks';
import { ELEMENT_STATES, type ElementState } from '@/lib/process-states';
import type { RuleDraft } from '@/lib/rules-editor';

export interface WorkspaceDemoState {
  /** The answers to the rules, by rule id — the product's draft shape (`lib/rules-editor.ts`). */
  ruleAnswers: RuleDraft;
  targetConfirmed: boolean;
}

const isState = (x: unknown): x is ElementState => typeof x === 'string' && (ELEMENT_STATES as readonly string[]).includes(x);

/** What this browser holds, read defensively — a stored value is never trusted to have the shape. */
function ruleAnswersOf(raw: Record<string, unknown>): RuleDraft {
  const out: RuleDraft = {};
  const answers = raw.ruleAnswers;
  if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
    for (const [id, value] of Object.entries(answers as Record<string, unknown>)) {
      const v = value as Record<string, unknown> | null;
      if (!v || !isState(v.state)) continue;
      out[id] = {
        state: v.state,
        note: typeof v.note === 'string' ? v.note : '',
        sourceKind: typeof v.sourceKind === 'string' ? (v.sourceKind as RuleDraft[string]['sourceKind']) : '',
        sourceNote: typeof v.sourceNote === 'string' ? v.sourceNote : '',
        appliesTo: Array.isArray(v.appliesTo) ? v.appliesTo.filter((x): x is string => typeof x === 'string') : [],
      };
    }
  }
  // Before 03.10.2026 the demo only offered "Confirm", which meant the rule is still needed: Keep.
  if (Array.isArray(raw.confirmedRules)) {
    for (const id of raw.confirmedRules) if (typeof id === 'string' && !out[id]) out[id] = { state: 'keep', note: '' };
  }
  return out;
}

function readDemoState(): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The demo workspace's state as this browser holds it. */
export function readWorkspaceDemoState(): WorkspaceDemoState {
  const raw = readDemoState();
  return {
    ruleAnswers: ruleAnswersOf(raw),
    targetConfirmed: raw.targetConfirmed === true,
  };
}

/** Writes the given fields; every other field of the demo's state is kept as it is. */
export function writeWorkspaceDemoState(patch: Partial<WorkspaceDemoState>): void {
  try {
    const { confirmedRules: _old, ...rest } = readDemoState();
    void _old;
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ ...rest, ...patch }));
  } catch {
    /* A browser that refuses storage still runs the demo; it just forgets. */
  }
}

/** "Reset demo": the whole of the demo's state goes. */
export function clearWorkspaceDemoState(): void {
  try {
    window.localStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    /* Nothing to clear. */
  }
}
