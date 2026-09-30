/**
 * File-system half of the design source guard: which files it reads and what
 * each of them counts. The rules are pure and live in `design-rules.ts`; this
 * file only walks the disk. No network.
 *
 * Until D.30 it also read and wrote the per-group ceilings in
 * `tests/design-baseline/`; the lists reached zero and went with D.30.
 */
import fs from 'fs';
import path from 'path';
import { countHits, isUiFile, scanFile, STANDALONE_EXPORT_FILES, type RuleCounts } from './design-rules';

export const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Every UI file under `app/` and `components/`, plus the standalone exports, repo-relative with forward slashes. */
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
  // The standalone exports under lib/ (D.28), named one by one in design-rules.
  for (const rel of STANDALONE_EXPORT_FILES) if (fs.existsSync(path.join(root, rel))) out.push(rel);
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
