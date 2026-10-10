/**
 * The words every stage and view shares where a person decides, enters or
 * takes over something — ADR-083 ("One way to decide, enter and take over",
 * accepted 10.10.2026, migrated in steps).
 *
 * One part of the catalogue in `lib/workspace-messages.ts`. This first step
 * holds two patterns:
 *
 * - **Readers.** An invited reader is never offered an act the server refuses.
 *   Where an owner-only control stands, a reader sees it disabled or not at all,
 *   and this one sentence beside it — the same sentence everywhere.
 * - **Replacing stored work.** A regenerate or re-read that replaces what is on
 *   record asks first, in a message box: "Replace … ?", the consequences, the
 *   cost line where a model call follows, and "Replace" / "Keep mine".
 */
export const WORKSPACE_INPUT_MESSAGES = {
  'input.ownerOnly': 'Only the owner can decide or change this.',
  'input.replace': 'Replace',
  'input.keepMine': 'Keep mine',
  'input.replaceGone': 'What is on record now is replaced and cannot be brought back.',

  // Documentation — "Read again from the code" with an SOP and RACI on record.
  'input.replaceDocTitle': 'Replace the process description and its SOP and RACI?',
  'input.replaceDocBody':
    'The process description is read again from the code. The SOP and RACI on record were written for the description it replaces, so they are removed with it.',
  // Documentation — "Regenerate SOP and RACI".
  'input.replaceSopTitle': 'Replace the SOP and RACI?',
  'input.replaceSopBody': 'The model writes a new SOP and RACI proposal for this process description.',
  // Design — "Regenerate" / "Regenerate design".
  'input.replaceDesignTitle': 'Replace the solution design?',
  'input.replaceDesignBody':
    'The model writes a new solution design from the signed evidence — two model calls, the design and its non-functional proposals.',
  // Transformation — "Regenerate code".
  'input.replaceCodeTitle': 'Replace the generated code?',
  'input.replaceCodeBody': 'The model writes a new code package from the signed analysis and the approved design.',
  // Testing — "Regenerate Suite".
  'input.replaceSuiteTitle': 'Replace the test suite?',
  'input.replaceSuiteBody':
    'The model writes new scenarios from the target code. The results of runs against the current scenarios no longer describe the new ones.',
} as const;
