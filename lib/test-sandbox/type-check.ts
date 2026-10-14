/**
 * The type check of a Node candidate (roadmap 3.0.13, A1): the TypeScript
 * compiler, through its API, over the candidate's own `.ts` files with the
 * options the package ships in `tsconfig.json` — what `npm run typecheck`
 * (`tsc -p .`) would say, without a process, a file on disk or a port.
 *
 * Why it is needed: the runner only bundles the candidate with esbuild, which
 * strips types and never checks them. A body that reads a field its record
 * does not have, or hands a number where a decimal string is declared, ran
 * (or threw) without anyone saying the code does not compile under its own
 * `tsconfig.json`.
 *
 * How: the candidate's files live in a virtual directory outside the project
 * (nothing of the app's `node_modules` can be imported from there); the
 * standard library and `@types/node` are read from the server's own
 * `node_modules`. Both are production dependencies — the Cloud Run build
 * installs no devDependencies (`tests/server-external-deps-guard.spec.ts`).
 * TypeScript is loaded with `createRequire` at run time, never bundled.
 *
 * Server-only (the route of `/api/run-tests` and the specs); never imported
 * by a client module — the compiler is 9 MB.
 */

import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import type * as TS from 'typescript';
import { CAP_TYPES_STANDIN } from '../transformation/cap-api-declaration';

export interface TypeFinding {
  /** The candidate's own path (`srv/steps/u03-check-limit.ts`). */
  path: string;
  /** 1-based. */
  line: number;
  /** `TS2339`. */
  code: string;
  message: string;
}

export type TypeCheckResult =
  | {
      ran: true;
      /** The TypeScript version that ran. */
      typescript: string;
      /** `.ts` files of the candidate the compiler read. */
      files: number;
      /** Of those, files with at least one error. */
      failedFiles: number;
      /** Every error, counted in full; `findings` holds the first `TYPE_FINDINGS_MAX`. */
      errors: number;
      findings: TypeFinding[];
      ms: number;
    }
  | { ran: false; reason: string };

export const TYPE_FINDINGS_MAX = 200;

/** The compiler options of the scaffold's `tsconfig.json` (`scaffold-node.ts` `TSCONFIG`; a spec holds them equal). */
export const CANDIDATE_TS_OPTIONS = {
  target: 'ES2022',
  module: 'NodeNext',
  moduleResolution: 'NodeNext',
  strict: true,
  noEmit: true,
  allowImportingTsExtensions: true,
  verbatimModuleSyntax: true,
  erasableSyntaxOnly: true,
  skipLibCheck: true,
  types: ['node'],
} as const;

