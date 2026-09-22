import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Five findings of the b88c77b review that live in the interface and in the
 * public pages.
 *
 * Four of them share a shape: something the product says is not what the
 * product does. A trust page promises a hashing scheme that was deleted a week
 * earlier. An export button reports nothing when it fails. A project document
 * grows a field nobody reads until no write to it succeeds at all. The fifth,
 * the token in the unsubscribe query, is the same idea one layer down: a secret
 * written where its owner cannot see it and a log can.
 *
 * Source-level guards, because the change in each case *is* a property of the
 * source — and where a decision can be run on its own, it is run: the worksheet
 * name repair and the unsubscribe token reader are lifted out of the files and
 * executed here, so this measures behaviour and not the presence of a word.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/** The file with its comments removed — every one of them names the old bug. */
const rendered = (rel: string) =>
  read(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/**
 * Lift a function body out of a source file and run it.
 *
 * The same device as `tests/runner-egress-guard.spec.ts`: the point is to
 * measure the shipped decision rather than to recognise a string near it. Only
 * bodies free of type annotations can be lifted, which is why both functions
 * below keep their types in the signature.
 */
function bodyOf(source: string, header: RegExp): string {
  const match = source.match(header);
  expect(match, `the function this guard measures was not found: ${header}`).not.toBeNull();
  const start = source.indexOf('{', match!.index! + match![0].length - 1);
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start + 1, i);
    }
  }
  throw new Error(`unbalanced braces after ${header}`);
}

/* ------------------------------------------------------------------ */
/* 1 — a security promise that was not true                            */
/* ------------------------------------------------------------------ */

test.describe('the trust page promises only what the code does', () => {
  /**
   * `/trust` said "MFA backup codes are hashed (scrypt + server pepper)".
   * Roadmap 0.13 (16.09.2026) moved the second factor to Firebase's own TOTP
   * and deleted the codes, the pepper and `lib/mfa.ts` with them — so the
   * sentence described a mechanism that exists nowhere, on the one page whose
   * whole argument is that its claims can be checked. `SECURITY.md` §3.5,
   * `app/(app)/settings/page.tsx` and `scripts/mfa-reset.ts` had said the
   * opposite since that day.
   */
  test('nothing in the product hashes a backup code', () => {
    expect(fs.existsSync(path.resolve(ROOT, 'lib/mfa.ts')), 'the module the claim named').toBe(false);
    // The claim also named a secret. Nothing under `lib/` or `app/` reads it.
    const readers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.resolve(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(entry.name) && read(rel).includes('MFA_BACKUP_CODE_PEPPER')) readers.push(rel);
      }
    };
    walk('lib');
    walk('app');
    expect(readers, 'a backup-code pepper is read somewhere after all — verify before deleting the claim').toEqual([]);
  });

  test('the public page states the retirement instead of the retired scheme', () => {
    const page = rendered('app/(app)/trust/page.tsx');
    expect(page, 'the hashing promise is back').not.toMatch(/backup codes?[^.]{0,60}hashed/i);
    expect(page, 'scrypt is claimed again').not.toMatch(/scrypt/i);
    // Deleting the line would have left the reader who came for the codes with
    // nothing, so the replacement has to say what actually holds.
    expect(page).toMatch(/There are no backup codes/i);
    expect(page).toMatch(/Firebase Authentication/);
  });

  test('the architecture note carries the same answer', () => {
    const doc = read('docs/ARCHITECTURE.md');
    expect(doc, 'the doc still claims peppered backup codes').not.toMatch(
      /backup codes hashed with `MFA_BACKUP_CODE_PEPPER`/,
    );
    expect(doc).toMatch(/There are no MFA backup codes/);
    // §5 "Required secrets" listed a variable no file reads.
    const required = doc.slice(doc.indexOf('Required secrets:'));
    expect(required.slice(0, required.indexOf('\n'))).not.toContain('MFA_BACKUP_CODE_PEPPER');
  });
});

/* ------------------------------------------------------------------ */
/* 2 — a second decode of an already decoded parameter                 */
/* ------------------------------------------------------------------ */

test.describe('a broken survey link reaches the page written for it', () => {
  /**
   * Next.js hands a dynamic segment over decoded. The page decoded it again,
   * so `/survey/%25` arrived as `%`, the second decode threw `URIError`, and
   * the visitor landed in the error boundary instead of on "this link is no
   * longer valid" — the polite page that exists for exactly this visitor.
   */
  test('the throw the old code depended on is real', () => {
    expect(() => decodeURIComponent('%')).toThrow(URIError);
  });

  test('the page passes the segment on as it arrives', () => {
    const page = rendered('app/survey/[token]/page.tsx');
    expect(page, 'the double decode is back').not.toContain('decodeURIComponent');
    expect(page).toContain('verifySurveyToken(token');
    expect(page).toMatch(/token=\{token \|\| ''\}/);
  });
});

/* ------------------------------------------------------------------ */
/* 3 — the unsubscribe token in the query of a POST                    */
/* ------------------------------------------------------------------ */

