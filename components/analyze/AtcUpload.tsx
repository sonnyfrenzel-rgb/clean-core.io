'use client';

import { useState, useRef, useCallback } from 'react';
import { FileSpreadsheet, AlertTriangle, Info } from 'lucide-react';
import type { AtcReport } from '@/lib/abap/atc-model';
import { formatIsoDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import CcButton from '@/components/cc/Button';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcTable from '@/components/cc/Table';
import { CcTag } from '@/components/cc/Tag';
import { ATC_PRIVACY_NOTICE } from '@/lib/abap/atc-privacy';
import {
  personalDataHintKey,
  scanForPersonalDataHints,
  type PersonalDataHint,
} from '@/lib/personal-data-hints';
import PersonalDataHints from '@/components/PersonalDataHints';

interface AtcUploadProps {
  /** Resolves once the server has stored the report; rejects when it did not. */
  onImport: (report: AtcReport) => Promise<void>;
  existingReport?: AtcReport | null;
}

const PREVIEW_ROWS = 25;

/**
 * How much of the file is looked at for shapes that often indicate personal
 * data — same ceiling `UsageUpload.tsx` uses, for the same reason: the heading
 * row is what matters most and it stands at the top of the file.
 */
const HINT_SCAN_BYTES = 512 * 1024;
const TEXT_FILE = /\.(csv|tsv|txt)$/i;
const NOT_TEXT_NOTE =
  'This file is not plain text — a spreadsheet is a compressed archive — so nothing here has read it. ' +
  'An ATC worklist export names who wrote or last reviewed each finding by construction, which makes it ' +
  'as likely as the usage export to carry personal data. Open it yourself before you import it.';

const PRIORITY_LABEL: Record<string, string> = { error: 'Error', warning: 'Warning', info: 'Info', unknown: 'Unknown' };
const PRIORITY_ORDER: Record<string, number> = { error: 0, warning: 1, info: 2, unknown: 3 };

/**
 * Two steps, and only the second saves — the same discipline `UsageUpload`
 * uses: look at what the parser made of the file, including every row it
 * refused and why, then confirm. Unlike the usage import, an ATC worklist
 * needs no declared source, date format or monitoring window: a check result
 * is a fact about the moment it ran, not a time series.
 */
export default function AtcUpload({ onImport, existingReport }: AtcUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AtcReport | null>(null);
  const [imported, setImported] = useState<AtcReport | null>(existingReport || null);
  // The save is the server's: "imported" is shown once it answered yes, and a
  // refusal keeps the preview, so the reader can retry (carried QA finding 0817087d54b5).
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readSeq = useRef(0);
  const [hintScan, setHintScan] = useState<{
    hints: PersonalDataHint[];
    unreadable: string | null;
    name: string;
  } | null>(null);
  const [hintAckFor, setHintAckFor] = useState('');
  const hintSeq = useRef(0);

  const read = useCallback(async (f: File) => {
    const seq = ++readSeq.current;
    setError(null);
    setParsing(true);
    try {
      const { parseAtc } = await import('@/lib/abap/atc-parser');
      const report = await parseAtc(f);
      if (seq === readSeq.current) setPreview(report);
    } catch (err) {
      if (seq === readSeq.current) {
        setPreview(null);
        setError(err instanceof Error ? err.message : 'Failed to parse ATC worklist file.');
      }
    } finally {
      if (seq === readSeq.current) setParsing(false);
    }
  }, []);

  const inspect = useCallback(async (f: File) => {
    const seq = ++hintSeq.current;
    if (!TEXT_FILE.test(f.name) && !f.type.startsWith('text/')) {
      setHintScan({ hints: [], unreadable: NOT_TEXT_NOTE, name: f.name });
      return;
    }
    try {
      const text = await f.slice(0, HINT_SCAN_BYTES).text();
      if (seq !== hintSeq.current) return;
      setHintScan({ hints: scanForPersonalDataHints(text), unreadable: null, name: f.name });
    } catch {
      if (seq !== hintSeq.current) return;
      setHintScan({ hints: [], unreadable: NOT_TEXT_NOTE, name: f.name });
    }
  }, []);

  const choose = (f: File) => {
    setFile(f);
    setHintScan(null);
    setHintAckFor('');
    void read(f);
    void inspect(f);
  };

  const hints = hintScan?.hints ?? [];
  const hintUnreadable = hintScan?.unreadable ?? null;
  const hintKey = hintUnreadable ? `unreadable:${hintScan?.name ?? ''}` : personalDataHintKey(hints);
  const hintAcknowledged = hintKey !== '' && hintAckFor === hintKey;
  const hintPending = (hints.length > 0 || !!hintUnreadable) && !hintAcknowledged;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) choose(dropped);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    if (chosen) choose(chosen);
  };

  const confirmImport = async () => {
    if (!preview || hintPending || saving) return;
    readSeq.current++;
    setSaving(true);
    setSaveError(null);
    try {
      await onImport(preview);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'The server did not store the ATC results.');
      return;
    } finally {
      setSaving(false);
    }
    setImported(preview);
    setPreview(null);
    setFile(null);
    setHintScan(null);
    setHintAckFor('');
  };

  const startOver = () => {
    readSeq.current++;
    hintSeq.current++;
    setSaveError(null);
    setImported(null);
    setPreview(null);
    setFile(null);
    setError(null);
    setParsing(false);
    setHintScan(null);
    setHintAckFor('');
  };

  // ── Imported ────────────────────────────────────────────────────────
  if (imported && !file) {
    const counts = priorityCounts(imported);
    return (
      <div data-atc-imported="">
        <CcMessageStrip
          state="information"
          headline={`ATC results imported — ${imported.findings.length} findings, as reported by ATC.`}
          actions={<CcButton variant="ghost" onClick={startOver}>Replace</CcButton>}
        >
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {(['error', 'warning', 'info', 'unknown'] as const)
              .filter((p) => counts[p] > 0)
              .map((p) => (
                <span key={p}>{counts[p]} {PRIORITY_LABEL[p]}</span>
              ))}
            {imported.quarantined && imported.quarantined.length > 0 && (
              <span>{imported.quarantined.length} rows rejected</span>
            )}
            <span>Imported <span className="font-cc-mono">{formatIsoDate(imported.importedAt) ?? 'date not recorded'}</span></span>
          </span>
          <Warnings warnings={imported.warnings} />
        </CcMessageStrip>
      </div>
    );
  }

  // ── Drop ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        data-atc-dropzone={isDragging ? 'dragging' : 'idle'}
        className={cn(
          'flex flex-col items-center gap-2 rounded-cc-card border-2 border-dashed p-6 text-center',
          isDragging ? 'border-cc-ink bg-cc-surface-muted' : 'border-cc-field-border bg-cc-surface',
          parsing && 'opacity-60',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.tsv,.txt"
          onChange={handleFileInput}
          data-atc-file
          className="hidden"
        />
        <FileSpreadsheet size={32} aria-hidden={true} className="text-cc-ink-muted" />
        <p className="cc-text-h3 text-cc-ink" aria-live="polite">
          {parsing ? 'Reading ATC worklist…' : file ? `${file.name} — drop another file to replace it` : 'Drop ATC worklist export here'}
        </p>
        <p className="cc-text-meta text-cc-ink-muted">
          CSV/TSV (from SAP GUI &quot;Local File&quot;) or XLSX (from ADT export) · nothing is stored until you confirm
        </p>
        <CcButton
          variant="secondary"
          busy={parsing}
          icon={<FileSpreadsheet size={16} aria-hidden={true} />}
          onClick={() => fileInputRef.current?.click()}
        >
          {file ? 'Choose another file' : 'Choose a file'}
        </CcButton>
      </div>

      {error && (
        <CcMessageStrip
          state="error"
          headline="Import failed."
          announce
          actions={<CcButton variant="ghost" onClick={() => fileInputRef.current?.click()}>Choose another file</CcButton>}
        >
          {error}
        </CcMessageStrip>
      )}

      {file && (
        <PersonalDataHints
          id="atc-personal-data"
          hints={hints}
          unreadableNote={hintUnreadable}
          acknowledged={hintAcknowledged}
          onAcknowledge={(next) => setHintAckFor(next ? hintKey : '')}
        />
      )}

      {preview && !error && (
        <div className="space-y-3 rounded-cc-card border border-cc-line bg-cc-surface p-4" data-atc-preview>
          <p className="cc-text-h3 text-cc-ink">
            Preview: {preview.findings.length} findings would be imported, as reported by ATC
            {preview.quarantined && preview.quarantined.length > 0 && (
              <span className="text-cc-error"> · {preview.quarantined.length} rows rejected</span>
            )}
          </p>
          <Warnings warnings={preview.warnings} />

          {preview.quarantined && preview.quarantined.length > 0 && (
            <div className="space-y-2" data-atc-quarantine>
              <p className="cc-text-label text-cc-ink-muted">Rejected rows — not imported, not compared with the engine</p>
              <CcTable
                caption="Rejected rows"
                limit={5}
                columns={[
                  { key: 'row', label: 'Row', numeric: true, width: '80px' },
                  { key: 'object', label: 'Object' },
                  { key: 'reason', label: 'Reason' },
                ]}
                rows={preview.quarantined.slice(0, PREVIEW_ROWS).map((q) => ({
                  key: String(q.row),
                  cells: {
                    row: <span className="font-cc-mono">{q.row}</span>,
                    object: <span className="font-cc-mono">{q.objectName}</span>,
                    reason: q.reason,
                  },
                }))}
              />
              {preview.quarantined.length > PREVIEW_ROWS && (
                <p className="cc-text-meta text-cc-ink-muted">
                  …and {preview.quarantined.length - PREVIEW_ROWS} more. All are kept with the import.
                </p>
              )}
            </div>
          )}

          {preview.findings.length > 0 && (
            <div className="space-y-2">
              <p className="cc-text-label text-cc-ink-muted">
                First {Math.min(PREVIEW_ROWS, preview.findings.length)} findings, as ATC reported them
              </p>
              <CcTable
                caption="Findings, as ATC reported them"
                limit={5}
                columns={[
                  { key: 'priority', label: 'ATC priority', width: '120px' },
                  { key: 'object', label: 'Object' },
                  { key: 'message', label: 'Message' },
                ]}
                rows={[...preview.findings]
                  .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
                  .slice(0, PREVIEW_ROWS)
                  .map((f, i) => ({
                    key: String(i),
                    cells: {
                      priority: <CcTag>{PRIORITY_LABEL[f.priority]}</CcTag>,
                      object: <span className="font-cc-mono">{f.objectName}</span>,
                      message: f.message,
                    },
                  }))}
              />
            </div>
          )}

          {saveError && (
            <div data-atc-save-error="">
              <CcMessageStrip state="error" headline="Not imported — the server did not confirm the save of the ATC results." announce>
                {saveError}
              </CcMessageStrip>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <CcButton
              variant="primary"
              onClick={() => void confirmImport()}
              busy={saving}
              disabled={preview.findings.length === 0 || hintPending}
              data-atc-confirm
            >
              Import {preview.findings.length} findings
            </CcButton>
            <CcButton variant="ghost" onClick={startOver}>
              Cancel
            </CcButton>
            {hintPending && (
              <span data-atc-personal-data-pending className="cc-text-meta text-cc-warning">
                Tick the box above to say you have checked this file. Nothing has been imported yet.
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 cc-text-meta text-cc-ink-muted">
        <Info size={14} aria-hidden={true} className="mt-0.5 shrink-0" />
        <p>{ATC_PRIVACY_NOTICE}</p>
      </div>
    </div>
  );
}

function priorityCounts(report: AtcReport): Record<string, number> {
  const counts: Record<string, number> = { error: 0, warning: 0, info: 0, unknown: 0 };
  for (const f of report.findings) counts[f.priority] = (counts[f.priority] ?? 0) + 1;
  return counts;
}

function Warnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1" data-import-warnings="">
      {warnings.map((w, i) => (
        <li key={i} className="flex items-start gap-2 cc-text-meta text-cc-warning">
          <AlertTriangle size={14} aria-hidden={true} className="mt-0.5 shrink-0" />
          <span>{w}</span>
        </li>
      ))}
    </ul>
  );
}
