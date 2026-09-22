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

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with its comments taken out — a comment executes nothing. */
const withoutComments = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const TRANSFORMATION = 'app/(app)/project/[projectId]/transformation/page.tsx';
const SAMPLE = 'components/SamplePackageDownload.tsx';

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

  const requirements = (track: 'abapCloud' | 'btp') => {
    const block = src().match(new RegExp(`${track}:\\s*\\[([\\s\\S]*?)\\]`));
    expect(block, `no required-artefact list for the ${track} track`).not.toBeNull();
    return allMatches(block![1], /suffix:\s*'([^']+)'/g);
  };

  const promptPaths = (chunk: string) => allMatches(chunk, /"path":\s*"([^"]+)"/g);

  for (const track of ['abapCloud', 'btp'] as const) {
    test(`every file the ${track} prompt asks for is required back`, () => {
      const paths = promptPaths(prompts()[track]);
      const suffixes = requirements(track);
      expect(paths.length, 'the prompt names no files at all').toBeGreaterThanOrEqual(5);
      for (const p of paths) {
        const covered = suffixes.some((s) => p.toLowerCase().endsWith(s));
        expect(covered, `the prompt asks for ${p} and nothing checks that it came back`).toBe(true);
      }
    });

    test(`the ${track} track requires nothing the prompt never asked for`, () => {
      const paths = promptPaths(prompts()[track]).map((p) => p.toLowerCase());
      for (const s of requirements(track)) {
        expect(
          paths.some((p) => p.endsWith(s)),
          `"${s}" is demanded of the model but never asked of it`,
        ).toBe(true);
      }
    });

    test(`a single file cannot satisfy the ${track} track`, () => {
      // The finding's own case: one entry with a path and some content used to
      // pass, because "at least one usable file" was the whole of it.
      const suffixes = requirements(track);
      const single = track === 'abapCloud' ? 'src/zcl_demo_rap_behavior.clas.abap' : 'srv/service.ts';
      const satisfied = suffixes.filter((s) => single.toLowerCase().endsWith(s));
      expect(
        satisfied.length,
        'one file still answers the whole package',
      ).toBeLessThan(suffixes.length);
    });
  }

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

test.describe('5198d59e7ea5 · the sample package reads what it selects', () => {
  /**
   * `INTO CORRESPONDING FIELDS OF TABLE` matches component names literally:
   * case is irrelevant, an underscore is not. The CDS view entity publishes
   * `SalesOrderNumber`; the target structure declared `sales_order_number`; all
   * eight fields came back initial, in the package the landing page calls a
   * "Real abapGit Package".
   */
  const src = () => read(SAMPLE);

  /**
   * The columns the reader class asks the view for. Read out of the method
   * body: the view's own `as select from I_SalesOrder` would otherwise be the
   * first thing a SELECT pattern finds.
   */
  const selected = () => {
    const body = src().match(/METHOD get_open_orders\.([\s\S]*?)ENDMETHOD/);
    expect(body, 'the reader method moved or was renamed').not.toBeNull();
    const m = body![1].match(/SELECT\s+([\s\S]*?)\s+FROM\s+ZI_SalesOrderCustom/i);
    expect(m, 'the reader class no longer selects from the view').not.toBeNull();
    return m![1]
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
  };

  /** The components of the structure the rows are read into. */
  const components = () => {
    const m = src().match(/BEGIN OF ty_order,([\s\S]*?)END OF ty_order/);
    expect(m, 'the target structure moved or was renamed').not.toBeNull();
    return m![1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => l.split(/\s+/)[0].replace(/,$/, ''));
  };

  /** The names the view entity actually exposes. */
  const viewFields = () => {
    const m = src().match(/define view entity[\s\S]*?\{([\s\S]*?)\n\}/);
    expect(m, 'the CDS view entity moved or was renamed').not.toBeNull();
    return m![1]
      .split('\n')
      .map((l) => l.match(/\bas\s+([A-Za-z_]\w*)/))
      .filter((hit): hit is RegExpMatchArray => hit !== null)
      .map((hit) => hit[1]);
  };

  test('every selected column has an identically named component to land in', () => {
    const lower = (xs: string[]) => xs.map((x) => x.toLowerCase()).sort();
    const cols = selected();
    expect(cols.length, 'the SELECT list is empty').toBeGreaterThanOrEqual(8);
    expect(
      lower(components()),
      'CORRESPONDING FIELDS matches by name — these two lists must be the same names',
    ).toEqual(lower(cols));
  });

  test('and every selected column is a column the view publishes', () => {
    const fields = viewFields().map((f) => f.toLowerCase());
    for (const col of selected()) {
      expect(fields, `the class selects ${col}, which the view does not expose`).toContain(
        col.toLowerCase(),
      );
    }
  });

  test('the reader still relies on the name match, so the guard still means something', () => {
    expect(src()).toContain('INTO CORRESPONDING FIELDS OF TABLE');
  });
});

test.describe('9028321e9795 · the replay says it is an illustration', () => {
  test('on the public page, in text, before anything is claimed', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const replay = page.getByTestId('transformation-replay');
    await expect(replay).toBeVisible({ timeout: 60_000 });

    const caveat = replay.locator('[data-replay-caveat]');
    await expect(caveat, 'nothing on the page says the replay is scripted').toBeVisible();
    // Visible without a pointer and without opening anything: the finding is
    // that the qualification lived nowhere a reader would meet it, and a title
    // attribute is nowhere on a phone (the reasoning of UX-029).
    const opacity = await caveat.evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeGreaterThan(0.5);
    await expect(caveat).toHaveText(/illustration/i);
    await expect(caveat).toHaveText(/nothing here is compiled, tested or run/i);
  });

  test('and it is still there once the claims are on screen', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const replay = page.getByTestId('transformation-replay');
    await expect(replay).toBeVisible({ timeout: 60_000 });

    // The click is retried until the frame is actually open, and that is not
    // belt-and-braces. Two things made a single click useless here, both found
    // by running it rather than by reading it:
    //
    //   · The landing page is heavy, and a click that lands before React has
    //     hydrated hits server-rendered HTML with no handler attached. Nothing
    //     happens, nothing errors, and the wait after it times out against a
    //     frame that was never opened.
    //   · `text=Pipeline Log` — the first way this waited — matches a substring
    //     case-insensitively, and the caveat this very finding added contains
    //     "The pipeline log and the lines that type themselves". The wait was
    //     satisfied before the animation started.
    //
    // So: exact heading, and the click repeated until it takes.
    const play = replay.getByRole('button', { name: /Watch Transformation Live/i });
    const pipelineLog = replay.getByText('Pipeline Log', { exact: true });
    await expect(async () => {
      if (await play.isVisible()) await play.click();
      await expect(pipelineLog).toBeVisible({ timeout: 2_000 });
    }, 'the animation never started').toPass({ timeout: 60_000 });
    await expect(replay.locator('[data-replay-caveat]')).toBeVisible();
    await expect(
      replay.locator('[data-replay-illustration]'),
      'the running animation carries no label of its own',
    ).toBeVisible();
  });
});
