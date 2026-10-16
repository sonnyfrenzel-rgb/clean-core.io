/**
 * A `require` for a package the server loads from its own `node_modules` at run time (the TypeScript compiler,
 * `@types/node`, SAP's CDS compiler) — never bundled.
 *
 * Why not `import { createRequire } from 'node:module'`: webpack (the Next.js server build) recognises that
 * import and rewrites `createRequire(<an expression it cannot evaluate>)` to `undefined`. The production build
 * of v3.0.14 compiled `createRequire(path.join(process.cwd(), 'package.json'))` to `let a = void 0`, every load
 * threw "a is not a function", and every CAP/Node generation stored "type check not run" (3.0.15, item 5a,
 * owner's CAP deploy 16.10.2026). `process.getBuiltinModule` (Node >= 22.3) is a call webpack leaves alone.
 * Server-only.
 */

import path from 'node:path';

export function serverRequire(): NodeJS.Require {
  const nodeModule = process.getBuiltinModule('node:module');
  return nodeModule.createRequire(path.join(process.cwd(), 'package.json'));
}
