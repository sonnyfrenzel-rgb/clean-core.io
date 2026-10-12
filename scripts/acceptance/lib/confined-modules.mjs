/**
 * The Node modules the confinement provides (`CONFINED_MODULES` in
 * `../child/engine-cases-core.mjs`), for the bundler's early refusal in
 * `./sandbox.mjs`. A copy, because the runtime ships as one file without
 * imports and because importing it from here made Node 22 load it twice under
 * the spec runner; `tests/qa-80f30e6-harness.spec.ts` holds the two equal.
 */
export const CONFINED_MODULES = ['crypto', 'url', 'http', 'https', 'net'];
