import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  AI_TELL_BLOCKLIST,
  cleanModelText,
  findAiSymbolism,
  findBlockedPhrases,
  findMarkdownResidue,
  findStyleTells,
  inspectModelText,
  stripModelMarkdown,
  assertNoAiTells,
} from '../lib/model-text';
import { createGalleryAdmin, openGallery, type GalleryAdmin } from './helpers/cc-gallery';

/**
 * No AI tells — on the screen, in the exports, in the mails (`DESIGN.md` §3.1).
 *
 * The rule is not about tidiness. A page that reads like a chatbot devalues the
 * signed run standing next to it, and this audience is sceptical by trade: one
 * "Certainly!" above an evidence table costs more than the table earned.
 *
 * Two lists and they are not interchangeable (ADR-020):
 *
 *   - the **blocklist** fails this suite. Nine wordings, none of which is ever
 *     right in this product, in model output or in our own copy.
 *   - the **style list** does not, and `findStyleTells` is a separate function
 *     so it cannot be enforced by accident. "robust error handling" is correct
 *     ABAP English, and a guard that cannot tell filler from domain language
 *     and fails the build anyway is a guard people route around.
 *
 * The copy scan covers `app/`, `components/` and `lib/` — the scope §8 names.
 * The symbolism and emoji scan is narrower on purpose: it covers the surfaces
 * roadmap 1.5 built. Sweeping the emoji out of the 2.x dashboard is a change to
 * screens people use today, which this step does not touch.
 */
const ROOT = path.resolve(__dirname, '..');

test.describe('what the checker finds', () => {
  test('every blocklist phrase is found, in a sentence', () => {
    for (const phrase of AI_TELL_BLOCKLIST) {
      const text = `The engine read 668 lines. ${phrase} and the run is signed.`;
      const found = findBlockedPhrases(text);
      expect(found.map((f) => f.term.toLowerCase()), `"${phrase}" was not caught`).toContain(
        phrase.toLowerCase(),
      );
    }
  });

  test('and case does not save it', () => {
    expect(findBlockedPhrases('as an ai, I cannot').length).toBeGreaterThan(0);
    expect(findBlockedPhrases('AI-POWERED analysis').length).toBeGreaterThan(0);
  });

  test('but a word that merely contains one does not fire', () => {
    // "Certainly" without the exclamation mark is an adverb; the tell is the
    // exclamation. And "certainly not" in a sentence of ours has to survive.
    expect(findBlockedPhrases('That is certainly true of ABAP.')).toEqual([]);
    // "AI" as part of a longer word.
    expect(findBlockedPhrases('The CHAIN statement in ABAP.')).toEqual([]);
  });

  test('markdown residue is found where it is residue, and only there', () => {
    const modelish = [
      '**Business rules**',
      '## Findings',
      '- tolerance 5 %',
      'See `Z_MM_PO_TOP`',
      '```abap',
      '[the catalogue](https://example.invalid)',
      'line one\\nline two',
    ].join('\n');

    const kinds = new Set(findMarkdownResidue(modelish).map((f) => f.term.split(':')[0]));
    expect([...kinds].sort()).toEqual([
      'bold marker',
      'bullet marker',
      'code fence',
      'heading marker',
      'inline code',
      'literal newline escape',
      'markdown link',
    ]);

    // ABAP names full of underscores are not emphasis.
    expect(findMarkdownResidue('CALL FUNCTION Z_MM_PO_CHECK in Z_MM_PO_TOP.')).toEqual([]);
    // A percentage, a line anchor and an ID are not markdown.
    expect(findMarkdownResidue('Traceability 92 % at L412, finding CC-017.')).toEqual([]);
  });

  test('a markdown export is the one surface where markdown is not residue', () => {
    const text = '## Findings\n\n- **tolerance 5 %** at L412\n';
    expect(inspectModelText(text, 'markdown-export')).toEqual([]);
    expect(inspectModelText(text, 'screen').length).toBeGreaterThan(0);
    expect(inspectModelText(text, 'email').length).toBeGreaterThan(0);
    expect(inspectModelText(text, 'html-export').length).toBeGreaterThan(0);
    expect(inspectModelText(text, 'pdf-export').length).toBeGreaterThan(0);

    // A blocklist phrase is caught even in a Markdown file.
    expect(inspectModelText('## Note\n\nAs an AI, I cannot.', 'markdown-export').length).toBe(1);
  });

  test('stripping leaves text a person can read', () => {
    const before = [
      '## What this process does',
      '',
      'Approves **emergency orders** above the limit when the `tolerance` holds.',
      '',
      '- tolerance 5 % at L412',
      '- plant 1000 at L87',
      '',
      'See [the catalogue](https://example.invalid).',
    ].join('\n');

    const after = stripModelMarkdown(before);
    expect(after).toContain('What this process does');
    expect(after).toContain('emergency orders');
    expect(after).toContain('• tolerance 5 % at L412');
    expect(after).toContain('the catalogue (https://example.invalid)');
    expect(findMarkdownResidue(after), `residue survived:\n${after}`).toEqual([]);
  });

  test('stripping does not eat ABAP', () => {
    const abap = 'PERFORM check_limit USING lv_amount. Includes Z_MM_PO_TOP and Z_MM_PO_F01.';
    expect(stripModelMarkdown(abap)).toBe(abap);
  });

  test('the symbolism check catches the iconography, not the subject', () => {
    expect(findAiSymbolism('Ask AI about this case').length).toBeGreaterThan(0);
    expect(findAiSymbolism('✨ Generating…').length).toBeGreaterThan(0);
    expect(findAiSymbolism('Smart Analysis').length).toBeGreaterThan(0);
    expect(findAiSymbolism('A little magic here').length).toBeGreaterThan(0);
    // The product is allowed to name the model factually (§3.1, "Was bleibt").
    expect(findAiSymbolism('Model proposal — gemini-2.5-flash, 2026-09-15')).toEqual([]);
    expect(findAiSymbolism('Ask this case')).toEqual([]);
  });

  test('the style list reports and never enforces', () => {
    const text = 'Let us delve into this comprehensive and seamless solution. In conclusion, it is robust.';
    const style = findStyleTells(text);
    expect(style.length).toBeGreaterThan(3);
    // None of it reaches the enforcing path.
    expect(inspectModelText(text, 'screen')).toEqual([]);
    expect(() => assertNoAiTells(text, 'a style-only sentence')).not.toThrow();
    // Domain language stays in the report but stays out of the build.
    expect(findStyleTells('robust error handling').map((f) => f.term)).toContain('robust');
  });

  test('cleanModelText returns the clean text and what was wrong with it', () => {
    const { text, findings } = cleanModelText('## Note\n\nAs an AI, **I** cannot.', 'email');
    expect(text).toBe('Note\n\nAs an AI, I cannot.');
    expect(findings.some((f) => f.kind === 'blocklist')).toBe(true);
    expect(findings.some((f) => f.kind === 'markdown')).toBe(true);
  });

  test('assertNoAiTells throws where shipping the tell is worse than shipping nothing', () => {
    expect(() => assertNoAiTells('Great question! Here is the answer.', 'a subject line')).toThrow(
      /Great question/,
    );
    expect(() => assertNoAiTells('Emergency purchase approval', 'a subject line')).not.toThrow();
  });
});

