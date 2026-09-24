/**
 * QA full review of b88c77b — the four findings that were verified at the code
 * and fixed rather than refuted:
 *
 *   55cf6c0ed62a  a model answer that was not JSON became the "transformed" code
 *   7976bced4c28  one file counted as a complete package
 *   5198d59e7ea5  the advertised sample package read no data at all
 *   9028321e9795  a timer-driven animation reported a compiler run
 *
 * Three of the four are read from source, and that is the honest reading here.
 * The first two live on a path a browser cannot reach without a paid model call
 * that answers *badly on purpose*: the branch under test is the one that runs
 * when Gemini refuses, and nothing in the suite can make it refuse. The third is
 * ABAP inside a ZIP — there is no ABAP compiler in this product and no renderer
 * for it, so what can be checked is the thing that was wrong: two lists of field
 * names that have to agree. The fourth is on a public page and is read there,
 * where a reader would see it.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
// The shipped gate, not a copy of it. This block used to re-implement the
// matcher and then check that the page still contained the same ternary — a
// test of a duplicate plus a string search, green while the real gate stops
// working (QA review of 9e408888bfec, 3c05340dc39b). `missingArtefacts` moved
// out of the page component so it can be imported and run here.
import {
  missingArtefacts,
  REQUIRED_ARTEFACTS,
  satisfies,
  type Requirement,
} from '../lib/transformation-artefacts';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with its comments taken out — a comment executes nothing. */
const withoutComments = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const TRANSFORMATION = 'app/(app)/project/[projectId]/transformation/page.tsx';

/**
 * The file with its comments removed, which is what the order-of-execution
 * assertions below are about. Read raw, the very comments that record these
 * findings quote `status: 'transformed'` — and the first quotation, hundreds of
 * lines above the write, would be taken for the write itself.
 */
const code = (rel: string) => withoutComments(read(rel));

const allMatches = (s: string, re: RegExp): string[] =>
  Array.from(s.matchAll(re)).map((m) => m[1]);

