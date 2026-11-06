import type { ProcessNamingRecord } from '../process-naming';
import type { CustomerTexts } from '../abap/customer-texts';

/**
 * The options that make a reading (a subset of `BpmnExportOptions`, kept here so this module imports nothing at run
 * time — the one import is a type and is erased).
 */
export interface ReadingOptions {
  processName: string;
  sourceFileName: string;
  exporterVersion?: string;
  /** The project's stored business names, for a download (3.0.21, `BpmnExportOptions.naming`). The map passes none. */
  naming?: ProcessNamingRecord | null;
  /** 3.5.0 (H5b): the project's customer texts (`BpmnExportOptions.customerTexts`). */
  customerTexts?: CustomerTexts | null;
}

/**
 * What makes two readings the same reading. `buildReadingExports`' own cache
 * and the main thread's client of the reading worker
 * (`reading-exports-client.ts`) key by this one function, so the map, the
 * process summary and the download share one computation (owner, 12.10.2026:
 * the CO project froze the Documentation tool).
 *
 * Its own module, without imports, so the client can key a request without
 * loading the BPMN writer onto the page it is there to keep responsive.
 */
export function readingExportsKey(source: string, options: ReadingOptions): string {
  const base = [options.processName, options.sourceFileName ?? null, options.exporterVersion ?? null, source];
  // A naming changes the plain file; without one the key is what it was.
  const naming = options.naming;
  // Customer texts change the plain file too; without them the key is what it was.
  if (options.customerTexts) base.push(JSON.stringify(options.customerTexts));
  if (!naming) return JSON.stringify(base);
  return JSON.stringify([...base, [naming.digest, naming.namedAt, naming.origin?.textSha256 ?? null, naming.origin?.provider ?? null, naming.origin?.modelId ?? null]]);
}