test.describe('the unsubscribe token is not written into the history and the logs', () => {
  const ROUTE = 'app/api/unsubscribe/route.ts';

  test('our own page sends it in the body', () => {
    const client = rendered('app/unsubscribe/UnsubscribeClient.tsx');
    expect(client, 'the token is back in the query of the POST').not.toMatch(/fetch\(\s*`?\/api\/unsubscribe\?/);
    expect(client).toContain("fetch('/api/unsubscribe'");
    expect(client).toContain('JSON.stringify({ t: token })');
    // The GET link is a mail link and keeps its token in the URL; the page
    // still receives it from `searchParams`.
    expect(rendered('app/unsubscribe/page.tsx')).toContain('token={t || \'\'}');
  });

  test('a one-click provider with no body still unsubscribes', async () => {
    // RFC 8058 providers POST to the URL out of `List-Unsubscribe` and send no
    // body at all. Dropping the query would have broken every one of them, so
    // the reader is run against all four callers.
    const source = read(ROUTE);
    const inBody = new Function('body', bodyOf(source, /function tokenInBody\(/)) as (b: unknown) => string;
    const from = new Function(
      'req',
      'tokenInBody',
      `return (async () => {${bodyOf(source, /async function tokenFrom\(/)}})();`,
    ) as (req: unknown, f: (b: unknown) => string) => Promise<string>;

    const req = (body: unknown, query: string) => ({
      json: async () => {
        if (body === undefined) throw new SyntaxError('Unexpected end of JSON input');
        return body;
      },
      nextUrl: { searchParams: new URLSearchParams(query) },
    });

    expect(inBody({ t: 'in-body' })).toBe('in-body');
    expect(inBody(null), 'null is not an object to read from').toBe('');
    expect(inBody({ t: 42 }), 'a number is not a token').toBe('');

    expect(await from(req({ t: 'in-body' }, ''), inBody), 'our page').toBe('in-body');
    expect(await from(req(undefined, 't=in-query'), inBody), 'one-click, no body').toBe('in-query');
    expect(await from(req({}, 't=in-query'), inBody), 'a body without a token').toBe('in-query');
    expect(await from(req(undefined, ''), inBody), 'neither').toBe('');
  });
});

/* ------------------------------------------------------------------ */
/* 4 — an export that failed in silence                                */
/* ------------------------------------------------------------------ */

test.describe('the Excel export survives the ids a model writes', () => {
  const PAGE = 'app/(app)/project/[projectId]/testing/page.tsx';

  /** The shipped repair, lifted out of the page and run. */
  const sheetName = new Function(
    'raw',
    'fallback',
    'taken',
    bodyOf(read(PAGE), /const excelSheetName = \(/),
  ) as (raw: string, fallback: string, taken: Set<string>) => string;

  test('every name ExcelJS throws on is repaired', () => {
    // `* ? : / \ [ ]` — the set Excel forbids, and a test case id like
    // `FI/AP-01` or `MM:REQ[2]` is an ordinary thing for a model to write.
    const taken = new Set<string>();
    const repaired = sheetName('FI/AP*01:x?[2]\\y', 'TC_1', taken);
    expect(repaired).not.toMatch(/[*?:/\\[\]]/);
    expect(repaired, 'the id should still be recognisable').toContain('FI-AP-01');

    // An empty id and the reserved name `History` both take the fallback.
    expect(sheetName('', 'TC_7', new Set())).toBe('TC_7');
    expect(sheetName('   ', 'TC_7', new Set())).toBe('TC_7');
    expect(sheetName('History', 'TC_7', new Set())).toBe('TC_7');
    expect(sheetName('history', 'TC_7', new Set())).toBe('TC_7');
    // An id that is nothing but forbidden characters still has to become a
    // name: `[]` collapses to `--`, which is legal, but `'''` does not.
    expect(sheetName("'''", 'TC_7', new Set())).toBe('TC_7');

    // ExcelJS refuses a name whose first or last character is a single quote,
    // and the 31-character cut is what can produce one out of a name that had
    // none at that end.
    for (const raw of ["'quoted'", `${'A'.repeat(30)}'tail`, `'${'B'.repeat(40)}`]) {
      const name = sheetName(raw, 'TC_9', new Set());
      expect(name, raw).not.toMatch(/(^')|('$)/);
      expect(name.length).toBeLessThanOrEqual(31);
    }
  });

  test('two test cases with one id get two sheets', () => {
    const taken = new Set<string>();
    const first = sheetName('TC-01', 'TC_1', taken);
    const second = sheetName('TC-01', 'TC_2', taken);
    const third = sheetName('tc-01', 'TC_3', taken);
    expect(new Set([first, second, third]).size, 'a duplicate sheet name ends the export').toBe(3);
    // Excel compares names without case, so the numbering has to as well.
    expect(new Set([first, second, third].map((n) => n.toLowerCase())).size).toBe(3);
  });

  test('no name exceeds the 31 characters Excel allows', () => {
    const taken = new Set<string>();
    const long = 'A'.repeat(80);
    for (let i = 0; i < 12; i += 1) {
      expect(sheetName(long, `TC_${i}`, taken).length).toBeLessThanOrEqual(31);
    }
    expect(taken.size, 'the long names collapsed into one').toBe(12);
  });

  test('the raw id no longer reaches addWorksheet', () => {
    const page = rendered(PAGE);
    expect(page, 'the unchecked slice is back').not.toMatch(/addWorksheet\(\s*safeId/);
    expect(page).toMatch(/addWorksheet\(excelSheetName\(/);
    // Both sheets go through the same set, or the summary sheet and a test
    // case called "Test Suite Summary" collide.
    expect(page).toMatch(/addWorksheet\(excelSheetName\("Test Suite Summary"/);
  });

  test('a failed export says so on the page', () => {
    const page = rendered(PAGE);
    // The `catch` wrote to the console and nothing else: no file arrived, no
    // message appeared, and the button looked broken.
    const block = page.slice(page.indexOf('const exportTestCasesToExcel'));
    expect(block.slice(0, block.indexOf('\n  };'))).toContain('setExportError(');
    expect(page, 'the message is set but never rendered').toMatch(/\{exportError &&/);
    expect(page).toContain('data-export-error');
  });
});

/* ------------------------------------------------------------------ */
/* 5 — a project document that grew until no write to it worked        */
/* ------------------------------------------------------------------ */

test.describe('an export does not push the project towards the 1 MiB cap', () => {
  const PAGES: Array<[string, string]> = [
    ['app/(app)/project/[projectId]/analyze/page.tsx', 'analysis_confluence_'],
    ['app/(app)/project/[projectId]/design/page.tsx', 'design_confluence_'],
  ];

  for (const [rel, prefix] of PAGES) {
    test(`${rel.split('/').slice(-2)[0]} stores no HTML blob`, () => {
      const page = rendered(rel);
      // `exports.<kind>_confluence_<Date.now()>` with the full HTML, added on
      // every export and never removed. Nothing in the product reads
      // `exports`, and past 1 MiB *every* write to the project fails.
      expect(page, 'the timestamped blob is back').not.toMatch(
        new RegExp(`exports\\.${prefix}\\$\\{Date\\.now\\(\\)\\}`),
      );
      // `[^)]` already crosses newlines, so this needs no `s` flag — and must
      // not have one: `tsconfig.json` targets ES2017, where `dotAll` is a build
      // error (TS1501), and the build fails on any TS error.
      expect(page, 'the HTML is stored under some other key').not.toMatch(
        /updateDoc\([^)]*htmlContent/,
      );
      // What is left is the clean-up of what earlier versions wrote.
      expect(page).toContain('deleteField()');
      expect(page).toMatch(new RegExp(`startsWith\\('${prefix}'\\)`));
      expect(page, 'the clean-up writes even when there is nothing to clean').toContain(
        'staleExports.length > 0',
      );
    });

    test(`${rel.split('/').slice(-2)[0]} adds no client-writable field`, () => {
      // `firestore.rules` allows a client update only to the keys in
      // `affectedKeys().hasOnly([...])`, and `exports` is already one of them.
      // A new top-level key here would be rejected by the rules — which are
      // deployed by hand — long after the code shipped.
      const page = rendered(rel);
      const written = [...page.matchAll(/`([a-zA-Z]+)\.\$?\{?[^`]*`\]?:/g)].map((m) => m[1]);
      for (const key of written) expect(['exports']).toContain(key);
    });
  }

  test('the one reader of the field could never have shown the blob', () => {
    // This is the reason the blob could be dropped rather than capped, and it
    // is not "nothing reads `exports`" — the dashboard does. It reads every
    // entry as `{ title, content, type }`, while these two stages wrote a bare
    // HTML string, so each stored export drew a row titled with its raw key
    // whose View and Download buttons were handed `undefined`. Capping at N
    // would have kept N of those rows.
    //
    // If the writer and the reader are ever made to agree, this guard is where
    // that decision gets reopened.
    const readers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.resolve(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          // Without a lookbehind, which is ES2018 and this repo targets ES2017.
          const hits = read(rel).match(/[A-Za-z_$][\w$]*\.exports\b/g) || [];
          if (hits.some((h) => h !== 'module.exports')) readers.push(rel);
        }
      }
    };
    for (const dir of ['app', 'components', 'hooks', 'lib']) walk(dir);
    expect(readers.sort(), 'a new reader of `exports` appeared').toEqual([
      'app/(app)/dashboard/page.tsx',
      'app/(app)/project/[projectId]/analyze/page.tsx',
      'app/(app)/project/[projectId]/design/page.tsx',
      'lib/project-loader.ts',
    ]);

    const dashboard = read('app/(app)/dashboard/page.tsx');
    const block = dashboard.slice(dashboard.indexOf('const dynamicExports'));
    expect(block.slice(0, 400), 'the reader expects a record, not a string').toMatch(/value\.title/);
    expect(block.slice(0, 400)).toMatch(/value\.content/);
  });
});
