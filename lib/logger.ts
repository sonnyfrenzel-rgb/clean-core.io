/**
 * Structured JSON logger for API routes (v1.25 §3 — operational visibility).
 *
 * Emits one JSON object per line to stdout/stderr. Cloud Run / Cloud Logging
 * parse the `severity` field and promote the rest to the log entry's jsonPayload,
 * which makes error-rate alert policies and log-based metrics possible. Kept
 * dependency-free (no pino worker threads) so it is safe in the serverless
 * bundle. Never logs secrets or request bodies — pass only ids and metadata.
 */
type Severity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

function emit(severity: Severity, message: string, fields: Record<string, unknown> = {}): void {
  try {
    const entry = { severity, message, service: 'clean-core', time: new Date().toISOString(), ...fields };
    const line = JSON.stringify(entry);
    if (severity === 'ERROR' || severity === 'CRITICAL') console.error(line);
    else if (severity === 'WARNING') console.warn(line);
    else console.log(line);
  } catch {
    /* logging must never throw */
  }
}

export const logger = {
  info: (message: string, fields?: Record<string, unknown>) => emit('INFO', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit('WARNING', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit('ERROR', message, fields),
  critical: (message: string, fields?: Record<string, unknown>) => emit('CRITICAL', message, fields),
};

/** Reduce an unknown thrown value to a safe message string (no stack leakage to clients). */
export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
