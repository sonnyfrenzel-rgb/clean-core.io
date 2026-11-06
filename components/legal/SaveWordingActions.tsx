'use client';

import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import { CONSENT_TEXTS, consentText } from '@/lib/legal/consent-texts';
import type { LegalLang } from '@/lib/legal/open-values';
import type { OfferedDocument, WordingFile } from '@/lib/legal/wording-file';

/**
 * "Als Datei speichern / Save as file" and "Drucken / Print" for the wording a
 * dialog offers (C1 sign-up, C2 amendment; § 312i Abs. 1 S. 1 Nr. 4 BGB, legal
 * review of 06.11.2026). The file is the archived wording itself
 * (`lib/legal/wording-file.ts`), so its SHA-256 is the hash value the record
 * and the confirmation name. Print opens the same text in a window of its own
 * and calls the browser's print dialog.
 *
 * The texts are loaded on the first click, not with the dialog. Labels come
 * from `CONSENT_TEXTS.saveWording` in the contract language the dialog shows.
 */

const ADDRESS: Record<OfferedDocument, Record<LegalLang, string>> = {
  terms: { de: 'clean-core.io/terms/de', en: 'clean-core.io/terms' },
  'byok-addendum': { de: 'clean-core.io/terms/byok-addendum/de', en: 'clean-core.io/terms/byok-addendum' },
};

const TITLE: Record<OfferedDocument, Record<LegalLang, string>> = {
  terms: { de: 'Nutzungsbedingungen', en: 'Terms of Service' },
  'byok-addendum': { de: 'Zusatzvereinbarung', en: 'Additional Agreement' },
};

async function load(documents: readonly OfferedDocument[], lang: LegalLang): Promise<WordingFile[]> {
  const { wordingFile } = await import('@/lib/legal/wording-file');
  return documents.map((d) => wordingFile(d, lang));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default function SaveWordingActions({ documents, lang }: { documents: readonly OfferedDocument[]; lang: LegalLang }) {
  const t = CONSENT_TEXTS.saveWording;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const save = async () => {
    setBusy(true);
    setFailed(false);
    try {
      for (const f of await load(documents, lang)) {
        const url = URL.createObjectURL(new Blob([f.text], { type: 'text/plain;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = f.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const print = async () => {
    // Opened inside the click, so no popup blocker stands in the way; filled once the text is there.
    const w = window.open('', '_blank');
    setBusy(true);
    setFailed(false);
    try {
      const files = await load(documents, lang);
      if (!w) throw new Error('no window');
      const body = files.map((f) => `<h1>${escapeHtml(f.title)}</h1><pre>${escapeHtml(f.text)}</pre>`).join('');
      w.document.write(
        `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${escapeHtml(files.map((f) => f.title).join(' / '))}</title>` +
          '<style>body{font-family:Arial,Helvetica,sans-serif;margin:24px}h1{font-size:16px}pre{white-space:pre-wrap;font-family:inherit;font-size:12px;line-height:1.45}</style>' +
          `</head><body>${body}</body></html>`,
      );
      w.document.close();
      w.focus();
      w.print();
    } catch {
      w?.close();
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const names = documents.map((d) => TITLE[d][lang]).join(lang === 'de' ? ' und ' : ' and ');
  return (
    <div className="mt-3 space-y-2" data-save-wording={documents.join(' ')} lang={lang}>
      <div className="flex flex-wrap gap-2">
        <CcButton density="compact" icon={<Download aria-hidden="true" />} onClick={() => void save()} disabled={busy} data-save-wording-file="">
          {consentText(t.save, lang)}
        </CcButton>
        <CcButton density="compact" icon={<Printer aria-hidden="true" />} onClick={() => void print()} disabled={busy} data-save-wording-print="">
          {consentText(t.print, lang)}
        </CcButton>
      </div>
      <p className="m-0 cc-text-cell text-cc-ink-muted">{consentText(t.hint, lang).replace('{Dokument}', names)}</p>
      {failed ? (
        <p className="m-0 cc-text-cell text-cc-error" role="status">
          {consentText(t.failed, lang).replace('{Adresse}', documents.map((d) => ADDRESS[d][lang]).join(', '))}
        </p>
      ) : null}
    </div>
  );
}
