/**
 * QA full review of 81810c8 — high findings in the product UI.
 *
 *   183ed4edf700  a transformation without its test suite was stored as finished
 *   68c8263e20f6  the BPMN editor saved older XML and dropped edits made during a save
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { usableTestSuite } from '../lib/transformation-artefacts';
import { saveDraft } from '../components/process-map/draft-save';

const ROOT = path.resolve(__dirname, '..');
const withoutComments = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const code = (rel: string) => withoutComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const TRANSFORMATION = 'app/(app)/project/[projectId]/transformation/page.tsx';

test.describe('183ed4edf700 · no transformation without its test suite', () => {
  test('an answer without a usable suite is refused, on both tracks', () => {
    for (const isAbapCloud of [true, false]) {
      expect(usableTestSuite(undefined, isAbapCloud)).toBeNull();
      expect(usableTestSuite(null, isAbapCloud)).toBeNull();
      expect(usableTestSuite('none', isAbapCloud)).toBeNull();
      expect(usableTestSuite([], isAbapCloud)).toBeNull();
      expect(usableTestSuite({}, isAbapCloud)).toBeNull();
      expect(usableTestSuite({ config: 'x', spec: '' }, isAbapCloud)).toBeNull();
      expect(usableTestSuite({ config: 'x', spec: '   ' }, isAbapCloud)).toBeNull();
      expect(usableTestSuite({ config: 'x', spec: 42 }, isAbapCloud)).toBeNull();
    }
  });

  test('the BTP track needs its Playwright config; ABAP Unit does not', () => {
    expect(usableTestSuite({ spec: 'test()' }, false)).toBeNull();
    expect(usableTestSuite({ config: ' ', spec: 'test()' }, false)).toBeNull();
    expect(usableTestSuite({ config: 'cfg', spec: 'test()' }, false)).toEqual({ config: 'cfg', spec: 'test()' });
    expect(usableTestSuite({ spec: 'CLASS ltc_test' }, true)).toEqual({ config: '', spec: 'CLASS ltc_test' });
  });

  test('the page refuses before the binding and the write, and stores only the checked suite', () => {
    const src = code(TRANSFORMATION);
    expect(src).not.toMatch(/parsed\.tests\s*\|\|/);
    const gate = src.indexOf('usableTestSuite(parsed.tests, isAbapCloud)');
    const binding = src.indexOf('recordGenerationBinding(projectId');
    const write = src.indexOf("status: 'transformed'");
    expect(gate).toBeGreaterThan(0);
    expect(binding).toBeGreaterThan(gate);
    expect(write).toBeGreaterThan(gate);
    const between = src.slice(gate, binding);
    expect(between).toMatch(/if \(!tests\)\s*\{\s*throw new Error\('[^']*Nothing was saved/);
  });
});

test.describe('68c8263e20f6 · Save keeps the canvas as it is, and only what it kept is clean', () => {
  /** A promise the test resolves when it chooses — the gap a real save has. */
  const gate = <T,>() => {
    let open!: (value: T) => void;
    const promise = new Promise<T>((resolve) => { open = resolve; });
    return { promise, open };
  };

  test('the XML kept is serialised when Save is pressed, not the last published copy', async () => {
    const kept: string[] = [];
    const { result, clean } = await saveDraft({
      serialise: async () => '<canvas-now/>',
      fallbackXml: '<published-before-the-last-edit/>',
      changes: () => 3,
      keep: async (xml) => { kept.push(xml); return { ok: true, message: 'Saved.' }; },
    });
    expect(kept).toEqual(['<canvas-now/>']);
    expect(result.message).toBe('Saved.');
    expect(clean).toBe(true);
  });

  test('an edit made while the save is in flight stays unsaved', async () => {
    let changes = 7;
    const answer = gate<{ ok: boolean; message: string }>();
    const saving = saveDraft({
      serialise: async () => '<canvas-now/>',
      fallbackXml: '',
      changes: () => changes,
      keep: () => answer.promise,
    });
    await Promise.resolve();
    changes += 1; // the reader draws another step before the answer arrives
    answer.open({ ok: true, message: 'Saved as revision 2.' });
    expect((await saving).clean).toBe(false);
  });

  test('a refused save is not clean, and without a canvas the published draft is kept', async () => {
    const kept: string[] = [];
    const { clean } = await saveDraft({
      serialise: async () => undefined,
      fallbackXml: '<published/>',
      changes: () => 0,
      keep: async (xml) => { kept.push(xml); return { ok: false, message: 'Nothing was saved.' }; },
    });
    expect(kept).toEqual(['<published/>']);
    expect(clean).toBe(false);
  });

  test('the editor saves through it, and a late serialisation cannot overwrite a newer one', () => {
    const src = code('components/process-map/BpmnEditor.tsx');
    const onSave = src.slice(src.indexOf('const onSave'), src.indexOf('const activeRow'));
    expect(onSave).toContain('saveDraft(');
    expect(onSave).toMatch(/saveXML\(\{ format: true \}\)/);
    expect(onSave).toMatch(/if \(clean\) setDirty\(false\)/);
    expect(onSave).not.toMatch(/if \(result\.ok\) setDirty\(false\)/);
    expect(onSave).not.toMatch(/xml: draftXml/);
    const publish = src.slice(src.indexOf('const publish'), src.indexOf("eventBus.on('commandStack.changed'"));
    expect(publish).toMatch(/const ticket = \+\+changeCountRef\.current/);
    expect(publish).toMatch(/ticket !== changeCountRef\.current\) return/);
  });
});
