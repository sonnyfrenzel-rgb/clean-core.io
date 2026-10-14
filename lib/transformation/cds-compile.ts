/**
 * `cds compile` of a package's CAP model and service (roadmap 3.0.13, CAP shell): SAP's CDS compiler
 * (`@sap/cds-compiler`) through its API — `compileSources` over every `.cds` file of the package, then the
 * OData transformation of the services (`for.odata`) and their EDMX (`to.edmx.all`) — in process, without a
 * server, a file on disk or a port. What `npx cds compile srv` in the package would say, plus whether the
 * service can be served over OData at all.
 *
 * Where it runs: wherever the compiler is installed. It is a devDependency of this repository — the specs run
 * it on every scaffold (PO, the fixtures, the SD and PM programs where they are on the machine) — and is NOT
 * part of the production server: `@sap/cds-compiler` is licensed under the SAP Developer License, which grants
 * use for developing applications, not running SAP's tool as part of a service for third parties outside SAP
 * BTP. On the server the check therefore answers `ran: false` with that reason, the package's record says the
 * compile did not run there, and the CAP capabilities stay `proposed` (delivery-package.ts) — never
 * `implemented` on a compile that did not happen. The CDS files are written by the engine alone (no fill
 * region), so the specs' compile of every scaffold shape is the compile of what ships; the package carries
 * `npm run compile` for the reader's own check.
 *
 * Loaded with `createRequire` at run time, never bundled (like the TypeScript compiler, type-check.ts).
 * Server-only. Never throws.
 */

import { createRequire } from 'node:module';
import path from 'node:path';

export interface CdsFinding {
  path: string;
  line: number;
  severity: 'Error' | 'Warning';
  id: string;
  message: string;
}

export type CdsCompileResult =
  | {
      ran: true;
      /** The compiler version that ran. */
      compiler: string;
      /** `.cds` files compiled. */
      files: number;
      errors: number;
      warnings: number;
      /** Services the model defines, after the OData transformation. */
      services: string[];
      findings: CdsFinding[];
    }
  | { ran: false; reason: string };

export const CDS_FINDINGS_MAX = 100;

interface CdsCompiler {
  version(): string;
  compileSources(sources: Record<string, string>, options: { messages: CdsMessage[] }): unknown;
  for: { odata(csn: unknown, options: { messages: CdsMessage[] }): unknown };
  to: { edmx: { all(csn: unknown, options: { messages: CdsMessage[]; odataVersion: string }): Record<string, unknown> } };
}

interface CdsMessage {
  severity: string;
  messageId?: string;
  message: string;
  $location?: { file?: string; line?: number };
}

let loaded: CdsCompiler | null | undefined;
let loadError = '';

/** The compiler from this installation's `node_modules`, or null with the reason. */
function load(): CdsCompiler | null {
  if (loaded !== undefined) return loaded;
  try {
    const req = createRequire(path.join(process.cwd(), 'package.json'));
    loaded = req('@sap/cds-compiler') as CdsCompiler;
  } catch (err) {
    loadError = err instanceof Error ? err.message.split('\n')[0] : String(err);
    loaded = null;
  }
  return loaded;
}

/** The reason the compile does not run where the compiler is not installed. */
export const CDS_COMPILER_NOT_INSTALLED =
  "cds compile not run: SAP's CDS compiler (@sap/cds-compiler, SAP Developer License) is not installed on this server — it is not part of Clean-Core.io's production build. Run `npm run compile` in the package.";

const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');

/** Compile every `.cds` file of a package. Never throws. */
export function cdsCompileCandidate(files: ReadonlyArray<{ path: string; content: string }>): CdsCompileResult {
  const cds = files.filter((f) => /\.cds$/i.test(f.path) && !norm(f.path).startsWith('node_modules/'));
  if (cds.length === 0) return { ran: false, reason: 'cds compile not run: the package has no .cds file.' };
  const compiler = load();
  if (!compiler) return { ran: false, reason: `${CDS_COMPILER_NOT_INSTALLED} (${loadError.slice(0, 160)})` };
  const sources: Record<string, string> = {};
  for (const f of cds) sources[norm(f.path)] = f.content;
  const messages: CdsMessage[] = [];
  let services: string[] = [];
  try {
    const csn = compiler.compileSources(sources, { messages });
    const odata = compiler.for.odata(csn, { messages });
    services = Object.keys(compiler.to.edmx.all(odata, { messages, odataVersion: 'v4' }));
  } catch {
    // A CompilationError carries its findings in `messages`; nothing else to read from it.
  }
  const relevant = messages.filter((m) => m.severity === 'Error' || m.severity === 'Warning');
  const findings: CdsFinding[] = relevant.slice(0, CDS_FINDINGS_MAX).map((m) => ({
    path: m.$location?.file ? norm(m.$location.file) : '(model)',
    line: m.$location?.line ?? 0,
    severity: m.severity === 'Error' ? 'Error' : 'Warning',
    id: (m.messageId ?? '').slice(0, 60),
    message: String(m.message).replace(/\s+/g, ' ').slice(0, 400),
  }));
  let version = 'unknown';
  try {
    version = compiler.version();
  } catch {
    // keep 'unknown'
  }
  return {
    ran: true,
    compiler: version,
    files: cds.length,
    errors: relevant.filter((m) => m.severity === 'Error').length,
    warnings: relevant.filter((m) => m.severity === 'Warning').length,
    services,
    findings,
  };
}
