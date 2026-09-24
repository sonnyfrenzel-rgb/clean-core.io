/**
 * File-system half of the design source guard: which files exist, what they
 * count, and what the per-group ceilings in `tests/design-baseline/` say.
 * Shared by `tests/design-source-guard.spec.ts` and `scripts/design/baseline.ts`
 * so both read the same files the same way. No network.
 */
import fs from 'fs';
import path from 'path';
import { countHits, isUiFile, scanFile, type BaselineEntry, type BaselineFile, type RuleCounts } from './design-rules';

export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const BASELINE_DIR = path.join(REPO_ROOT, 'tests', 'design-baseline');

/** Every UI file under `app/` and `components/`, repo-relative with forward slashes. */
export function listUiFiles(root = REPO_ROOT): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules') continue;
        walk(full);
        continue;
      }
      const rel = path.relative(root, full).replace(/\\/g, '/');
      if (isUiFile(rel)) out.push(rel);
    }
  };
  walk(path.join(root, 'app'));
  walk(path.join(root, 'components'));
  return out.sort();
}

/** Counts per UI file, zero-count files included. */
export function measureAll(root = REPO_ROOT): Map<string, RuleCounts> {
  const out = new Map<string, RuleCounts>();
  for (const rel of listUiFiles(root)) {
    out.set(rel, countHits(scanFile(rel, fs.readFileSync(path.join(root, rel), 'utf8'))));
  }
  return out;
}

export function readBaselineFiles(): { fileName: string; data: BaselineFile }[] {
  if (!fs.existsSync(BASELINE_DIR)) return [];
  return fs
    .readdirSync(BASELINE_DIR)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((fileName) => ({ fileName, data: JSON.parse(fs.readFileSync(path.join(BASELINE_DIR, fileName), 'utf8')) as BaselineFile }));
}

/** Every entry of every group file. A file listed twice is reported by the spec. */
export function mergedBaseline(): Map<string, { group: string; entry: BaselineEntry }> {
  const out = new Map<string, { group: string; entry: BaselineEntry }>();
  for (const { data } of readBaselineFiles()) {
    for (const [rel, entry] of Object.entries(data.files ?? {})) out.set(rel, { group: data.group, entry });
  }
  return out;
}

export const BASELINE_COMMENT =
  'Ceilings of tests/design-source-guard.spec.ts for this group: per file and rule, the count may not rise, ' +
  'and when it falls the ceiling must fall in the same commit. Lower with `npm run design:baseline -- --group <group>`; ' +
  'never raise by hand. Rules: tests/helpers/design-rules.ts. Plan: Block D, luecken-und-plan.md §4.';

export function writeBaselineFile(data: BaselineFile): void {
  fs.mkdirSync(BASELINE_DIR, { recursive: true });
  const files: Record<string, BaselineEntry> = {};
  for (const rel of Object.keys(data.files).sort()) files[rel] = data.files[rel];
  const body = { $comment: BASELINE_COMMENT, group: data.group, files };
  fs.writeFileSync(path.join(BASELINE_DIR, `${data.group}.json`), JSON.stringify(body, null, 2) + '\n', 'utf8');
}