test.describe('and what it finds in this repository', () => {
  /** Everything that ships to a browser, a file or a mailbox — DESIGN.md §8. */
  const DIRS = ['app', 'components', 'lib'];

  function productSources(): { rel: string; text: string }[] {
    const out: { rel: string; text: string }[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
          walk(full);
          continue;
        }
        if (!/\.(tsx|ts)$/.test(entry.name)) continue;
        out.push({
          rel: path.relative(ROOT, full).replace(/\\/g, '/'),
          text: fs.readFileSync(full, 'utf8'),
        });
      }
    };
    for (const dir of DIRS) walk(path.resolve(ROOT, dir));
    return out;
  }

  test('no blocklist wording anywhere in app/, components/ or lib/', () => {
    const files = productSources();
    expect(files.length, 'nothing scanned — the check would be vacuous').toBeGreaterThan(100);

    const offenders: string[] = [];
    for (const { rel, text } of files) {
      // `lib/model-text.ts` and this spec are where the list is written down.
      if (rel === 'lib/model-text.ts') continue;
      text.split('\n').forEach((line, i) => {
        for (const finding of findBlockedPhrases(line)) {
          offenders.push(`${rel}:${i + 1}  ${finding.term} — ${line.trim().slice(0, 110)}`);
        }
      });
    }

    expect(
      offenders,
      `AI tells in the product's own copy (DESIGN.md §3.1, blocklist):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  test('and no AI iconography in the surfaces roadmap 1.5 built', () => {
    const offenders: string[] = [];
    for (const { rel, text } of productSources()) {
      if (!rel.startsWith('components/cc/') && !rel.includes('admin/design-system')) continue;
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      code.split('\n').forEach((line, i) => {
        for (const finding of findAiSymbolism(line)) {
          offenders.push(`${rel}:${i + 1}  ${finding.term} — ${line.trim().slice(0, 110)}`);
        }
      });
    }
    expect(
      offenders,
      `sparkles, robots, "magic" or "Smart …" in the new interface (DESIGN.md §3.1):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

test.describe('and what reaches the screen', () => {
  let admin: GalleryAdmin;

  test.beforeAll(async () => {
    admin = await createGalleryAdmin('ccmodeltext');
  });

  test('the rendered page carries no markdown residue, no tell and no emoji', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    // The "* required" note of §2.7 is an asterisk at the start of a line, which
    // is also what a Markdown bullet looks like. It is the one element read out
    // of the scan, and it is read out by identity rather than by pattern so the
    // exemption cannot widen.
    const rendered = await page.locator('[data-cc-gallery]').evaluate((root) => {
      const clone = root.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[data-cc-required-note]').forEach((el) => el.remove());
      document.body.appendChild(clone);
      const text = clone.innerText;
      clone.remove();
      return text;
    });
    expect(rendered.length, 'nothing rendered — the scan would be vacuous').toBeGreaterThan(500);

    const findings = [
      ...findBlockedPhrases(rendered),
      ...findAiSymbolism(rendered),
      ...findMarkdownResidue(rendered),
    ];

    expect(
      findings.map((f) => `${f.kind}: ${f.term} — ${f.excerpt}`),
      'AI tells on the rendered page (DESIGN.md §3.1)',
    ).toEqual([]);
  });
});
