'use client';

import { useState, useRef, useCallback } from 'react';
import { FileSpreadsheet, AlertTriangle, Info } from 'lucide-react';
import type { UsageSource, UsageReport, UsageDateLocale } from '@/lib/abap/usage-model';
import { formatIsoDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import CcButton from '@/components/cc/Button';
import CcField from '@/components/cc/Field';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcTable from '@/components/cc/Table';
import { PRIVACY_NOTICE } from '@/lib/abap/usage-privacy';
import {
  personalDataHintKey,
  scanForPersonalDataHints,
  type PersonalDataHint,
} from '@/lib/personal-data-hints';
import PersonalDataHints from '@/components/PersonalDataHints';

interface UsageUploadProps {
  /** Resolves once the server has stored the report; rejects when it did not. */
  onImport: (report: UsageReport) => Promise<void>;
  existingReport?: UsageReport | null;
}

const SOURCE_OPTIONS: { value: UsageSource | 'auto'; label: string; description: string }[] = [
  { value: 'auto', label: 'Auto-detect', description: 'Detect source format automatically from headers' },
  { value: 'scmon', label: 'SCMON', description: 'Custom Code Migration Worklist / ABAP Call Monitor' },
  { value: 'upl', label: 'UPL', description: 'Usage & Procedure Logging (procedure-level)' },
  { value: 'st03n', label: 'ST03N', description: 'Workload Statistics (transaction-level)' },
];

/**
 * Declared, not guessed (roadmap E03-F02). `05.04.2026` is 5 April in a German
 * export and 4 May in an American one, and nothing in the file says which. The
 * parser used to let the JavaScript engine decide — month first — and then lost
 * another day to the time zone.
 */
const DATE_OPTIONS: { value: UsageDateLocale | ''; label: string }[] = [
  { value: '', label: 'Declare the date format…' },
  { value: 'de-DE', label: 'DD.MM.YYYY — German (de-DE)' },
  { value: 'en-GB', label: 'DD/MM/YYYY — British (en-GB)' },
  { value: 'en-US', label: 'MM/DD/YYYY — American (en-US)' },
  { value: 'iso', label: 'YYYY-MM-DD only (ISO)' },
];

const PREVIEW_ROWS = 25;

/**
 * How much of the file is looked at for shapes that often indicate personal
 * data. A usage export can be tens of megabytes, and a heading row — the thing
 * that matters most here — stands at the top of it.
 */
const HINT_SCAN_BYTES = 512 * 1024;
/** What can be read as text at all. An `.xlsx` is a compressed archive. */
const TEXT_FILE = /\.(csv|tsv|txt)$/i;
const NOT_TEXT_NOTE =
  'This file is not plain text — a spreadsheet is a compressed archive — so nothing here has read it. ' +
  'An SAP usage export names the user who ran each object by construction, which makes it the most likely ' +
  'of all the uploads to carry personal data. Open it yourself before you import it.';

/**
 * Three steps, and only the last one saves: declare what the export is (source,
 * date format, monitoring window), look at what the parser made of it — including
 * every row it refused and why — and then confirm. It used to parse and store in
 * one go, so a bad row influenced the prioritisation before anyone saw it.
 */
interface Declared {
  source: UsageSource | 'auto';
  dateLocale: UsageDateLocale | '';
  windowFrom: string;
  windowTo: string;
}

export default function UsageUpload({ onImport, existingReport }: UsageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [declared, setDeclared] = useState<Declared>({ source: 'auto', dateLocale: '', windowFrom: '', windowTo: '' });
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<UsageReport | null>(null);
  const [imported, setImported] = useState<UsageReport | null>(existingReport || null);
  // The save is the server's: "imported" is shown once it answered yes, and a
  // refusal keeps the preview, so the reader can retry (carried QA finding 0817087d54b5).
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // A later read supersedes an earlier one still in flight.
  const readSeq = useRef(0);
  /**
   * What the last look at the dropped file found, and the acknowledgement that
   * belongs to it. Held as the findings' own key rather than as a boolean, so
   * dropping a second file cannot inherit the tick made for the first one
   * (`lib/personal-data-hints.ts`).
   */
  const [hintScan, setHintScan] = useState<{
    hints: PersonalDataHint[];
    unreadable: string | null;
    name: string;
  } | null>(null);
  const [hintAckFor, setHintAckFor] = useState('');
  const hintSeq = useRef(0);

  // Read the file under what is currently declared. Called again whenever the
  // file or a declaration changes, so a corrected date format or window shows
  // its effect in the preview before anything is stored.
  const read = useCallback(async (f: File, d: Declared) => {
    const seq = ++readSeq.current;
    setError(null);
    setParsing(true);
    try {
      const { parseUsage } = await import('@/lib/abap/usage-parser');
      const report = await parseUsage(f, {
        source: d.source === 'auto' ? undefined : d.source,
        dateLocale: d.dateLocale || undefined,
        window: d.windowFrom && d.windowTo ? { from: d.windowFrom, to: d.windowTo } : undefined,
      });
      if (seq === readSeq.current) setPreview(report);
    } catch (err) {
      if (seq === readSeq.current) {
        setPreview(null);
        setError(err instanceof Error ? err.message : 'Failed to parse usage file.');
      }
    } finally {
      if (seq === readSeq.current) setParsing(false);
    }
  }, []);

  const declare = (patch: Partial<Declared>) => {
    const next = { ...declared, ...patch };
    setDeclared(next);
    if (file) void read(file, next);
  };

  /**
   * A look at the file itself, beside the parse.
   *
   * It reads the text, not the parsed records: `sanitizeUsageRecords` drops the
   * person-identifying columns on the way in, which is right for what gets
   * stored and wrong for this question. What the person has to decide is
   * whether to hand over the *file*, and the columns the parser is about to
   * throw away are exactly the ones worth seeing first.
   */
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
    void read(f, declared);
    void inspect(f);
  };

  const { source: selectedSource, dateLocale, windowFrom, windowTo } = declared;

  const hints = hintScan?.hints ?? [];
  const hintUnreadable = hintScan?.unreadable ?? null;
  // Not being able to read a file is its own thing to acknowledge, so it gets a
  // key of its own rather than the empty one an absent finding would produce.
  const hintKey = hintUnreadable ? `unreadable:${hintScan?.name ?? ''}` : personalDataHintKey(hints);
  const hintAcknowledged = hintKey !== '' && hintAckFor === hintKey;
  /** Something to look at, and nobody has said they looked. */
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
    // The import is what sends the file's contents on. Nothing is refused here
    // — the tick is what is asked for, and the button below says so.
    if (!preview || hintPending || saving) return;
    readSeq.current++; // nothing still in flight may replace what was confirmed
    setSaving(true);
    setSaveError(null);
    try {
      await onImport(preview);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'The server did not store the usage data.');
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
    return (
      <div data-usage-imported="">
        <CcMessageStrip
          state="information"
          headline={`Usage data imported — ${imported.records.length} objects from ${imported.source.toUpperCase()}.`}
          actions={<CcButton variant="ghost" onClick={startOver}>Replace</CcButton>}
        >
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {imported.window ? (
              <span>Monitoring window (declared): {imported.window.from} – {imported.window.to}, {imported.window.days} days</span>
            ) : (
              <span className="text-cc-warning">No monitoring window declared</span>
            )}
            {/* Not the window: the span between the first and last execution
                the export contains. */}
            {imported.observedSpanDays && (
              <span>{imported.observedSpanDays} days of observed activity</span>
            )}
            {imported.quarantined && imported.quarantined.length > 0 && (
              <span className="text-cc-warning">{imported.quarantined.length} rows rejected</span>
            )}
            <span>Imported <span className="font-cc-mono">{formatIsoDate(imported.importedAt) ?? 'date not recorded'}</span></span>
          </span>
          <Warnings warnings={imported.warnings} />
        </CcMessageStrip>
      </div>
    );
  }

  // ── Declare, then drop ──────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* One aligned row of short labels — the explanations differ in length,
          so they sit in one line under the row instead of pushing each control
          to a different height (owner, 01.10.2026). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CcField label="Source format">
          {(control) => (
            <select
              id={control.id}
              aria-describedby={`${control.describedBy ?? ''} usage-declare-help`.trim()}
              value={selectedSource}
              onChange={(e) => declare({ source: e.target.value as UsageSource | 'auto' })}
              data-usage-source
              className={cn(control.className, 'cursor-pointer')}
            >
              {SOURCE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
        </CcField>

        <CcField
          label="Date format in the export"
          valueState={dateLocale ? undefined : 'warning'}
          message={dateLocale ? undefined : 'Not declared yet.'}
        >
          {(control) => (
            <select
              id={control.id}
              aria-describedby={`${control.describedBy ?? ''} usage-declare-help`.trim()}
              value={dateLocale}
              onChange={(e) => declare({ dateLocale: e.target.value as UsageDateLocale | '' })}
              data-usage-date-locale
              className={cn(control.className, 'cursor-pointer')}
            >
              {DATE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
        </CcField>

        <CcField label="Monitored from">
          {(control) => (
            <input
              id={control.id}
              type="date"
              aria-describedby={`${control.describedBy ?? ''} usage-declare-help`.trim()}
              value={windowFrom}
              onChange={(e) => declare({ windowFrom: e.target.value })}
              data-usage-window-from
              className={control.className}
            />
          )}
        </CcField>
        <CcField label="Monitored to">
          {(control) => (
            <input
              id={control.id}
              type="date"
              aria-describedby={`${control.describedBy ?? ''} usage-declare-help`.trim()}
              value={windowTo}
              onChange={(e) => declare({ windowTo: e.target.value })}
              data-usage-window-to
              className={control.className}
            />
          )}
        </CcField>
      </div>
      <p id="usage-declare-help" className="cc-text-meta text-cc-ink-muted">
        {SOURCE_OPTIONS.find(o => o.value === selectedSource)?.description}. ISO and SAP YYYYMMDD dates are read either way; any
        other date needs a declared format. The monitoring window is when monitoring actually ran — zero calls count as
        disuse only over 13 months or more.
      </p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        data-usage-dropzone={isDragging ? 'dragging' : 'idle'}
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
          data-usage-file
          className="hidden"
        />
        <FileSpreadsheet size={32} aria-hidden={true} className="text-cc-ink-muted" />
        <p className="cc-text-h3 text-cc-ink" aria-live="polite">
          {parsing ? 'Reading usage data…' : file ? `${file.name} — drop another file to replace it` : 'Drop SAP usage export here'}
        </p>
        <p className="cc-text-meta text-cc-ink-muted">
          CSV (semicolon, comma, tab) or XLSX · SCMON / UPL / ST03N · nothing is stored until you confirm
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

      {/* Error */}
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

      {/* What the file itself looks like it may carry. Shapes, not a verdict —
          and of all three upload paths this is the one where a user id is there
          by construction (18.09.2026). */}
      {file && (
        <PersonalDataHints
          id="usage-personal-data"
          hints={hints}
          unreadableNote={hintUnreadable}
          acknowledged={hintAcknowledged}
          onAcknowledge={(next) => setHintAckFor(next ? hintKey : '')}
        />
      )}

      {/* Preview — what would be taken over, and what would not */}
      {preview && !error && (
        <div className="space-y-3 rounded-cc-card border border-cc-line bg-cc-surface p-4" data-usage-preview>
          <p className="cc-text-h3 text-cc-ink">
            Preview: {preview.records.length} objects would be imported
            {preview.quarantined && preview.quarantined.length > 0 && (
              <span className="text-cc-error"> · {preview.quarantined.length} rows rejected</span>
            )}
          </p>
          <Warnings warnings={preview.warnings} />

          {preview.quarantined && preview.quarantined.length > 0 && (
            <div className="space-y-2" data-usage-quarantine>
              <p className="cc-text-label text-cc-ink-muted">Rejected rows — not imported, not used for prioritisation</p>
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

          {saveError && (
            <div data-usage-save-error="">
              <CcMessageStrip state="error" headline="Not imported — the server did not confirm the save of the usage data." announce>
                {saveError}
              </CcMessageStrip>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <CcButton
              variant="primary"
              onClick={() => void confirmImport()}
              busy={saving}
              disabled={preview.records.length === 0 || hintPending}
              data-usage-confirm
            >
              Import {preview.records.length} objects
            </CcButton>
            <CcButton variant="ghost" onClick={startOver}>
              Cancel
            </CcButton>
            {hintPending && (
              <span data-usage-personal-data-pending className="cc-text-meta text-cc-warning">
                Tick the box above to say you have checked this file. Nothing has been imported yet.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Privacy notice */}
      <div className="flex items-start gap-2 cc-text-meta text-cc-ink-muted">
        <Info size={14} aria-hidden={true} className="mt-0.5 shrink-0" />
        <p>{PRIVACY_NOTICE}</p>
      </div>
    </div>
  );
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
