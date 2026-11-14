/**
 * Guards shared by the paid benchmark runners (`stage-bench.ts`, `weg-b-model.ts`). Pure, no model, no network.
 *
 * - `benchSourcePath`: an id from an `--ids` file names a benchmark case folder or a starter example file, and
 *   nothing else — no path separator, no `..`, only the shapes the runners know.
 * - `SpendGate`: the spend cap counts the calls in flight too. Each call reserves its worst-case cost before it is
 *   sent and gives the reservation back once its real cost is in the ledger, so parallel workers cannot all pass
 *   the cap on the same ledger total.
 * - `holdLedger`: one runner process per ledger. The reservations live in one process, so a second runner on the
 *   same ledger would read the same total and pass the cap beside the first; it is refused before its first call.
 */
import { closeSync, openSync, unlinkSync, writeSync } from 'fs';
import { isAbsolute, join, relative, resolve } from 'path';

const CASE_ID = /^BM-\d{3}$/;
const STARTER_FILE = /^[A-Za-z0-9_]+\.(?:abap|txt)$/;

/** The path an id names under its root, or an error for an id outside the known shapes. */
export function benchSourcePath(id: string, roots: { cases: string; starters: string }): { kind: 'case' | 'starter'; path: string } {
  const starter = id.startsWith('starter:');
  const name = starter ? id.slice('starter:'.length) : id;
  if (!(starter ? STARTER_FILE : CASE_ID).test(name)) {
    throw new Error(`not a benchmark id: ${JSON.stringify(id)} (a case is BM-123, a starter is starter:<NAME>.abap|.txt)`);
  }
  const root = resolve(starter ? roots.starters : roots.cases);
  const path = resolve(join(root, name));
  const rel = relative(root, path);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`benchmark id leaves its folder: ${JSON.stringify(id)}`);
  return { kind: starter ? 'starter' : 'case', path };
}

/** The most a call can cost: every prompt character a token (an over-count) and the full output allowance. */
export function worstCaseCostUsd(promptChars: number, maxOutputTokens: number, [inPerM, outPerM]: readonly [number, number]): number {
  return (promptChars * inPerM + maxOutputTokens * outPerM) / 1e6;
}

/**
 * Takes the ledger for this process: creates `<ledger>.lock` exclusively and removes it when the process exits.
 * Throws when another runner holds it. Returns the release (for tests; a runner keeps it until it exits).
 */
export function holdLedger(ledger: string): () => void {
  const lock = `${ledger}.lock`;
  let fd: number;
  try {
    fd = openSync(lock, 'wx');
  } catch {
    throw new Error(`another runner holds the ledger ${ledger} (${lock}); delete the lock only if no run is going`);
  }
  writeSync(fd, String(process.pid));
  closeSync(fd);
  let held = true;
  const release = () => {
    if (!held) return;
    held = false;
    process.off('exit', release);
    try {
      unlinkSync(lock);
    } catch {
      // Already gone.
    }
  };
  process.on('exit', release);
  return release;
}

export class SpendGate {
  private reserved = 0;

  constructor(private readonly capUsd: number, private readonly spent: () => number) {}

  /** Reserves `estimateUsd` when the ledger plus the calls in flight plus this call stay within the cap. */
  tryReserve(estimateUsd: number): boolean {
    if (!(this.capUsd > 0)) return true;
    if (this.spent() + this.reserved + estimateUsd > this.capUsd) return false;
    this.reserved += estimateUsd;
    return true;
  }

  /** Gives a reservation back — after the call's real cost is in the ledger, or when the call failed. */
  release(estimateUsd: number): void {
    if (!(this.capUsd > 0)) return;
    this.reserved = Math.max(0, this.reserved - estimateUsd);
  }

  get inFlightUsd(): number {
    return this.reserved;
  }
}
