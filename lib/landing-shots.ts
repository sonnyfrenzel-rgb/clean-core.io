/**
 * The product pictures on the public landing page — roadmap 3.0.6.
 *
 * Every product view on the landing page comes from the real workspace, not
 * from a drawing: `tests/capture-screens.spec.ts` (`CAPTURE_LANDING=1`) opens
 * the demo project `Z_MM_PO_APPROVAL` in `/demo/workspace`, photographs it and
 * writes these files under `public/landing/`. The page and the capture both read
 * this list, so a picture the capture no longer takes cannot stay on the page.
 *
 * Pure and import-free: the page reads it on the server, the spec in Node.
 */
export const LANDING_SHOT_DIR = 'landing';

export const LANDING_SHOTS = {
  hero: 'workspace.jpg',
  business: 'view-business.jpg',
  it: 'view-it.jpg',
  management: 'view-management.jpg',
  process: 'process-map.jpg',
  tour: 'demo-tour.jpg',
} as const;

export type LandingShot = keyof typeof LANDING_SHOTS;

/** Width and height every full-window capture is taken at. */
export const LANDING_SHOT_SIZE = { width: 1440, height: 900 } as const;

/** The public URL of one picture. */
export function landingShotSrc(shot: LandingShot): string {
  return `/${LANDING_SHOT_DIR}/${LANDING_SHOTS[shot]}`;
}
