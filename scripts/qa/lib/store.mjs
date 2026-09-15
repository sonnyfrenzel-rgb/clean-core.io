import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { open, seal } from './crypto.mjs';

/**
 * Everything the loop keeps between runs, and how it is kept: sealed. Nothing
 * here is ever written in plaintext to the repository.
 */

/** Refuted findings, committed sealed — a refuted report still describes how someone thought the code could break. */
export const REFUTED_PATH = 'docs/qa/refuted-findings.enc.json';

/** Local-only working directory for downloaded and decrypted reports. Ignored by git. */
export const LOCAL_DIR = '.qa-review';

export function loadDotEnv(path = '.env.local') {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, '')];
      }),
  );
}

export function loadRefuted(secret, path = REFUTED_PATH) {
  if (!existsSync(path)) return [];
  return open(JSON.parse(readFileSync(path, 'utf8')), secret).findings || [];
}

export function saveRefuted(findings, secret, path = REFUTED_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(seal({ version: 1, findings }, secret))}\n`);
}

/** Every sealed report below `dir`, decrypted, newest first. A report under a rotated key is skipped, not fatal. */
export function sealedReports(dir, secret, fileName = 'qa-review.enc.json') {
  if (!existsSync(dir)) return [];
  const found = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === fileName) found.push(p);
    }
  };
  walk(dir);
  return found
    .map((p) => {
      try {
        return open(JSON.parse(readFileSync(p, 'utf8')), secret);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
