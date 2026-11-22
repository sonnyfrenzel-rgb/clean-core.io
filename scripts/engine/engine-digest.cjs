/**
 * The engine digest (roadmap 3.4.0 item (3), owner decision 22.11.2026): one SHA-256 that names the exact source of
 * the deterministic engine a build carries, so a signed run says which engine computed it — not only which version
 * label it carried.
 *
 * **Which files.** The TypeScript modules statically reachable from the three engine entry points whose output a run
 * signs (`app/api/runs/create/route.ts`):
 *
 *   - `lib/abap/evidence-model.ts`      — `buildAbapEvidence`, the findings and the coverage;
 *   - `lib/abap/extensibility-router.ts` — `routeExtensibility`, the route, the score and the rationale;
 *   - `lib/abap/code-assessment.ts`     — the code inventory, the data coupling and the two scores.
 *
 * Followed: every `import … from`, `export … from`, side-effect `import '…'` and `import('…')` whose specifier is
 * relative or `@/…` and resolves to a `.ts`/`.tsx` file of the repository. Not followed: an import whose every name is
 * `type` (erased by the compiler, it runs nothing), a package, and data files (`*.json` — the SAP catalog data is
 * recorded separately on every run as `sapApiCatalogVersion`). `lib/version.ts` is left out on purpose: the version
 * label is recorded beside the digest (`engineVersion`), and leaving it out lets a release whose engine did not
 * change carry the digest of the release before it.
 *
 * **The digest.** `SHA-256` over the sorted file list, each file as `<path>\n<SHA-256 of its text with CRLF read as
 * LF>\n`, so a Windows checkout and a Linux build agree.
 *
 * Plain JavaScript (CommonJS) and dependency-free: `next.config.mjs` computes it at build time (`CC_ENGINE_DIGEST`), the release
 * capture (`scripts/engine/frozen-digests.ts capture`) records it, and `tests/engine-digest.spec.ts` checks the file
 * list against the TypeScript compiler's own reading of the imports.
 */
'use strict';
// CommonJS on purpose: `next.config.mjs` loads it with `createRequire`, and the specs and scripts import it through
// their TypeScript loaders. An ES module here was loaded twice in one Playwright worker, once transformed and once
// native, and the second load saw no named exports.
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync, statSync } = require('node:fs');
const { join, posix } = require('node:path');

const ENGINE_ENTRY_POINTS = Object.freeze([
  'lib/abap/evidence-model.ts',
  'lib/abap/extensibility-router.ts',
  'lib/abap/code-assessment.ts',
]);

const ENGINE_DIGEST_EXCLUDED = Object.freeze(['lib/version.ts']);

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** Comments blanked, so an `import` named in a comment is no edge. Strings are kept; an import never sits in one. */
function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

/** The module specifiers a file's code imports at run time. */
function runtimeImports(text) {
  const code = withoutComments(text);
  const out = [];
  // import … from '…' / export … from '…' (multi-line clauses included).
  for (const m of code.matchAll(/(?:^|[;\n}])\s*(import|export)\s+([^;'"`]*?)\s+from\s*['"]([^'"]+)['"]/g)) {
    const [, verb, clause, spec] = m;
    const c = clause.trim();
    if (/^type\b/.test(c)) continue;
    if (verb === 'import') {
      const named = /^\{([\s\S]*)\}$/.exec(c);
      if (named) {
        const items = named[1].split(',').map((s) => s.trim()).filter(Boolean);
        if (items.length > 0 && items.every((s) => /^type\s/.test(s))) continue;
      }
    } else if (/^\{([\s\S]*)\}$/.test(c)) {
      const items = c.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
      if (items.length > 0 && items.every((s) => /^type\s/.test(s))) continue;
    }
    out.push(spec);
  }
  // import '…' (side effect).
  for (const m of code.matchAll(/(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g)) out.push(m[1]);
  // import('…').
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
}

/** `exists(path)` and `read(path)` over repository-relative POSIX paths: the working tree or a commit. */
function closure({ exists, read }) {
  const resolve = (from, spec) => {
    let base;
    if (spec.startsWith('@/')) base = spec.slice(2);
    else if (spec.startsWith('.')) base = posix.normalize(posix.join(posix.dirname(from), spec));
    else return null;
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
      if (/\.tsx?$/.test(candidate) && exists(candidate)) return candidate;
    }
    return null;
  };
  const seen = new Set();
  const queue = [...ENGINE_ENTRY_POINTS];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file) || ENGINE_DIGEST_EXCLUDED.includes(file)) continue;
    seen.add(file);
    for (const spec of runtimeImports(read(file))) {
      const target = resolve(file, spec);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return [...seen].sort();
}

function digestOver(files, read) {
  const body = files.map((f) => `${f}\n${sha256(read(f).replace(/\r\n/g, '\n'))}\n`).join('');
  return sha256(body);
}

/** The engine digest of the working tree at `root`, and the files it covers. */
function computeEngineDigest(root) {
  const abs = (p) => join(root, ...p.split('/'));
  const io = {
    exists: (p) => existsSync(abs(p)) && statSync(abs(p)).isFile(),
    read: (p) => readFileSync(abs(p), 'utf8'),
  };
  const files = closure(io);
  return { digest: digestOver(files, io.read), files };
}

/** The engine digest of a commit, read with `git` (for a release captured after the fact). */
function computeEngineDigestAt(root, commit) {
  const listed = new Set(
    execFileSync('git', ['ls-tree', '-r', '--name-only', commit, '--', 'lib', 'app', 'components', 'hooks'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\n')
      .filter(Boolean),
  );
  const cache = new Map();
  const io = {
    exists: (p) => listed.has(p),
    read: (p) => {
      if (!cache.has(p)) cache.set(p, execFileSync('git', ['show', `${commit}:${p}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
      return cache.get(p);
    },
  };
  const files = closure(io);
  return { digest: digestOver(files, io.read), files };
}

module.exports = { ENGINE_ENTRY_POINTS, ENGINE_DIGEST_EXCLUDED, runtimeImports, computeEngineDigest, computeEngineDigestAt };
