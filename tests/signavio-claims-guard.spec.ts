import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Roadmap step 0.2 (part, added 15.09.2026): no page and no badge promises an
 * import into SAP Signavio until roadmap step 4.3 has proven the round trip with
 * a real Signavio. What ships is BPMN 2.0 XML — and even that export has known
 * escaping defects (CR-21, fixed in step 2.6).
 *
 * Acceptance (docs/ROADMAP.md, Phase 0): "keine Seite und kein Badge mehr einen
 * Signavio-Import verspricht".
 *
 * When step 4.3 proves the import, this spec changes in the same release.
 */
const ROOT = path.resolve(__dirname, '..');

const SKIP_DIRS = new Set(['node_modules', '.next', 'api']);
function files(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.resolve(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) files(rel, out);
    } else if (/\.(tsx?|html|md|txt)$/.test(e.name)) out.push(rel);
  }
  return out;
}

/** Every file whose text a visitor, a user or a crawler can read. */
const SURFACES = [...files('app'), ...files('components'), 'lib/features-content.ts', 'lib/how-to-content.ts', 'lib/clean-core-capabilities.ts', 'lib/chatbot-knowledge.ts', 'public/linkedin-whitepaper-template.html', 'README.md'];

/** The promises that were there on 15.09.2026. */
const PROMISES = [
  /importable into SAP Signavio/i,
  /Signavio-Importable/i,
  /compatible with (?:SAP )?Signavio/i,
  /validated for SAP Signavio/i,
  /ready for SAP Signavio/i,
  /(?:designed for|for) (?:seamless |direct )?import into SAP Signavio/i,
  /hands the template to Signavio/i,
  /SAP Signavio \/ SAP Build compatible/i,
  /blueprints for Signavio/i,
  /process diagrams for SAP Signavio/i,
];

test('the list of surfaces is not empty', () => {
  expect(SURFACES.length).toBeGreaterThan(50);
});

for (const file of SURFACES) {
  test(file, () => {
    const text = fs.readFileSync(path.resolve(ROOT, file), 'utf8');
    if (!/Signavio/.test(text)) return;
    // Code comments may explain history; what renders may not promise.
    const visible = text
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
    for (const promise of PROMISES) expect(visible, `${file} still says ${promise}`).not.toMatch(promise);
    // Any sentence that puts Signavio next to "import" has to say it is not verified yet.
    for (const sentence of visible.split(/(?<=[.!?])\s+|\n/)) {
      if (/Signavio/.test(sentence) && /\bimport/i.test(sentence)) {
        expect(sentence, `${file}: "${sentence.trim().slice(0, 140)}"`).toMatch(/not (?:yet )?(?:been )?(?:verified|tested)|not yet verified/i);
      }
    }
  });
}
