import { test, expect } from '@playwright/test';
import { htmlToText } from '../lib/mail-text';
import { wrapEmailDocument } from '../lib/email-layout';

/**
 * The plain-text part of every product mail (`lib/mail-text.ts`, roadmap 3.0.9).
 *
 * Seed run 20260924-a, Microsoft 365: the welcome mail with a text part landed
 * in the inbox, the identical HTML and subject without one in spam. Every mail
 * now carries one, all from this converter — so it has to read correctly,
 * including the imprint a private copy used to print as "Hellerstra e 9".
 */
test.describe('htmlToText', () => {
  test('German letters and the usual entities come out as letters, named or numeric', () => {
    expect(htmlToText('<p>Hellerstra&szlig;e 9 &middot; 96047 Bamberg</p>')).toBe('Hellerstraße 9 · 96047 Bamberg');
    expect(htmlToText('<p>&Auml;&Ouml;&Uuml; &auml;&ouml;&uuml;</p>')).toBe('ÄÖÜ äöü');
    expect(htmlToText('<p>&#223; &#xDF; &#228;</p>')).toBe('ß ß ä');
    expect(htmlToText('<p>a &mdash; b &ndash; c &rarr; d &bull; e &hellip;</p>')).toBe('a — b – c -> d * e …');
    expect(htmlToText('<p>&ldquo;q&rdquo; &rsquo;s &#x27;t &quot;u&quot;</p>')).toBe('"q" \'s \'t "u"');
    // Raw UTF-8 passes through untouched.
    expect(htmlToText('<p>Hellerstraße</p>')).toBe('Hellerstraße');
  });

  test('entities are decoded once: escaped markup stays text, never becomes markup', () => {
    expect(htmlToText('<p>&amp;nbsp; &lt;script&gt;</p>')).toBe('&nbsp; <script>');
    // An entity nobody listed does not survive as `&name;`.
    expect(htmlToText('<p>x &weird; y</p>')).toBe('x y');
  });

  test('links keep their target, with the entities in the URL decoded', () => {
    expect(htmlToText('<p><a href="https://clean-core.io/a?x=1&amp;y=2" style="color:red">Open <b>it</b></a></p>'))
      .toBe('Open it (https://clean-core.io/a?x=1&y=2)');
  });

  test('markup indentation is not content; paragraphs, lines and list items are', () => {
    const html = `
      <h1>Title</h1>
      <p>First
         line of one paragraph.</p>
      <p>Second<br />line</p>
      <ul>
        <li>
          <strong>One:</strong> first
        </li>
        <li>Two</li>
      </ul>`;
    expect(htmlToText(html)).toBe('Title\n\nFirst line of one paragraph.\n\nSecond\nline\n\n- One: first\n- Two');
  });

  test('the document head, styles and comments are not in the text part', () => {
    const text = htmlToText(wrapEmailDocument('<!-- Card --><p>Body</p>', 'Document title'));
    expect(text).toBe('Body');
  });
});
