import { posix } from 'node:path';
import { AREAS } from './config.mjs';

/**
 * Which part of the product a file belongs to, seen from the user: a page
 * belongs to its journey; a component belongs to the one journey whose pages
 * render it, or to the design system when several do. Deterministic, from the
 * import graph — no model decides what a reviewer gets to see together.
 */

const IMPORT = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveImport(from, spec, known) {
  let base;
  if (spec.startsWith('@/')) base = spec.slice(2);
  else if (spec.startsWith('.')) base = posix.normalize(posix.join(posix.dirname(from), spec));
  else return null;
  for (const candidate of [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) if (known.has(candidate)) return candidate;
  return null;
}

/** @param files [{ path, text }] — the UX files at one commit */
export function importGraph(files) {
  const known = new Set(files.map((f) => f.path));
  const graph = new Map();
  for (const { path, text } of files) {
    const targets = new Set();
    for (const m of text.matchAll(IMPORT)) {
      const target = resolveImport(path, m[1] || m[2], known);
      if (target && target !== path) targets.add(target);
    }
    graph.set(path, targets);
  }
  return graph;
}

export const pageArea = (path) => AREAS.find((a) => a.pages.some((re) => re.test(path)))?.id || null;

/** path → area id, for every file. */
export function assignAreas(files) {
  const graph = importGraph(files);
  const reachedBy = new Map();
  for (const { path } of files) {
    const area = pageArea(path);
    if (!area || area === 'system') continue;
    const seen = new Set([path]);
    const queue = [path];
    while (queue.length) {
      for (const next of graph.get(queue.shift()) || []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
        if (!reachedBy.has(next)) reachedBy.set(next, new Set());
        reachedBy.get(next).add(area);
      }
    }
  }
  const out = new Map();
  for (const { path } of files) {
    const own = pageArea(path);
    if (own) out.set(path, own);
    else {
      const areas = reachedBy.get(path);
      out.set(path, areas && areas.size === 1 ? [...areas][0] : 'system');
    }
  }
  return out;
}

/** Source with line numbers, so a finding can cite a line that exists. */
export function numbered(path, text) {
  const lines = text.split('\n');
  return `=== FILE ${path} (${lines.length} lines) ===\n${lines.map((l, i) => `${i + 1}|${l}`).join('\n')}\n`;
}

/**
 * Batches for the full audit: area by area, pages before components. An area
 * that does not fit is split into balanced parts — up to 10 % over the limit
 * rather than a tail of two files that costs a call of its own. Files are never
 * cut.
 */
export function packAreas(files, assignment, maxChars) {
  const batches = [];
  for (const area of AREAS) {
    const own = files
      .filter((f) => assignment.get(f.path) === area.id)
      .sort((a, b) => Number(!pageArea(a.path)) - Number(!pageArea(b.path)) || a.path.localeCompare(b.path))
      .map((f) => ({ path: f.path, block: numbered(f.path, f.text) }));
    const total = own.reduce((n, f) => n + f.block.length, 0);
    const parts = Math.max(1, Math.ceil(total / (maxChars * 1.1)));
    const target = total / parts;
    let current = null;
    let made = 0;
    for (const { path, block } of own) {
      if (!current || (made < parts && current.chars + block.length > target * 1.1 && current.files.length)) {
        made++;
        current = { area: area.id, title: area.title, screens: area.screens, files: [], blocks: [], chars: 0 };
        batches.push(current);
      }
      current.files.push(path);
      current.blocks.push(block);
      current.chars += block.length;
    }
  }
  // Parts of the same area are numbered so the reviewer knows it sees a slice.
  for (const area of AREAS) {
    const parts = batches.filter((b) => b.area === area.id);
    parts.forEach((b, i) => (b.part = parts.length > 1 ? `${i + 1}/${parts.length}` : null));
  }
  return batches;
}
