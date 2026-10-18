/**
 * Whether a source is, byte for byte, one of the starter examples Clean-Core.io
 * ships — the product's own, known text.
 *
 * Roadmap 3.0.15 (4), carried into 3.0.17 (4), owner 16.10.2026: *"ein Beispiel
 * mit PII ergibt wenig Sinn und schreckt User ab"*. The 1,000-line example warned
 * its reader about its own fictional sender address. The personal-data hint is
 * there so a person can look at **their** lines before they leave the browser;
 * an unchanged shipped example has no lines of theirs in it. So a source whose
 * fingerprint is one of those below skips the hint — and the moment a single
 * character beyond the normalisation changes, the fingerprint no longer matches
 * and the hint behaves exactly as for any upload.
 *
 * This says nothing about what an example contains. It recognises *which text*
 * this is, never whether personal data is in it (`components/PersonalDataHints.tsx`).
 *
 * **The normalisation, and why it is this and no more.** Before hashing:
 *  - a leading byte-order mark is dropped (one file has one; `Response.text()`
 *    drops it too),
 *  - CRLF and lone CR become LF (git checks these files out with CRLF on Windows
 *    and LF on Linux; a download, a paste or a Windows editor flips them again),
 *  - spaces and tabs at the end of a line are dropped (two files carry some,
 *    and editors and paste targets routinely strip them),
 *  - newlines at the very end are dropped (a paste usually loses the last one).
 * Each of these is a transport artefact, and none of them can put a value into
 * the text: whitespace at a line end and line-break bytes cannot spell an
 * address, a name or a number. Everything else — a letter, a digit, a space
 * inside a line, a new line in the middle — changes the fingerprint. The
 * normalisation is what lets the fingerprints be committed constants: without
 * it they would be right on one checkout and silently wrong on the other
 * (the reason `lib/starter-example-fingerprints.ts` computes its own at runtime).
 *
 * **Why committed constants, and why they cannot drift.** The hint runs in the
 * browser, which has no file system and should not fetch every example file to answer
 * one question. `tests/shipped-example-fingerprint.spec.ts` recomputes every
 * fingerprint from `public/starter-examples/` and from the registry in
 * `lib/starter-examples.ts`, and fails on any stale, missing or extra entry —
 * so an edited example fails the suite instead of quietly losing its exemption
 * (or keeping an old one).
 *
 * Synchronous: `sha256Hex` is the pure SHA-256 the phase contract already uses
 * in render, so this can sit in a `useMemo` beside the hint scan.
 */

import { sha256Hex } from './artefact-digest';

/** The text as the fingerprint sees it — see the list above. */
export function normaliseShippedExampleSource(text: string): string {
  return text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/, '');
}

/** SHA-256 (lowercase hex) of the normalised text. */
export function shippedExampleFingerprint(text: string): string {
  return sha256Hex(normaliseShippedExampleSource(text));
}

/**
 * File in `public/starter-examples/` → fingerprint of its normalised text.
 * Generated; `tests/shipped-example-fingerprint.spec.ts` recomputes it from the
 * files and prints the replacement when an entry is stale.
 */
export const SHIPPED_EXAMPLE_FINGERPRINTS: Readonly<Record<string, string>> = {
  'Z_MATERIAL_STOCK_CALC.txt': '7458e42f60d98b3cc74965327c29431a93740a3310f067a5c511a916053152f9',
  'Z_INVOICE_EXTRACTOR.txt': 'd10af353012a41a9b8f55fcb54840c23fedfb5a9c18b5a521c3143869ba822a2',
  'Z_SALES_ORDER_CREATOR.txt': '30356090dd42381d54d5e0128feb13b1fe51e0fd6d88e107fe7a18393c1124d3',
  'Z_MM_PO_APPROVAL.abap': 'b450a595d2277970b40e5bc6acc6b6c9ba5ade9d4e2b4debe55583cd0f1a8571',
  'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap': '99d2a34237bd30d92c2491849b8909fb2c8ffa7c492bd4a6831da17b924e3076',
  'Z_SD_FREIGHT_RATE_CHECK.abap': '9431c7aba7e2aecdc0086b5831de1055d30f53b78ec05ae78b115cdd9de8570e',
};

const KNOWN = new Set(Object.values(SHIPPED_EXAMPLE_FINGERPRINTS));

/**
 * True only for the unchanged text of a shipped starter example. Anything the
 * reader wrote, and any example they changed a character of, is false — and
 * gets the personal-data hint like every other source.
 */
export function isUnchangedShippedExample(text: string): boolean {
  if (!text) return false;
  return KNOWN.has(shippedExampleFingerprint(text));
}
