import type { Request } from '@playwright/test';

/**
 * The two model calls a page makes by itself, by owner decision of 21.10.2026
 * (roadmap 3.0.20): the plain wording of the engine's sentences
 * (`hooks/usePlainWording.ts`, stage `statements` with the `plain-wording`
 * response shape) and the business names of the map
 * (`hooks/useAutoProcessNaming.ts`, stage `naming`).
 *
 * A spec that guards "this action calls no model" asks this first and refuses
 * such a call without counting it: the hooks then keep the engine's own words,
 * as they do on any refusal. Every other request to `/api/gemini` is still
 * counted — a statement proposal shares the `statements` stage but not the
 * response shape, so it is not let through.
 */
export function isAutomaticWordingCall(request: Request): boolean {
  let body: { stage?: unknown; responseShape?: unknown } | null = null;
  try {
    body = JSON.parse(request.postData() ?? 'null');
  } catch {
    return false;
  }
  if (!body || typeof body !== 'object') return false;
  if (body.stage === 'naming') return true;
  return body.stage === 'statements' && body.responseShape === 'plain-wording';
}

/** The refusal an automatic call gets in a spec that calls no model. */
export const AUTOMATIC_WORDING_REFUSAL = {
  status: 503,
  contentType: 'application/json',
  body: JSON.stringify({ error: 'no model in this spec' }),
};
