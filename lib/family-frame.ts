/**
 * The rules of the tools' family frame that are not markup (mock-ups of 15.11.2026; ADR-126, ADR-131, ADR-132,
 * ADR-139, ADR-140; UX review 22.11.2026, Q9). Pure — read by `components/StageHeader.tsx`, the shell and the guards.
 */
import type { PhaseKey } from '@/lib/workflow-steps';

/**
 * Which tools keep the Business | IT | Management switch: those whose views show different content — Design
 * (ADR-126 (2), ADR-130) and Analyze (ADR-140). Every other tool is one page for every reader (ADR-126 (1): Economics,
 * Documentation, Transformation; ADR-131: Testing; ADR-132: Delivery) and shows the note instead. The view a reader
 * came with stays in the address on every tool, so the way back and the next tool open in it.
 */
export const VIEW_SWITCH_TOOLS: readonly PhaseKey[] = Object.freeze(['analyze', 'design']);

export function familyViewMode(tool: PhaseKey | null | undefined): 'switch' | 'one-page' | 'none' {
  if (!tool) return 'none';
  return VIEW_SWITCH_TOOLS.includes(tool) ? 'switch' : 'one-page';
}

/** The quiet note in the switch's place (ADR-126 (1)), as the mock-ups word it. */
export const ONE_PAGE_NOTE = 'One page for all three views';

/**
 * Content widths (ADR-140 W1, UX review Q9): tools 1536 px, lists and reading pages 1280 px, both with the same
 * gutter (16 / 24 / 32 px). The shell bar and the footer stand at the tools' width on every page, so the logo, the path
 * and the account menu never move sideways between a list and a tool.
 */
export const SHELL_WIDTH_CLASS = 'max-w-screen-2xl';
export const TOOL_WIDTH_CLASS = 'max-w-screen-2xl';
export const LIST_WIDTH_CLASS = 'max-w-7xl';

/**
 * The lead under the title of each tool (release 3.5.4, Q2): one sentence that says what the tool is for, on every
 * tool and in every state — loading, failed, empty or filled. A page that knows more (the track, the decision) says
 * its own lead; `StageHeader` falls back to this one where a page names none, so no tool stands without one.
 */
export const TOOL_LEADS: Readonly<Record<PhaseKey, string>> = Object.freeze({
  analyze: 'How far this code is from clean core, why, and where in the code.',
  tco: 'What keeping, rebuilding, moving to SAP standard or retiring this program would cost.',
  design: 'Where this code should run after the change, and the design that gets it there.',
  transformation: 'The successor built from the signed run, and the evidence each part of it rests on.',
  documentation: 'The process description of this program, read from its code in plain words, and ready for your own standard.',
  testing: 'Which checks show the successor behaves like the program, and what is not shown yet.',
  delivery: 'What leaves with the program: the package, its proof, and what is still open before go-live.',
});

/**
 * Where the slim head appears (release 3.5.4, M1): once the title has passed half under the shell bar (56 px). Below it
 * the full head scrolls with the page; above it one line stands under the shell bar.
 */
export const SHELL_BAR_PX = 56;
