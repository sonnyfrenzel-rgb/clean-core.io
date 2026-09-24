import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readModelGaps, gapsUnreadableSentence } from '../lib/model-gaps';
import { formatAnalysisToMarkdown } from '../lib/markdownFormatter';

/**
 * The narrative's `gaps`, read one way everywhere (decision 24.09.2026).
 *
 * The prompt asks for a list. The product's default model answered the
 * 1,000-line starter example with a single object in two of three runs, and
 * every reader dropped it: `Array.isArray(...) ? ... : []`. A single object is
 * now a list of one; every other shape is reported, never guessed and never
 * dropped in silence.
 */

const gap = (title: string) => ({
  title,
  severity: 'High',
  strategy: 'Side-by-Side',
  rationale: 'because',
  complexity: 'Medium',
});

test.describe('readModelGaps', () => {
  test('a list is read as it is, entries untouched', () => {
    const list = [gap('A'), gap('B')];
    const reading = readModelGaps(list);
    expect(reading.unreadable).toBeNull();
    expect(reading.gaps).toEqual(list);
    // Same objects, not copies: a well-formed answer reads exactly as before.
    expect(reading.gaps[0]).toBe(list[0]);
  });

  test('an empty list is no gaps and nothing to report', () => {
    expect(readModelGaps([])).toEqual({ gaps: [], unreadable: null });
  });

  test('absent or null is no gaps and nothing to report', () => {
    expect(readModelGaps(undefined)).toEqual({ gaps: [], unreadable: null });
    expect(readModelGaps(null)).toEqual({ gaps: [], unreadable: null });
  });

  test('a single object is a list of exactly that one gap', () => {
    const only = gap('Only');
    const reading = readModelGaps(only);
    expect(reading.unreadable).toBeNull();
    expect(reading.gaps).toHaveLength(1);
    expect(reading.gaps[0]).toBe(only);
  });

  test('text is reported, not read', () => {
    const reading = readModelGaps('Several gaps exist.');
    expect(reading.gaps).toEqual([]);
    expect(reading.unreadable).toBe('text instead of a list');
  });

  test('a number is reported, not read', () => {
    const reading = readModelGaps(3);
    expect(reading.gaps).toEqual([]);
    expect(reading.unreadable).toBe('a number instead of a list');
  });

  test('an object without a title is reported, not invented', () => {
    for (const value of [{ severity: 'High' }, { title: '' }, { title: '   ' }, { title: 42 }]) {
      const reading = readModelGaps(value);
      expect(reading.gaps).toEqual([]);
      expect(reading.unreadable).toBe('an object without a title');
    }
  });

  test('a mixed list keeps the readable entries and reports the rest', () => {
    const good = gap('Good');
    const reading = readModelGaps([good, 'text', { severity: 'Low' }, null, 7]);
    expect(reading.gaps).toEqual([good]);
    expect(reading.unreadable).toBe('4 of 5 entries without a title');
  });

  test('a list with no readable entry says so', () => {
    expect(readModelGaps(['a', 'b']).unreadable).toBe('all 2 entries without a title');
    expect(readModelGaps([{}]).unreadable).toBe('one entry without a title');
  });

  test('the sentence names what could not be read and where it is not', () => {
    expect(gapsUnreadableSentence('text instead of a list')).toBe(
      'The model returned gaps in a form that could not be read (text instead of a list); they are not in the worklist.',
    );
  });
});

test.describe('every reader of the model gaps goes through readModelGaps', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

  for (const file of [
    'lib/analysis-run.ts',
    'lib/markdownFormatter.ts',
    'app/api/runs/create/route.ts',
    'app/(app)/project/[projectId]/analyze/page.tsx',
  ]) {
    test(`${file} reads gaps only through it`, () => {
      const src = read(file);
      expect(src).toContain('readModelGaps(');
      // The old readers: `obj.gaps || []`, `Array.isArray(x.gaps)`, `data.gaps?.map`.
      expect(src).not.toMatch(/\.gaps\s*\|\|\s*\[\]/);
      expect(src).not.toMatch(/Array\.isArray\(\s*\w+\.gaps\s*\)/);
      expect(src).not.toMatch(/\.gaps\?\.map/);
    });
  }

  test('the signing route reads the gaps and never rewrites them into the narrative it hashes', () => {
    // `finalAnalysisText` is `JSON.stringify(analysisObj)` and its SHA-256 is
    // inside the signed payload (`aiNarrativeMeta.responseHash`). Writing the
    // normalised list back would change those bytes for a single-object answer
    // and is not needed: every screen reads the stored shape through the same
    // function.
    const src = read('app/api/runs/create/route.ts');
    expect(src).not.toMatch(/analysisObj\.gaps\s*=/);
    expect(src).toMatch(/gapsList = readModelGaps\(analysisObj\.gaps\)\.gaps;/);
  });
});

test.describe('a real answer: gemini-3.8-flash on the 1,000-line starter example', () => {
  // Model output for a public starter example (roadmap 17.4, results-174),
  // one of the two runs in which `gaps` arrived as a single object.
  const answer = JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 'model-gaps-single-object.gemini-3.8-flash.json'), 'utf8'),
  );

  test('the fixture is the case it claims to be', () => {
    expect(Array.isArray(answer.gaps)).toBe(false);
    expect(typeof answer.gaps).toBe('object');
  });

  test('its one gap is read, not dropped', () => {
    const reading = readModelGaps(answer.gaps);
    expect(reading.unreadable).toBeNull();
    expect(reading.gaps).toHaveLength(1);
    expect(reading.gaps[0].title).toBe(answer.gaps.title);
  });

  test('the Markdown export carries it', () => {
    const md = formatAnalysisToMarkdown(JSON.stringify(answer));
    expect(md).toContain('Functional Gaps & Extensibility Strategies');
    expect(md).toContain(`**${answer.gaps.title}**`);
  });

  test('the Markdown export says so when the shape cannot be read', () => {
    const md = formatAnalysisToMarkdown(JSON.stringify({ ...answer, gaps: 'see above' }));
    expect(md).toContain(gapsUnreadableSentence('text instead of a list'));
  });
});