test.describe('55cf6c0ed62a · a refusal is not a transformation', () => {
  test('the unparsed model answer never becomes a file', () => {
    const src = withoutComments(read(TRANSFORMATION));

    // The wrapping itself. `content: responseText` is how the text the model
    // answered with — a refusal, a quota notice, an apology — was turned into
    // "srv/service.ts" and stored with `status: 'transformed'`.
    expect(src, 'the raw model answer is wrapped as a source file again').not.toMatch(
      /content:\s*responseText/,
    );

    // And the mechanism rather than the one spelling: no catch branch may build
    // the file list. A failed parse has nothing to build it from.
    expect(src, 'a catch branch assigns the generated file list again').not.toMatch(
      /catch[\s\S]{0,120}filesArray\s*=\s*\[/,
    );
  });

  test('it is reported as a failed generation, in the words this stage already uses', () => {
    const src = code(TRANSFORMATION);
    expect(src, 'nothing tells the reader the answer was not JSON').toMatch(
      /throw new Error\('The model answered with text instead of the JSON/,
    );
    // The same promise the empty-answer gate two branches down makes: the
    // artefact that was there survives a bad run.
    const parseFailure = src.slice(src.indexOf('answered with text instead of the JSON'));
    expect(
      parseFailure.slice(0, 200),
      'the message does not say that nothing was saved',
    ).toContain('Nothing was saved');
  });

  test('and no write can be reached before that throw', () => {
    const src = code(TRANSFORMATION);
    const throwAt = src.indexOf('answered with text instead of the JSON');
    const writeAt = src.indexOf("status: 'transformed'");
    expect(throwAt, 'the parse failure no longer throws').toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(-1);
    expect(throwAt, 'the project is written before the answer has been checked').toBeLessThan(
      writeAt,
    );
  });
});

test.describe('7976bced4c28 · one file is not a package', () => {
  /**
   * The gate has to be the prompt's own file list, not a private idea of what an
   * ABAP or a CAP package contains. So the prompt is parsed out of the page and
   * the requirement table is checked against it, in both directions: every path
   * the prompt asks for is covered by a requirement, and every requirement
   * answers a path the prompt asks for.
   */
  const src = () => read(TRANSFORMATION);

  const prompts = () => {
    const s = src();
    const from = s.indexOf('const prompt = isAbapCloud');
    expect(from, 'the generation prompt moved — this guard reads it by name').toBeGreaterThan(-1);
    // Both prompts end on the same sentence; the first chunk is the in-app
    // (RAP) track, the second the side-by-side (BTP) one.
    const chunks = s.slice(from).split('No conversational text.');
    expect(chunks.length, 'the two prompts are no longer two').toBeGreaterThanOrEqual(3);
    return { abapCloud: chunks[0], btp: chunks[1] };
  };

  const promptPaths = (chunk: string) => allMatches(chunk, /"path":\s*"([^"]+)"/g);
  const filesOf = (...paths: string[]) => paths.map((p) => ({ path: p, content: 'x' }));

  for (const track of ['abapCloud', 'btp'] as const) {
    const isAbapCloud = track === 'abapCloud';

    test(`every file the ${track} prompt asks for is required back`, () => {
      const paths = promptPaths(prompts()[track]);
      expect(paths.length, 'the prompt names no files at all').toBeGreaterThanOrEqual(5);
      // The whole answer the prompt asks for leaves nothing missing.
      expect(
        missingArtefacts(filesOf(...paths), isAbapCloud),
        'the prompt asks for files the gate never checks came back',
      ).toEqual([]);
    });

    test(`the ${track} track requires nothing the prompt never asked for`, () => {
      const paths = promptPaths(prompts()[track]);
      for (const r of REQUIRED_ARTEFACTS[track]) {
        expect(
          paths.some((p) => satisfies(r, p)),
          `"${r.label}" is demanded of the model but never asked of it`,
        ).toBe(true);
      }
    });

    test(`a single file cannot satisfy the ${track} track`, () => {
      // The finding's own case: one entry with a path and some content used to
      // pass, because "at least one usable file" was the whole of it.
      const single = isAbapCloud ? 'src/zcl_demo_rap_behavior.clas.abap' : 'srv/service.ts';
      const missing = missingArtefacts(filesOf(single), isAbapCloud);
      expect(missing.length, 'one file still answers the whole package').toBeGreaterThan(0);
      expect(missing.length).toBeLessThan(REQUIRED_ARTEFACTS[track].length);
    });
  }

  test('a fixed name is a name, not an ending', () => {
    // `xpackage.json` is not a dependency manifest and `my-dockerfile` is not a
    // container setup, but `endsWith` said both were — a package reported
    // complete that would not build (QA review of 7fea4f4, acceptance "a
    // generated package must include the required artifacts for its selected
    // track": not met).
    const named = (['abapCloud', 'btp'] as const)
      .flatMap((t) => REQUIRED_ARTEFACTS[t])
      .filter((r): r is Extract<Requirement, { match: 'name' }> => r.match === 'name');
    // Two since 23.09.2026: `package.json` and `Dockerfile`. The third was
    // `abapgit.xml`, and it left the list because the delivery step writes the
    // real `.abapgit.xml` deterministically and the model is no longer asked
    // for one (827cf6758637). The floor is here so the name/ending distinction
    // cannot quietly disappear altogether, not to pin a count.
    expect(named.length, 'no requirement is matched by name any more').toBeGreaterThanOrEqual(2);

    for (const r of named) {
      expect(satisfies(r, r.name), `${r.name} no longer satisfies itself`).toBe(true);
      // A path that merely ends in the name does not.
      expect(satisfies(r, `x${r.name}`), `"x${r.name}" still answers for "${r.name}"`).toBe(false);
      expect(satisfies(r, `src/prefixed-${r.name}`), `a prefixed copy still answers for "${r.name}"`).toBe(false);
      // A directory is the generator's business, so the real file still counts
      // wherever it was put — with either separator, because a model writes both.
      expect(satisfies(r, `srv/${r.name}`), `${r.name} in a subdirectory stopped counting`).toBe(true);
      expect(satisfies(r, `srv\\${r.name}`), `${r.name} with a backslash stopped counting`).toBe(true);
    }

    // And the whole gate moves with it: a package whose manifest and container
    // file are look-alikes is reported incomplete, naming both.
    const almost = filesOf('srv/service.ts', 'db/schema.cds', 'srv/xpackage.json', 'my-dockerfile', 'src/zcl_x.clas.abap');
    const missing = missingArtefacts(almost, false);
    for (const r of REQUIRED_ARTEFACTS.btp.filter((x) => x.match === 'name')) {
      expect(missing, `${r.label} was accepted by a look-alike`).toContain(r.label);
    }
  });

  test('the gate runs before the project is written, and reports a failed generation', () => {
    const s = code(TRANSFORMATION);
    const gateAt = s.indexOf('const missing = missingArtefacts(');
    const writeAt = s.indexOf("status: 'transformed'");
    expect(gateAt, 'no completeness gate beyond "at least one file"').toBeGreaterThan(-1);
    expect(gateAt, 'an incomplete package is written before it is checked').toBeLessThan(writeAt);
    // A half-generation is a failed generation, not a half-saved artefact.
    const message = s.slice(gateAt, writeAt);
    expect(message).toContain('incomplete package');
    expect(message, 'the reader is not told the previous version survived').toContain(
      'Nothing was saved',
    );
  });
});

/*
 * 5198d59e7ea5 (the sample package) and 9028321e9795 (the transformation replay)
 * were guarded here until 3.0.6. Both components left the landing page with the
 * showroom (Sonny, 24.09.2026) and were deleted; `tests/claims-honesty-guard.spec.ts`
 * checks that none of them comes back.
 */
