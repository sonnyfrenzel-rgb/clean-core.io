import { test, expect } from '@playwright/test';
import fs from 'fs';
import {
  NAMING_FORMAT_VERSION,
  NAMING_MADE_FROM_FACTS,
  applyNaming,
  namingContextOf,
  type ProcessNamingRecord,
} from '../lib/process-naming';
import { buildBpmnExportFromSource, buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel, withShownNames } from '../lib/process-map';
import { pinnedExamplePath } from './helpers/starter-example-files';

/**
 * Roadmap 3.1.0 item 4 (plan AB-3, AI Act Art. 50 per element): the pen mark stands exactly where a model wrote the
 * text. An element the engine named carries none — also when the model answered with the engine's own words — and the
 * BPMN download marks exactly the elements the map marks. Server-free.
 */

const FILE = 'Z_MM_PO_APPROVAL.abap';
const source = fs.readFileSync(pinnedExamplePath(FILE), 'utf8').replace(/\r\n/g, '\n');
const options = { processName: 'PO approval', sourceFileName: FILE, exporterVersion: 'v3.0.21' };
const context = namingContextOf(source, { engineVersion: '3.0.21' });
const plain = buildReadingExports(source, options);
const engineModel = buildProcessMapModel({ bpmn: plain.bpmn, technical: plain.technical, named: applyNaming(context, null), fileName: FILE });

/** Three tasks of the map: one gets a name of its own, one the engine's name again, one nothing. */
const tasks = engineModel.elements.filter((e) => /task/i.test(e.tag) && e.nodeId && e.plainName).slice(0, 3);
const OWN = 'Approve the emergency order';

function stored(): ProcessNamingRecord {
  const node = (id: string) => context.skeleton.nodes.find((n) => n.id === id)!;
  return {
    formatVersion: NAMING_FORMAT_VERSION,
    digest: context.digest,
    names: [
      { id: tasks[0].nodeId!, technicalName: node(tasks[0].nodeId!).label, name: OWN },
      { id: tasks[1].nodeId!, technicalName: node(tasks[1].nodeId!).label, name: tasks[1].plainName! },
    ],
    lanes: [],
    discarded: { total: 0, byRule: {} },
    origin: { source: 'model', receipt: 'verified', provider: 'google-gemini', modelId: 'gemini-receipt-model', byok: false, issuedAt: Date.parse('2026-11-12T09:00:00Z'), textSha256: 'a'.repeat(64) },
    namedAt: '2026-11-12T09:00:01Z',
    madeFrom: NAMING_MADE_FROM_FACTS,
  };
}

test('the fixture has three tasks with plain names', () => {
  expect(tasks).toHaveLength(3);
});

test('the map: a name of the model\'s own is a business name; the engine\'s words again are none', () => {
  const named = buildProcessMapModel({ bpmn: plain.bpmn, technical: plain.technical, named: applyNaming(context, stored()), fileName: FILE });
  const byId = new Map(named.elements.map((e) => [e.id, e]));
  expect(byId.get(tasks[0].id)?.businessName).toBe(OWN);
  expect(byId.get(tasks[1].id)?.businessName).toBeNull();
  expect(byId.get(tasks[1].id)?.label).toBe(tasks[1].plainName);
  expect(byId.get(tasks[2].id)?.businessName).toBeNull();
  expect(named.elements.filter((e) => e.businessName !== null).map((e) => e.id)).toEqual([tasks[0].id]);
});

test('the download marks exactly the elements the map marks', () => {
  const { xml } = buildBpmnExportFromSource(source, { ...options, names: 'plain', naming: stored() });
  const marked = [...xml.matchAll(/<cc:origin value="ai"/g)];
  expect(marked).toHaveLength(1);
  expect(xml).toContain(`name="${OWN}"`);
  // The one mark sits inside the element named OWN: its opening tag is the nearest one before the mark that is not
  // `extensionElements` or a `cc:` child, and the mark comes before that element closes.
  const at = marked[0].index!;
  const opens = [...xml.slice(0, at).matchAll(/<(bpmn:[A-Za-z]+)\s[^>]*>/g)].filter((m) => !/extensionElements/.test(m[1]));
  const owner = opens[opens.length - 1];
  expect(owner[0]).toContain(`name="${OWN}"`);
  expect(xml.indexOf(`</${owner[1]}>`, owner.index!)).toBeGreaterThan(at);
  // The engine-named tasks carry none.
  for (const t of [tasks[1], tasks[2]]) {
    const open = xml.match(new RegExp(`<(bpmn:[A-Za-z]+)\\s[^>]*name="${t.plainName!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/&/g, '&amp;')}"[^>]*>`));
    expect(open, `task "${t.plainName}" is in the download`).not.toBeNull();
    if (!open) continue;
    const close = xml.indexOf(`</${open[1]}>`, open.index!);
    expect(xml.slice(open.index!, close)).not.toContain('cc:origin');
  }
});

test('while names arrive, the model carries a name only once its swap began — everywhere it is read', () => {
  const named = buildProcessMapModel({ bpmn: plain.bpmn, technical: plain.technical, named: applyNaming(context, stored()), fileName: FILE });
  const before = withShownNames(named, new Map());
  expect(before.elements.every((e) => e.businessName === null)).toBe(true);
  expect(before.elements.map((e) => e.accessibleName)).toEqual(engineModel.elements.map((e) => e.accessibleName));
  expect(before.naming.named).toBe(0);
  const after = withShownNames(named, new Map([[tasks[0].id, OWN]]));
  expect(after.elements.find((e) => e.id === tasks[0].id)?.label).toBe(OWN);
  expect(after.elements.find((e) => e.id === tasks[0].id)?.accessibleName).toContain(OWN);
  // A branch that leads to the named step says its name.
  const into = after.elements.flatMap((e) => e.branches).filter((b) => b.to === tasks[0].id);
  for (const branch of into) expect(branch.toLabel).toBe(OWN);
  // Nothing else of the model moves.
  expect(after.xml).toBe(named.xml);
  expect(after.elements.map((e) => [e.id, e.anchor])).toEqual(named.elements.map((e) => [e.id, e.anchor]));
  // Unchanged names give back the same model.
  expect(withShownNames(after, new Map([[tasks[0].id, OWN]]))).toBe(after);
});
