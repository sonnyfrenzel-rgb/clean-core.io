/** The options that make a reading (a subset of `BpmnExportOptions`, kept here so this module imports nothing). */
export interface ReadingOptions {
  processName: string;
  sourceFileName: string;
  exporterVersion?: string;
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
  return JSON.stringify([options.processName, options.sourceFileName ?? null, options.exporterVersion ?? null, source]);
}
