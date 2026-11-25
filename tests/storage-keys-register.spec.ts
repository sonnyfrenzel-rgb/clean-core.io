import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { STORAGE_CLEANUPS, STORAGE_KEYS, policyName, type StorageKeyEntry } from '../lib/storage-keys';
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

/** A clean-up (`STORAGE_CLEANUPS`): a key the app only removes, once, and no longer stores. */
const cleanup = (key: string, match: 'exact' | 'prefix') => STORAGE_CLEANUPS.find((e) => e.key === key && e.match === match);

/**
 * The storage keys a privacy text names in section 7 ("Cookies & Tracking"), as written there — `cc.auth.signedIn`,
 * or a family as `cc.analyze.walked.…`. Read from section 7 only: the change note at the top of a version names keys
 * the version stopped naming.
 */
function keysNamedInSection7(text: string): string[] {
  const start = text.search(/^## 7\. /m);
  const end = text.search(/^## 8\. /m);
  expect(start, 'section 7 not found').toBeGreaterThan(-1);
  expect(end, 'section 8 not found').toBeGreaterThan(start);
  const section = text.slice(start, end);
  const found = section.match(/(?<![\w.:-])(?:cc|cleancore)[._:-][\w.:-]*…?/g) ?? [];
  return [...new Set(found.map((k) => (k.endsWith('…') ? k : k.replace(/[.:]+$/, ''))))];
}

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
    for (const f of ['lib/auth-hint.ts', 'components/workspace/BusinessRulesEditor.tsx', 'lib/stale-build.ts']) {
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
        const removedOnly = cleanup(k.key, k.match);
        if (!entry && removedOnly && s.method === 'removeItem') {
          const area = areaOf(s.receiver);
          if (area && area !== removedOnly.area) missing.push(`${where(s)} ${removedOnly.key} is removed from ${area} storage, registered as ${removedOnly.area}`);
          continue;
        }
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

  test('a clean-up is only removed, never stored, and something still removes it', () => {
    const stored = sites.filter((s) => s.method === 'setItem').flatMap((s) => s.keys.filter((k) => cleanup(k.key, k.match)).map((k) => `${where(s)} ${k.key}`));
    expect(stored, 'a key on STORAGE_CLEANUPS is written again — register it as an entry instead').toEqual([]);
    const removed = new Set(sites.filter((s) => s.method === 'removeItem').flatMap((s) => s.keys.map((k) => `${k.match}:${k.key}`)));
    const unused = STORAGE_CLEANUPS.filter((e) => !removed.has(`${e.match}:${e.key}`)).map((e) => e.key);
    expect(unused, 'a clean-up nothing removes — remove the code first, then the entry').toEqual([]);
    // Statement 22c, 1: the leftover of the old workspace page is removed once, at a signed-in visit.
    expect(STORAGE_CLEANUPS.map((e) => e.key)).toContain('cc.workspace.coachMarks.dismissed');
    const firebase = fs.readFileSync(path.join(ROOT, 'lib/firebase-app.ts'), 'utf8');
    expect(firebase).toContain('if (user) removeRetiredStorageEntries();');
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

  // The other direction (legal review, document 22, question 1; statement 22c, 1 (6)): section 7 fell behind the code
  // the other way too — it kept naming two keys nothing wrote any more, because the check ran register → text only.
  test('every key section 7 names is in the register as a named entry, in both languages', () => {
    const asNamed = new Set(STORAGE_KEYS.filter((e) => e.namedInPolicy).map(policyName));
    for (const [lang, text] of [['en', PRIVACY_EN], ['de', PRIVACY_DE]] as const) {
      const named = keysNamedInSection7(text);
      expect(named.length, `${lang}: the reading of section 7 found nothing (not vacuous)`).toBeGreaterThan(15);
      const orphans = named.filter((k) => !asNamed.has(k));
      expect(orphans, `${lang}: section 7 names keys the register does not carry as named — nothing writes them, or the register misses them`).toEqual([]);
    }
  });

  test('a clean-up is not named in section 7 (statement 22c, 1: a clean-up, not a named entry)', () => {
    for (const [lang, text] of [['en', PRIVACY_EN], ['de', PRIVACY_DE]] as const) {
      const named = keysNamedInSection7(text);
      for (const e of STORAGE_CLEANUPS) expect(named, `${lang}: ${policyName(e)}`).not.toContain(policyName(e));
    }
  });

  test('the reading of section 7 finds keys in their written forms', () => {
    const sample = [
      '## 7. Cookies {#cookies}',
      'a (cc.workspace.lens), b (cc.analyze.walked.…), c (cc:rules-draft:…), d (cc_chunk_reload_at), e (cleancore.demo.v1; more), f cc-fr-derived-….',
      'Not a key: clean-core.io, success, acc.x.',
      '## 8. Next',
      'g (cc.outside.section)',
    ].join('\n');
    expect(keysNamedInSection7(sample).sort()).toEqual(
      ['cc-fr-derived-…', 'cc.analyze.walked.…', 'cc.workspace.lens', 'cc:rules-draft:…', 'cc_chunk_reload_at', 'cleancore.demo.v1'].sort(),
    );
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
