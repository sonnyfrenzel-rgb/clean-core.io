/**
 * Lets Node's own type stripping run the repository's TypeScript as it is
 * written: `import { x } from './y'`, no extension.
 *
 * Used by `.github/workflows/usage-report.yml`, which runs the weekly report
 * with `node --experimental-strip-types --import ./scripts/lib/ts-extension-hook.mjs`
 * instead of `tsx`. The job holds `id-token: write`, and every package it loads
 * runs beside that permission (QA review, fa0aaea6cc47) — so it loads none: no
 * `npm ci`, no `node_modules`, and this hook is the one piece of `tsx` the
 * report needed. Relative specifiers only; a bare package name is left to fail,
 * which is the point.
 */
import { registerHooks } from 'node:module';

if (typeof registerHooks !== 'function') {
  throw new Error(`node ${process.version} has no module.registerHooks — the report needs Node >= 22.15`);
}

const RELATIVE = /^\.{1,2}\//;
const HAS_EXTENSION = /\.[cm]?[jt]sx?$|\.json$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (RELATIVE.test(specifier) && !HAS_EXTENSION.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // Not a .ts file — let the default resolver produce its own error.
      }
    }
    return nextResolve(specifier, context);
  },
});
