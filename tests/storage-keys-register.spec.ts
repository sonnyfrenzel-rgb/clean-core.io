import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { STORAGE_KEYS, policyName, type StorageKeyEntry } from '../lib/storage-keys';
import { PRIVACY_DE } from '../lib/legal/texts/privacy.de';
import { PRIVACY_EN } from '../lib/legal/texts/privacy.en';
import { SCANNED_DIRS, SourceTree, scanWrites, type WriteSite } from './helpers/storage-key-scan';

/**
 * Every key the app writes to `localStorage` or `sessionStorage` is in the register (`lib/storage-keys.ts`), with
 * its purpose and lifetime, and the register says truthfully whether privacy policy section 7 names it.
 *
 * Release 3.2.0, privacy review: the key list in section 7 fell behind the code twice, and the review asked for a
 * test that holds code and list together, as `tests/legal-names-wording.spec.ts` does for the names. The scanner
 * (`tests/helpers/storage-key-scan.ts`) reads every `setItem` / `removeItem` call in `app/`, `components/`, `hooks/`
 * and `lib/` and follows its key through literals, templates, constants, imports, key functions, object properties
 * and parameters (through every caller). A key it cannot follow fails here rather than passing unchecked.
 * Server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const where = (s: WriteSite) => `${s.file}:${s.line}`;

const sites = scanWrites(ROOT);

const registered = (key: string, match: 'exact' | 'prefix'): StorageKeyEntry | undefined =>
  STORAGE_KEYS.find((e) => e.key === key && e.match === match);

/** What the receiver says about the area, where it says anything (`store.setItem` says nothing). */
function areaOf(receiver: string): 'local' | 'session' | null {
  if (/localStorage|\blocal\(\)/.test(receiver)) return 'local';
  if (/sessionStorage|\bsession\(\)/.test(receiver)) return 'session';
  return null;
}

test.describe('the code writes only registered keys', () => {
  test('the scan finds the writes it should (not vacuous)', () => {
    expect(sites.length).toBeGreaterThan(20);
    const files = new Set(sites.map((s) => s.file));
    for (const f of ['lib/coach-marks.ts', 'lib/auth-hint.ts', 'components/workspace/BusinessRulesEditor.tsx', 'lib/stale-build.ts']) {
      expect(files.has(f), `${f} writes storage and the scan did not find it`).toBe(true);
    }
  });

  test('every key a write names can be followed to its value', () => {
    const lost = sites.filter((s) => s.unresolved).map((s) => `${where(s)} ${s.method}(${s.expression}): ${s.unresolved}`);
    expect(lost, 'a storage key the scan cannot follow — name it with a constant or a key function it can read').toEqual([]);
  });

  test('every key written is in lib/storage-keys.ts, in the area it is written to', () => {
    const missing: string[] = [];
    for (const s of sites) {
      for (const k of s.keys) {
        const entry = registered(k.key, k.match);
        if (!entry) {
          missing.push(`${where(s)} ${k.match === 'prefix' ? `${k.key}…` : k.key}`);
          continue;
        }
        const area = areaOf(s.receiver);
        if (area && area !== entry.area) missing.push(`${where(s)} ${entry.key} is written to ${area} storage, registered as ${entry.area}`);
      }
    }
    expect(missing, 'register these keys in lib/storage-keys.ts (purpose, lifetime, whether section 7 names them)').toEqual([]);
  });

  test('every registered key is still written somewhere', () => {
    const written = new Set(sites.flatMap((s) => s.keys.map((k) => `${k.match}:${k.key}`)));
    const stale = STORAGE_KEYS.filter((e) => !written.has(`${e.match}:${e.key}`)).map((e) => e.key);
    expect(stale, 'registered, but nothing writes it any more — remove it from the register (and section 7)').toEqual([]);
  });

  test('storage is written only through setItem and removeItem', () => {
    const tree = new SourceTree(ROOT);
    const other: string[] = [];
    for (const file of tree.files()) {
      const src = tree.read(file);
      src.split('\n').forEach((line, i) => {
        const code = line.trim();
        if (code.startsWith('*') || code.startsWith('//')) return;
        if (/(localStorage|sessionStorage)\s*\[|(localStorage|sessionStorage)\.(?!setItem|removeItem|getItem|clear|key|length)[A-Za-z_$][\w$]*\s*=(?!=)|Storage\.prototype/.test(code)) {
          other.push(`${file}:${i + 1}`);
        }
      });
    }
    expect(other, 'a storage write the scan does not read').toEqual([]);
    expect([...SCANNED_DIRS]).toEqual(['app', 'components', 'hooks', 'lib']);
  });
});

test.describe('the register', () => {
  test('one entry per key, each with its purpose and lifetime', () => {
    const ids = STORAGE_KEYS.map((e) => `${e.area}:${e.match}:${e.key}`);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of STORAGE_KEYS) {
      expect(e.key.trim(), 'empty key').not.toBe('');
      for (const field of ['holds', 'purpose', 'lifetime'] as const) {
        expect(e[field].trim().length, `${e.key}: ${field} is empty`).toBeGreaterThan(2);
      }
    }
  });

  test('"namedInPolicy" is what privacy policy section 7 says, in both languages', () => {
    const names = (text: string, entry: StorageKeyEntry) =>
      new RegExp(`(?:^|[\\s(,])${policyName(entry).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[),;\\s])`).test(text);
    const wrong: string[] = [];
    for (const e of STORAGE_KEYS) {
      for (const [lang, text] of [['en', PRIVACY_EN], ['de', PRIVACY_DE]] as const) {
        if (names(text, e) !== e.namedInPolicy) {
          wrong.push(`${lang}: ${policyName(e)} is ${e.namedInPolicy ? 'registered as named but missing from' : 'named in, but registered as not named in'} section 7`);
        }
      }
    }
    expect(wrong, 'set namedInPolicy to what the current privacy policy says').toEqual([]);
  });
});

