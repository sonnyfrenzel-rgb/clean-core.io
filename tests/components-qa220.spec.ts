/**
 * QA full review of v2.20.0 — the component findings (slice D), held at the
 * source. Pure reading: no server, no browser. The rendered behaviour of the
 * modal and focus fixes is the library's (`components/cc/modal.ts`, covered by
 * `cc-style-guard` and `cc-d31-addenda`); what is held here is that each
 * component now uses it, and that each corrected sentence stays corrected.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/** Source without comments, so a comment quoting the old defect cannot satisfy or fail a check. */
const code = (rel: string) =>
  read(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test.describe('accessibility', () => {
  test('0cd9ce52108b · a collapsed accordion body is inert', () => {
    expect(code('components/CollapsibleAccordion.tsx')).toMatch(/ref=\{contentRef\}\s*inert=\{!isOpen\}/);
  });

  test('652b3a1b4907 · a collapsed FAQ answer is inert, and still in the HTML', () => {
    const src = code('components/KnowledgeClient.tsx');
    expect(src).toMatch(/id=\{`faq-answer-\$\{i\}`\}\s*inert=\{!isActive\}/);
    // Rendered unconditionally — the crawler reason in the component still holds.
    expect(src).not.toMatch(/isActive\s*&&\s*\(\s*<p/);
  });

  test('0a3321f70e07 · the invitation dialog is modal and its field is labelled', () => {
    // Since D.23b the dialog is a CcDialog: the library holds the modality the
    // fix added by hand (portal to body, focus to the first field, Escape,
    // inert page), and CcField ties the label to the input.
    const src = code('components/InviteReaderDialog.tsx');
    expect(src).toMatch(/<CcDialog\s+open\s+data-invite-dialog=""\s+title="Invite someone to read this project"/);
    expect(src).toMatch(/<CcField\s+label="Email address"/);
    expect(src).toMatch(/id=\{control\.id\}\s*data-invite-email/);
    const dialog = code('components/cc/Dialog.tsx');
    expect(dialog).toMatch(/useCcModal<HTMLDivElement>\(\{\s*open: shown,[\s\S]{0,80}initialFocus: 'first-field',/);
    expect(dialog).toContain('createPortal(');
    expect(code('components/cc/Field.tsx')).toMatch(/<label htmlFor=\{id\}/);
  });

  test('ff8ea3bf638e · the sign-in overlay is a modal dialog', () => {
    // Since D.27 the access dialog is one CcDialog: the library holds what the
    // fix added by hand — portal to body, focus held, page inert, Escape.
    const src = code('components/LandingModals.tsx');
    expect(src).toMatch(/<CcDialog open=\{!!authParam\} onClose=\{closeAuthModal\}/);
    const dialog = code('components/cc/Dialog.tsx');
    expect(dialog).toMatch(/useCcModal<HTMLDivElement>\(\{\s*open: shown,/);
    expect(dialog).toContain('createPortal(');
    expect(dialog).toMatch(/role="dialog"/);
    expect(dialog).toMatch(/aria-modal="true"/);
  });

  test('6334d1944a89 · both consent boxes show the keyboard focus', () => {
    // Since D.27 both are CcCheckbox: the input itself is the painted square
    // (`appearance-none`, not `sr-only`), so the focus ring lands on it.
    const src = code('components/LandingModals.tsx');
    expect(src.match(/<CcCheckbox\s+checked=\{agreed(GDPR|Terms)\}/g)?.length).toBe(2);
    expect(src).not.toMatch(/className="(peer )?sr-only"/);
    const box = code('components/cc/Checkbox.tsx');
    expect(box).toMatch(/'peer m-0 size-4 shrink-0 cursor-pointer appearance-none/);
    expect(box).not.toContain('sr-only');
  });

  test('9d4a841bcb58 · pointer and focus hold the three-views stage separately', () => {
    const src = code('components/workspace/ThreeViewsStage.tsx');
    expect(src).toContain('const held = pointerIn || focusIn;');
    expect(src).not.toContain('setHeld(');
    expect(src).toContain('onMouseLeave={() => setPointerIn(false)}');
    expect(src).toMatch(/onBlurCapture=\{\(event\) => \{\s*if \(!event\.currentTarget\.contains\(event\.relatedTarget/);
  });

  test('529a93ab1a60 · the search field names the active option', () => {
    const src = code('components/workspace/CommandSearch.tsx');
    expect(src).toContain('aria-activedescendant={shown.length > 0 ? `${listId}-option-${at}` : undefined}');
    expect(src).toMatch(/id=\{`\$\{listId\}-option-\$\{i\}`\}\s*role="option"/);
  });

  test('0050e1b8e1c0 · a glossary term is described by its explanation', () => {
    expect(code('components/workspace/GlossaryText.tsx')).toContain('aria-describedby={open ? id : undefined}');
    // The desktop term had the same gap (QA slice review of 97c740cc5e71, d65581573fa9).
    expect(code('components/GlossaryTerm.tsx')).toContain('aria-describedby={open ? id : undefined}');
  });
});

test.describe('state and ordering', () => {
  test('0f6a3df6322d · the assistant reads the case afresh on each opening', () => {
    const src = code('components/GlossaryChatbot.tsx');
    expect(src).toMatch(/if \(!isOpen \|\| !projectId\) return;\s*caseContextRef\.current = null;\s*void ensureCase\(projectId\);/);
  });

  test('f7d0c940e9ab · an answer for a project the reader has left is dropped', () => {
    const src = code('components/GlossaryChatbot.tsx');
    const helper = src.slice(src.indexOf('const answerInProject'), src.indexOf('const handleSend'));
    // After each wait — the evidence read and the model call — before anything is said.
    // The check also drops an answer for an earlier conversation in the same
    // project (2b1101d8e13e), so it is `moved()` rather than the bare comparison.
    expect(helper).toContain('const moved = () => currentProjectRef.current !== id ||');
    expect(helper.match(/if \(moved\(\)\) return;/g)?.length).toBe(2);
    const send = src.slice(src.indexOf('const handleSend'));
    expect(send).toMatch(/console\.error\('Ask this case error:', error\);\s*if \(currentProjectRef\.current !== projectId \|\| superseded\(\)\) return;/);
    expect(send).toMatch(/callGemini\(promptContext[^;]*;\s*if \(currentProjectRef\.current !== null \|\| superseded\(\)\) return;/);
  });

  test('e62f8d0d8462 · an older diagram render does not overwrite a newer one', () => {
    const src = code('components/MermaidDiagram.tsx');
    expect(src.match(/if \(!current\) return;/g)?.length).toBe(2);
    expect(src).toMatch(/return \(\) => \{\s*current = false;\s*\};\s*\}, \[chart\]\);/);
  });

  test('425e26a4bb6a · a lost registration request does not fail a created account', () => {
    const src = code('components/LandingModals.tsx');
    const signUp = src.slice(src.indexOf('const handleEmailSignUp'), src.indexOf('const handleForgotPassword'));
    const at = signUp.indexOf("doc(db, 'registration_requests'");
    expect(at).toBeGreaterThan(-1);
    // The write sits in its own try, so its failure does not reach the outer
    // catch that says "Error creating account".
    expect(signUp.slice(0, at)).toMatch(/try \{\s*await setDoc\($/);
    expect(signUp.slice(at)).toMatch(/\} catch \(requestErr\) \{/);
  });

  test('fb1e68560471 · the one-shot read never replaces a snapshot', () => {
    const src = code('components/workspace/WorkspaceListReport.tsx');
    expect(src).toMatch(/\.then\(\(snap\) => \{\s*if \(!live\) take\(snap\.docs\);/);
    expect(src).toMatch(/\(snap\) => \{\s*live = true;\s*take\(snap\.docs\);/);
  });

  test('1db57c2cad09 · rows are shown only to the account that loaded them', () => {
    const src = code('components/workspace/WorkspaceListReport.tsx');
    expect(src).toContain('loaded && user && loaded.uid === user.uid ? loaded.rows : []');
    expect(src).not.toContain('setProjects(');
  });

  test('3bf8bc233c2a · one run per project, and only its owner writes the row', () => {
    const src = code('components/workspace/WorkspaceListReport.tsx');
    const start = src.slice(src.indexOf('const start = useCallback'), src.indexOf('const cancel = useCallback'));
    const guard = start.indexOf('if (controllers.current[row.id]) return;');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(start.indexOf('await runAnalysis('));
    expect(start).toContain('const owns = () => controllers.current[row.id] === controller;');
    expect(start).toMatch(/finally \{\s*if \(owns\(\)\) delete controllers\.current\[row\.id\];/);
  });

  test('e35ce9bfd5a7 · leaving the list aborts the analyses it started', () => {
    const src = code('components/workspace/WorkspaceListReport.tsx');
    expect(src).toMatch(/for \(const controller of Object\.values\(running\)\) controller\.abort\(\);/);
  });
});

test.describe('what the text claims', () => {
  test('466ee776bd93 · inside a project the panel names the glossary exception', () => {
    const src = code('components/GlossaryChatbot.tsx');
    expect(src).not.toContain('It has no other source.');
    expect(src).not.toContain("'Evidence of this project only'");
    // The phrase the rendered specs hold (`ask-this-case`, `assistant-label`) stays.
    expect(src).toContain('answers only from the evidence of this project');
    expect(src).toContain('The one exception is a glossary term');
  });

  test('7a1420fddf6f / 26f0dd34e27d · the visible FAQ says what its structured data says', () => {
    const visible = read('components/KnowledgeClient.tsx');
    const page = read('app/(app)/knowledge/page.tsx');
    expect(visible).not.toMatch(/upgrade their core ERP system instantly/);
    expect(visible).not.toMatch(/Clean-Core\.io configures secure tunnels/);
    // Every question on both lists carries the same answer on both: the
    // FAQPage JSON-LD is built from the page's copy, the reader sees this one.
    // Double-quoted or template literals: the SAP BTP naming (roadmap 3.0.15) turned
    // the entries that name the platform into templates over the shared constant.
    const pairs = (src: string) =>
      new Map(
        [...src.matchAll(/question:\s*(["`])((?:(?!\1)[^\\]|\\.)+)\1,\s*answer:\s*(["`])((?:(?!\3)[^\\]|\\.)*)\3/g)].map((m) => [m[2], m[4]]),
      );
    const shown = pairs(visible);
    const structured = pairs(page);
    const shared = [...shown.keys()].filter((q) => structured.has(q));
    expect(shared.length).toBeGreaterThanOrEqual(4);
    for (const q of shared) expect(shown.get(q), q).toBe(structured.get(q));
  });

  test('2cf1897568e5 / bef1c6f1a097 / 709ec093f58f / 3120a2e48677 · the privacy summaries match the policy', () => {
    const src = code('components/LandingModals.tsx');
    // Both overlays name the second sign-in path, as /datenschutz does.
    expect(src.match(/Email and password \(Firebase Auth\):/g)?.length).toBe(2);
    expect(src).not.toMatch(/fully GDPR-compliant/);
    expect(src).not.toMatch(/instantly wipe/);
    expect(src).toContain('Residual copies in encrypted backups age out within 30 days');
    expect(src).not.toMatch(/to the Google Gemini API for analysis and transformation/);
  });

  test('ea12e4b9a418 · a section that fails to render is not blamed on old data', () => {
    expect(code('components/SectionBoundary.tsx')).not.toMatch(/older analysis run/);
  });

  // 773b0c7c8e87 and 5c514527ae4e held the wording of SamplePackageDownload and
  // TransformationShowroom. 3.0.6 removed both components; claims-honesty-guard
  // (fa9e39148077) now holds that they stay gone.
});
