/**
 * What a generated package must contain, per track — and the one function that
 * decides whether an answer contains it.
 *
 * This lived inside `app/(app)/project/[projectId]/transformation/page.tsx`
 * until 22.09.2026. The gate itself was sound; the test around it was not. A
 * page component cannot be imported by a spec, so `tests/qa-dringend-b88c77b.spec.ts`
 * re-implemented the matcher locally and then checked that the page's source
 * still contained the same ternary. That passes a copy and reads a string: change
 * `baseName` to return the whole path and the copy's own cases still go green
 * while the shipped gate quietly stops working (QA review of 9e408888bfec,
 * finding 3c05340dc39b). Moved here so the spec can exercise the real thing.
 *
 * No imports, and none belong here: the page is a client component, and a
 * module it pulls in travels into the browser bundle with it.
 */

export interface ProjectFile {
  path: string;
  content: string;
}

/**
 * Two kinds of requirement, and they are not the same test.
 *
 * `*.clas.abap` is an extension: any file name may carry it. `package.json` and
 * `Dockerfile` are *names* — the tooling that reads them looks
 * for that exact file, not for something ending in it. Matching both with
 * `endsWith` let `xpackage.json` satisfy the manifest requirement and
 * `my-dockerfile` the container one: a package reported complete that would not
 * build (QA review of 7fea4f4, acceptance "a generated package must include the
 * required artifacts for its selected track": not met).
 */
export type Requirement =
  | { label: string; match: 'extension'; suffix: string }
  | { label: string; match: 'name'; name: string };

/**
 * The abapGit configuration is **not** on this list, and its absence is the point.
 *
 * It was, and the model was asked for it by name in the same breath. Both went on
 * 23.09.2026: the file abapGit reads is `.abapgit.xml`, with a leading dot, and
 * the prompt asked for `abapgit.xml` — so every package carried a configuration
 * abapGit ignores, with `START_CLASS` wired to a demo class from someone else's
 * project (QA full review of 3131afa, 827cf6758637). The delivery step writes the
 * real one deterministically from the project now, so the model must not invent
 * one; a generated configuration would put a guessed value where a measured one
 * belongs.
 *
 * This list and the prompt are two halves of one statement — what the model is
 * asked for, and what it is required to hand back. Dropping one without the other
 * is why this is written down: `tests/qa-dringend-b88c77b.spec.ts` compares them
 * in both directions, and for the length of one commit the gate demanded a file
 * nobody asked for, which would have reported every abapCloud package incomplete.
 */
export const REQUIRED_ARTEFACTS: Record<'abapCloud' | 'btp', Requirement[]> = {
  abapCloud: [
    { label: 'behavior implementation class (*.clas.abap)', match: 'extension', suffix: '.clas.abap' },
    { label: 'class metadata descriptor (*.clas.xml)', match: 'extension', suffix: '.clas.xml' },
    { label: 'CDS data definition (*.ddls.asddls)', match: 'extension', suffix: '.ddls.asddls' },
    { label: 'behavior definition (*.bdef.asbdef)', match: 'extension', suffix: '.bdef.asbdef' },
    { label: 'service definition (*.srvd.assrvd)', match: 'extension', suffix: '.srvd.assrvd' },
    { label: 'service binding (*.srvb.assrvb)', match: 'extension', suffix: '.srvb.assrvb' },
  ],
  btp: [
    { label: 'service implementation (*.ts)', match: 'extension', suffix: '.ts' },
    { label: 'schema definition (*.cds)', match: 'extension', suffix: '.cds' },
    { label: 'dependency manifest (package.json)', match: 'name', name: 'package.json' },
    { label: 'container setup (Dockerfile)', match: 'name', name: 'dockerfile' },
    { label: 'ERP-side event publisher (*.clas.abap)', match: 'extension', suffix: '.clas.abap' },
  ],
};

/** The last segment of a path, however the model wrote the separators. */
export const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/**
 * A name is compared against the base name, so a `package.json` in a
 * subdirectory still counts — the generator chooses the layout — while a file
 * merely *ending* in `package.json` does not.
 */
export const satisfies = (required: Requirement, path: string): boolean => {
  const lower = path.trim().toLowerCase();
  return required.match === 'extension' ? lower.endsWith(required.suffix) : baseName(lower) === required.name;
};

/** What the prompt asked for and the answer does not contain, in reader's words. */
export const missingArtefacts = (generated: ProjectFile[], isAbapCloud: boolean): string[] =>
  REQUIRED_ARTEFACTS[isAbapCloud ? 'abapCloud' : 'btp']
    .filter((required) => !generated.some((f) => satisfies(required, f.path)))
    .map((required) => required.label);

export interface GeneratedTestSuite {
  config: string;
  spec: string;
}

const hasText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * The test suite the prompt asked for, or `null` when the answer did not carry
 * one. Both tracks ask for `tests.spec`, the test class or spec file. The BTP
 * track also asks for `tests.config` — a Playwright spec without its
 * `playwright.config.ts` does not run; the ABAP Unit "configuration metadata"
 * the abapCloud prompt names is optional for ABAP Unit, so only the spec is
 * required there.
 *
 * The page used to write `parsed.tests || { config: '', spec: '' }` and mark
 * the project transformed: an answer without tests, or with `tests: "none"`,
 * became a finished stage with no test suite (QA full review of 81810c8,
 * 183ed4edf700).
 */
export const usableTestSuite = (tests: unknown, isAbapCloud: boolean): GeneratedTestSuite | null => {
  if (!tests || typeof tests !== 'object' || Array.isArray(tests)) return null;
  const { config, spec } = tests as { config?: unknown; spec?: unknown };
  if (!hasText(spec)) return null;
  if (!isAbapCloud && !hasText(config)) return null;
  return { config: typeof config === 'string' ? config : '', spec };
};

/**
 * After a lost answer the page rereads the project. The store counts as done
 * only when all of it is there — code, suite and status — never the code
 * alone: an earlier run can have left the same code with another suite
 * (roadmap 3.0.11, QA review of 35f67702209b, 546d27f6f092).
 */
export const holdsStoredPackage = (
  reread: { generatedCode?: unknown; testSuite?: unknown; status?: unknown } | null | undefined,
  packaged: string,
  tests: GeneratedTestSuite,
): boolean => {
  if (!reread) return false;
  const suite = reread.testSuite as { spec?: unknown; config?: unknown } | null | undefined;
  return (
    reread.generatedCode === packaged &&
    reread.status === 'transformed' &&
    suite?.spec === tests.spec &&
    (suite?.config ?? '') === (tests.config ?? '')
  );
};
