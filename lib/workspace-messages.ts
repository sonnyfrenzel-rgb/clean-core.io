/**
 * Every string the new surfaces write by themselves — `DESIGN.md` §3, block D
 * step D.29.
 *
 * The same idea as `lib/cc-messages.ts`, one layer up. That catalogue holds
 * what a design-system component says on its own ("Clear filters", "required");
 * this one holds what the object page, the process map and the demo workspace
 * say — the card titles, the empty states, the reasons. The product is English
 * and stays English for 3.0 (ADR-009); the keys exist so the German interface
 * after 3.0 is a second catalogue and not a rewrite of every screen that
 * shipped before it.
 *
 * Split into parts under `lib/messages/`, one per surface, because a single
 * object of several hundred sentences is a file nobody can review. The parts
 * never share a key — every key starts with its surface — and
 * `tests/cc-style-guard.spec.ts` checks that, checks that no value carries a
 * markdown or template marker, and fails on visible text in
 * `components/workspace`, `components/process-map` and the demo workspace that
 * did not come through `wt()`, a formatter from a part, or a prop.
 *
 * Content that is data — a program name, a line of ABAP, a rule the engine
 * derived, a finding's title — is not in here. It arrives from the engine or
 * the project and is shown as it was recorded.
 */

import { WORKSPACE_PAGE_MESSAGES } from './messages/workspace';
import { WORKSPACE_ANSWER_MESSAGES } from './messages/workspace-answers';
import { WORKSPACE_SHELL_MESSAGES } from './messages/workspace-shell';
import { PROCESS_MAP_MESSAGES } from './messages/process-map';
import { PROCESS_EDITOR_MESSAGES } from './messages/process-editor';
import { DEMO_WORKSPACE_MESSAGES } from './messages/demo';
import { OWN_CODE_MESSAGES } from './messages/own-code';
import { WORKSPACE_BUSINESS_MESSAGES } from './messages/workspace-business';
import { WORKSPACE_RULES_MESSAGES } from './messages/workspace-rules';
import { DOCUMENTATION_MESSAGES } from './messages/documentation';
import { WORKSPACE_IT_MESSAGES } from './messages/workspace-it';

/** The parts, by surface — read by the guard to prove that no two share a key. */
export const WORKSPACE_MESSAGE_PARTS = {
  workspace: WORKSPACE_PAGE_MESSAGES,
  answers: WORKSPACE_ANSWER_MESSAGES,
  shell: WORKSPACE_SHELL_MESSAGES,
  processMap: PROCESS_MAP_MESSAGES,
  processEditor: PROCESS_EDITOR_MESSAGES,
  demo: DEMO_WORKSPACE_MESSAGES,
  ownCode: OWN_CODE_MESSAGES,
  business: WORKSPACE_BUSINESS_MESSAGES,
  rules: WORKSPACE_RULES_MESSAGES,
  documentation: DOCUMENTATION_MESSAGES,
  it: WORKSPACE_IT_MESSAGES,
} as const;

export const WORKSPACE_MESSAGES = {
  ...WORKSPACE_PAGE_MESSAGES,
  ...WORKSPACE_ANSWER_MESSAGES,
  ...WORKSPACE_SHELL_MESSAGES,
  ...PROCESS_MAP_MESSAGES,
  ...PROCESS_EDITOR_MESSAGES,
  ...DEMO_WORKSPACE_MESSAGES,
  ...OWN_CODE_MESSAGES,
  ...WORKSPACE_BUSINESS_MESSAGES,
  ...WORKSPACE_RULES_MESSAGES,
  ...DOCUMENTATION_MESSAGES,
  ...WORKSPACE_IT_MESSAGES,
} as const;

export type WorkspaceMessageKey = keyof typeof WORKSPACE_MESSAGES;

/**
 * The lookup — deliberately as plain as `t()` in `lib/cc-messages.ts`: no
 * interpolation, no pluralisation, no fallback to the key. A missing key is a
 * TypeScript error, which is when it is cheapest to fix.
 */
export function wt(key: WorkspaceMessageKey): string {
  return WORKSPACE_MESSAGES[key];
}

export * from './messages/workspace';
export * from './messages/workspace-answers';
export * from './messages/workspace-shell';
export * from './messages/process-map';
export * from './messages/process-editor';
export * from './messages/demo';
export * from './messages/own-code';
export * from './messages/workspace-business';
export * from './messages/workspace-rules';
export * from './messages/documentation';
export * from './messages/workspace-it';