/** The files `tsconfig.json` includes: `srv/**` and `test/**` TypeScript. */
export function typeCheckedPaths(files: ReadonlyArray<{ path: string }>): string[] {
  return files.map((f) => norm(f.path)).filter((p) => /^(?:srv|test)\/.+\.ts$/.test(p) && !p.endsWith('.d.ts'));
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');

interface Loaded {
  ts: typeof TS;
  typeRoots: string;
}

let loaded: Loaded | null | undefined;
let loadError = '';

/** TypeScript and `@types/node` from the server's `node_modules` (or null, with the reason in `loadError`). */
function load(): Loaded | null {
  if (loaded !== undefined) return loaded;
  try {
    const req = createRequire(path.join(process.cwd(), 'package.json'));
    const ts = req('typescript') as typeof TS;
    const nodeTypes = path.dirname(req.resolve('@types/node/package.json'));
    loaded = { ts, typeRoots: path.dirname(nodeTypes) };
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    loaded = null;
  }
  return loaded;
}

/** Library files parsed once per process: the standard library and `@types/node` never change between calls. */
const libCache = new Map<string, TS.SourceFile>();

/**
 * Type-check a Node candidate. Never throws: a compiler that cannot be loaded
 * is `ran: false` with the reason — the generation then says the type check
 * did not run, never that it passed.
 */
export function typeCheckCandidate(files: ReadonlyArray<{ path: string; content: string }>, now: () => number = () => Date.now()): TypeCheckResult {
  const t0 = now();
  const lib = load();
  if (!lib) return { ran: false, reason: `Type check not run: the TypeScript compiler could not be loaded on the server (${loadError.slice(0, 200)}).` };
  const { ts } = lib;
  const roots = typeCheckedPaths(files);
  if (roots.length === 0) return { ran: false, reason: 'Type check not run: the candidate has no TypeScript file under srv/ or test/.' };

  // A directory that does not exist, outside the project: the candidate's imports resolve only among its own files.
  const base = path.join(os.tmpdir(), 'cc-type-check-candidate').replace(/\\/g, '/');
  const virtual = new Map<string, string>();
  // The CAP shell (3.0.13) references @cap-js/cds-types; here Clean-Core.io's declaration of the API it uses
  // stands in for it (`cap-api-declaration.ts`) — a package that ships its own copy keeps its own.
  for (const f of CAP_TYPES_STANDIN) virtual.set(`${base}/${f.path}`, f.content);
  for (const f of files) virtual.set(`${base}/${norm(f.path)}`, f.content);
  const key = (p: string) => p.replace(/\\/g, '/');
  const inVirtual = (p: string) => key(p).startsWith(`${base}/`) || key(p) === base;

  const converted = ts.convertCompilerOptionsFromJson({ ...CANDIDATE_TS_OPTIONS, types: [...CANDIDATE_TS_OPTIONS.types] }, base);
  const options: TS.CompilerOptions = { ...converted.options, typeRoots: [lib.typeRoots], noEmit: true };
  const host = ts.createCompilerHost(options, true);
  const realGetSourceFile = host.getSourceFile.bind(host);
  const realFileExists = host.fileExists.bind(host);
  const realReadFile = host.readFile.bind(host);
  const realDirectoryExists = host.directoryExists?.bind(host);
  host.fileExists = (p) => (inVirtual(p) ? virtual.has(key(p)) : realFileExists(p));
  host.readFile = (p) => (inVirtual(p) ? virtual.get(key(p)) : realReadFile(p));
  host.directoryExists = (d) => {
    if (inVirtual(d)) {
      const prefix = `${key(d).replace(/\/$/, '')}/`;
      return key(d) === base || [...virtual.keys()].some((k) => k.startsWith(prefix));
    }
    return realDirectoryExists ? realDirectoryExists(d) : true;
  };
  host.getCurrentDirectory = () => base;
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    if (inVirtual(fileName)) {
      const text = virtual.get(key(fileName));
      return text === undefined ? undefined : ts.createSourceFile(fileName, text, languageVersion, true);
    }
    const cacheKey = `${key(fileName)}|${typeof languageVersion === 'object' ? languageVersion.languageVersion : languageVersion}`;
    const hit = libCache.get(cacheKey);
    if (hit) return hit;
    const sf = realGetSourceFile(fileName, languageVersion, onError, shouldCreate);
    if (sf) libCache.set(cacheKey, sf);
    return sf;
  };
  host.writeFile = () => {};

  try {
    const program = ts.createProgram({ rootNames: roots.map((p) => `${base}/${p}`), options, host });
    const diagnostics = [...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics(), ...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()].filter(
      (d) => d.category === ts.DiagnosticCategory.Error,
    );
    const findings: TypeFinding[] = [];
    const failed = new Set<string>();
    for (const d of diagnostics) {
      const file = d.file && inVirtual(d.file.fileName) ? key(d.file.fileName).slice(base.length + 1) : d.file ? `(library) ${path.basename(d.file.fileName)}` : '(options)';
      const line = d.file && typeof d.start === 'number' ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0;
      failed.add(file);
      if (findings.length < TYPE_FINDINGS_MAX) {
        findings.push({ path: file, line, code: `TS${d.code}`, message: ts.flattenDiagnosticMessageText(d.messageText, ' ').replace(/\s+/g, ' ').slice(0, 400) });
      }
    }
    return {
      ran: true,
      typescript: ts.version,
      files: roots.length,
      failedFiles: [...failed].filter((f) => roots.includes(f)).length,
      errors: diagnostics.length,
      findings,
      ms: Math.max(0, now() - t0),
    };
  } catch (err) {
    return { ran: false, reason: `Type check not run: the compiler failed on this candidate (${(err instanceof Error ? err.message : String(err)).slice(0, 200)}).` };
  }
}