test.describe('the scanner itself', () => {
  /** A tiny tree with one key behind each kind of indirection, and one it must not pretend to read. */
  function fixture(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-key-scan-'));
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), body);
    }
    return dir;
  }

  test('follows constants, imports, key functions, object properties and parameters through their callers', () => {
    const dir = fixture({
      'lib/keys.ts': [
        "export const PREFIX = 'fx.prefix.';",
        'export function leaseKey(id: string): string {',
        '  return `fx-lease-${id}`;',
        '}',
        'export function keysOf(id: string): { a: string; b: string } {',
        '  return { a: `${PREFIX}${id}`, b: `fx.b.${id}` };',
        '}',
      ].join('\n'),
      'lib/store.ts': [
        "import { leaseKey, keysOf } from '@/lib/keys';",
        'function put(store: Storage, key: string, value: string) {',
        '  store.setItem(key, value);',
        '}',
        'export function writeAll(id: string) {',
        "  put(window.localStorage, leaseKey(id), '1');",
        '  const k = keysOf(id).b;',
        "  put(window.localStorage, k, '1');",
        "  window.sessionStorage.setItem(keysOf(id).a, '1');",
        "  const pick = id ? 'fx.one' : null;",
        "  if (pick) window.localStorage.removeItem(pick);",
        '}',
      ].join('\n'),
    });
    try {
      const found = scanWrites(dir);
      expect(found.filter((s) => s.unresolved)).toEqual([]);
      const keys = found.flatMap((s) => s.keys.map((k) => `${k.key}${k.match === 'prefix' ? '…' : ''}`)).sort();
      expect(keys).toEqual(['fx-lease-…', 'fx.b.…', 'fx.one', 'fx.prefix.…']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a key it cannot follow is reported, not skipped', () => {
    const dir = fixture({
      'components/Thing.tsx': "export function save(data: Record<string, string>) {\n  window.localStorage.setItem(data.name, '1');\n}\n",
    });
    try {
      const [site] = scanWrites(dir);
      expect(site.unresolved).not.toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
