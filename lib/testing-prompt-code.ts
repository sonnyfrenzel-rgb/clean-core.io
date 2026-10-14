/**
 * The generated package as the testing prompt carries it (dev acceptance
 * 14.10.2026): the SD example's package — 36 files, a 97 KB logic class —
 * plus the numbered original and the design went past `/api/gemini`'s
 * 250,000-character prompt limit, and Testing could not write a scenario.
 *
 * What a test needs is the code under test. So: only source files (no abapGit
 * metadata, no README/STATUS/TRACE, no JSON but `package.json`, no generated
 * test classes), the fill markers taken out, the files most worth testing
 * first, and within a character budget. A file that does not fit is named,
 * never cut in half — a half class tests nothing and reads as a whole one.
 *
 * Pure, no imports beyond the sandbox's own file reader.
 */
import { sandboxFilesFromStoredCode } from '@/lib/test-sandbox/files';

/** `/api/gemini`'s prompt limit, less a margin for the instructions that follow the code. */
export const TESTING_PROMPT_LIMIT = 250_000;
export const TESTING_PROMPT_MARGIN = 6_000;

const SOURCE = /\.(abap|asddls|asbdef|asdcls|assrvd|cds|ts|js|mjs)$/i;
const SKIP = /\.(clas\.testclasses\.abap|spec\.(ts|js)|test\.(ts|js))$|(^|\/)(playwright\.config\.(ts|js))$/i;

/** Lower first: logic and behaviour before the data model, the data model before the rest. */
function rank(path: string): number {
  if (/\.clas\.abap$/i.test(path)) return 0;
  if (/\.clas\.locals_(imp|def)\.abap$/i.test(path)) return 1;
  if (/(^|\/)(service|server|app)\.(ts|js)$/i.test(path)) return 0;
  if (/\.(ts|js|mjs)$/i.test(path)) return 1;
  if (/\.(asbdef|intf\.abap)$/i.test(path)) return 2;
  if (/\.(asddls|cds)$/i.test(path)) return 3;
  return 4;
}

export interface TestingPromptCode {
  /** The files, each under a `--- path ---` line. */
  text: string;
  /** Files in the package that are not code under test (metadata, documents). */
  notCode: number;
  /** Code files that did not fit the budget, by path. */
  leftOut: string[];
}

export function codeForTestingPrompt(stored: string | null | undefined, budget: number): TestingPromptCode {
  const files = sandboxFilesFromStoredCode(typeof stored === 'string' ? stored : '');
  // A package from before the file list (one flat string) is code as it is.
  if (files.length === 1 && files[0].path === 'app.ts') {
    const content = files[0].content;
    return content.length <= budget ? { text: content, notCode: 0, leftOut: [] } : { text: '', notCode: 0, leftOut: ['the stored code'] };
  }
  const code = files.filter((f) => SOURCE.test(f.path) && !SKIP.test(f.path));
  const sorted = [...code].sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path));
  const parts: string[] = [];
  const leftOut: string[] = [];
  let used = 0;
  for (const f of sorted) {
    const body = f.content
      .split('\n')
      .filter((line) => !line.includes('@cc-fill'))
      .join('\n');
    const block = `--- ${f.path} ---\n${body}\n`;
    if (used + block.length > budget) {
      leftOut.push(f.path);
      continue;
    }
    parts.push(block);
    used += block.length;
  }
  return { text: parts.join('\n'), notCode: files.length - code.length, leftOut };
}

/** The sentence the prompt carries about what it left out; empty when nothing was. */
export function testingCodeNote(c: TestingPromptCode): string {
  if (c.leftOut.length === 0) return '';
  return `\nNOTE: ${c.leftOut.length} code file(s) of the package are not shown here because the prompt has a size limit: ${c.leftOut.join(', ')}. Do not write tests that depend on their internals; test through the classes shown.\n`;
}
