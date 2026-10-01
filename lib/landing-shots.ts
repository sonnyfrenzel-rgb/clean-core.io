/**
 * The product pictures on the public landing page — roadmap 3.0.6.
 *
 * Every product view on the landing page comes from the real workspace, not
 * from a drawing: `tests/capture-screens.spec.ts` (`CAPTURE_LANDING=1`) opens
 * the demo project `Z_MM_PO_APPROVAL` in `/demo/workspace` — and, for the
 * stages named `run` in `STAGE_SHOT_SOURCE`, a real run of the same example —
 * photographs it and writes these files under `public/landing/`. The page and the capture both read
 * this list, so a picture the capture no longer takes cannot stay on the page.
 *
 * Pure and import-free at runtime (one type import): the page reads it on the
 * server, the spec in Node.
 */
import type { PhaseKey } from './workflow-steps';

export const LANDING_SHOT_DIR = 'landing';

/**
 * One picture per stage for the timeline in `#workspace-tools`, each taken on
 * that stage of the demo project (`/demo/<stage>`) or of a real run of the
 * example, as `STAGE_SHOT_SOURCE` says. Keyed by `PhaseKey`, so a
 * stage added to `PHASES` without a picture does not compile.
 */
export const STAGE_SHOTS = {
  analyze: 'stage-analyze.jpg',
  design: 'stage-design.jpg',
  transformation: 'stage-transformation.jpg',
  documentation: 'stage-documentation.jpg',
  testing: 'stage-testing.jpg',
  tco: 'stage-tco.jpg',
  delivery: 'stage-delivery.jpg',
} as const satisfies Record<PhaseKey, string>;

/**
 * Where each stage's picture comes from (owner request 01.10.2026, 3.0 tools).
 *
 *   - `demo` — the demo project at `/demo/<stage>`: the engine's reading of the
 *     example, no model call. Used wherever the demo shows the rebuilt tool.
 *   - `run` — a real run of the same shipped example (`Z_MM_PO_APPROVAL.abap`)
 *     on a fresh emulator account, started through the Analyze page the way a
 *     reader starts it. Used where the demo does not show the rebuilt tool
 *     (Analyze, Design) or shows only its refusal (Delivery: a demo has no
 *     signed run, so no audit pack). Whatever a model wrote in such a picture
 *     carries its "Model proposal" mark, as it does in the product.
 *
 * The caption under each picture says which, so a picture of a real run is
 * never passed off as the demo or the other way round.
 */
export type StageShotSource = 'demo' | 'run';

export const STAGE_SHOT_SOURCE = {
  analyze: 'run',
  design: 'run',
  transformation: 'demo',
  documentation: 'demo',
  testing: 'demo',
  tco: 'demo',
  delivery: 'run',
} as const satisfies Record<PhaseKey, StageShotSource>;

/** The caption under a stage picture, by where it was taken. */
export const STAGE_SHOT_CAPTION: Readonly<Record<StageShotSource, string>> = {
  demo: 'Demo project · fictitious code · captured from the workspace',
  run: 'Real run of the example program · fictitious code · captured from the workspace',
};

/** The name under `LANDING_SHOTS` of one stage's picture. */
export function stageShot<K extends PhaseKey>(key: K): `stage-${K}` {
  return `stage-${key}`;
}

export const LANDING_SHOTS = {
  business: 'view-business.jpg',
  it: 'view-it.jpg',
  management: 'view-management.jpg',
  tour: 'demo-tour.jpg',
  'stage-analyze': STAGE_SHOTS.analyze,
  'stage-design': STAGE_SHOTS.design,
  'stage-transformation': STAGE_SHOTS.transformation,
  'stage-documentation': STAGE_SHOTS.documentation,
  'stage-testing': STAGE_SHOTS.testing,
  'stage-tco': STAGE_SHOTS.tco,
  'stage-delivery': STAGE_SHOTS.delivery,
} as const;

export type LandingShot = keyof typeof LANDING_SHOTS;

/** Width and height every full-window capture is taken at. */
export const LANDING_SHOT_SIZE = { width: 1440, height: 900 } as const;

/** The public URL of one picture. */
export function landingShotSrc(shot: LandingShot): string {
  return `/${LANDING_SHOT_DIR}/${LANDING_SHOTS[shot]}`;
}
