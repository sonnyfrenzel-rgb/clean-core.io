'use client';

import { useState, useRef, useCallback } from 'react';
import { FileSpreadsheet, AlertTriangle, CheckCircle2, Info, ChevronDown, XCircle } from 'lucide-react';
import clsx from 'clsx';
import type { UsageSource, UsageReport, UsageDateLocale } from '@/lib/abap/usage-model';
import { PRIVACY_NOTICE } from '@/lib/abap/usage-privacy';

interface UsageUploadProps {
  onImport: (report: UsageReport) => void;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  // A later read supersedes an earlier one still in flight.
  const readSeq = useRef(0);

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

  const choose = (f: File) => {
    setFile(f);
    void read(f, declared);
  };

  const { source: selectedSource, dateLocale, windowFrom, windowTo } = declared;

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

  const confirm = () => {
    if (!preview) return;
    readSeq.current++; // nothing still in flight may replace what was confirmed
    setImported(preview);
    onImport(preview);
    setPreview(null);
    setFile(null);
  };

  const startOver = () => {
    readSeq.current++;
    setImported(null);
    setPreview(null);
    setFile(null);
    setError(null);
    setParsing(false);
  };

  // ── Imported ────────────────────────────────────────────────────────
  if (imported && !file) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5" data-usage-imported>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-emerald-900">
              Usage data imported — {imported.records.length} objects from {imported.source.toUpperCase()}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-emerald-700">
              {imported.window ? (
                <span>🗓 Monitoring window (declared): {imported.window.from} – {imported.window.to}, {imported.window.days} days</span>
              ) : (
                <span className="text-amber-700">🗓 No monitoring window declared</span>
              )}
              {/* Not the window: the span between the first and last execution
                  the export contains. */}
              {imported.observedSpanDays && (
                <span>📅 {imported.observedSpanDays} days of observed activity</span>
              )}
              {imported.quarantined && imported.quarantined.length > 0 && (
                <span className="text-amber-700">⛔ {imported.quarantined.length} rows rejected</span>
              )}
              <span>📊 Imported {new Date(imported.importedAt).toLocaleDateString()}</span>
            </div>
            <Warnings warnings={imported.warnings} />
          </div>
          <button
            onClick={startOver}
            className="text-xs text-emerald-600 hover:text-emerald-800 font-bold underline underline-offset-2 shrink-0"
          >
            Replace
          </button>
        </div>
      </div>
    );
  }

  // ── Declare, then drop ──────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block">
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Source format</span>
          <div className="relative mt-1">
            <select
              value={selectedSource}
              onChange={(e) => declare({ source: e.target.value as UsageSource | 'auto' })}
              data-usage-source
              className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-3 py-1.5 pr-8 text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            >
              {SOURCE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            {SOURCE_OPTIONS.find(o => o.value === selectedSource)?.description}
          </span>
        </label>

        <label className="block">
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Date format in the export</span>
          <div className="relative mt-1">
            <select
              value={dateLocale}
              onChange={(e) => declare({ dateLocale: e.target.value as UsageDateLocale | '' })}
              data-usage-date-locale
              className={clsx(
                'w-full appearance-none bg-white border rounded-lg px-3 py-1.5 pr-8 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500',
                dateLocale ? 'border-slate-200 text-slate-700' : 'border-amber-300 text-amber-800',
              )}
            >
              {DATE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            ISO and SAP YYYYMMDD dates are read either way; any other date needs this.
          </span>
        </label>

        <fieldset className="block">
          <legend className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Monitoring window (declared)</legend>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="date"
              value={windowFrom}
              onChange={(e) => declare({ windowFrom: e.target.value })}
              aria-label="Monitoring window start"
              data-usage-window-from
              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-700"
            />
            <span className="text-slate-400 text-xs">–</span>
            <input
              type="date"
              value={windowTo}
              onChange={(e) => declare({ windowTo: e.target.value })}
              aria-label="Monitoring window end"
              data-usage-window-to
              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-700"
            />
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            When monitoring actually ran. Zero calls count as disuse only over 13 months or more.
          </span>
        </fieldset>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={clsx(
          'relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all',
          isDragging
            ? 'border-emerald-400 bg-emerald-50/50'
            : 'border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/20',
          parsing && 'opacity-50 pointer-events-none'
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
        <FileSpreadsheet className={clsx(
          'w-8 h-8 mx-auto mb-2',
          isDragging ? 'text-emerald-500' : 'text-slate-300'
        )} />
        <p className="text-sm font-bold text-slate-700">
          {parsing ? 'Reading usage data…' : file ? `${file.name} — drop another file to replace it` : 'Drop SAP usage export here'}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          CSV (semicolon, comma, tab) or XLSX · SCMON / UPL / ST03N · nothing is stored until you confirm
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-800">Import failed</p>
            <p className="text-xs text-red-600 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Preview — what would be taken over, and what would not */}
      {preview && !error && (
        <div className="border border-slate-200 rounded-2xl p-4 space-y-3" data-usage-preview>
          <p className="text-sm font-bold text-slate-800">
            Preview: {preview.records.length} objects would be imported
            {preview.quarantined && preview.quarantined.length > 0 && (
              <span className="text-rose-700"> · {preview.quarantined.length} rows rejected</span>
            )}
          </p>
          <Warnings warnings={preview.warnings} />

          {preview.quarantined && preview.quarantined.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 overflow-hidden" data-usage-quarantine>
              <p className="px-3 py-2 text-[11px] font-bold text-rose-800 border-b border-rose-200">
                Rejected rows — not imported, not used for prioritisation
              </p>
              <ul className="max-h-48 overflow-y-auto divide-y divide-rose-100">
                {preview.quarantined.slice(0, PREVIEW_ROWS).map((q) => (
                  <li key={q.row} className="px-3 py-1.5 text-[11px] text-rose-900 flex items-start gap-2">
                    <XCircle className="w-3 h-3 shrink-0 mt-0.5 text-rose-500" />
                    <span className="font-mono shrink-0">row {q.row}</span>
                    <span className="font-mono font-bold shrink-0">{q.objectName}</span>
                    <span className="min-w-0">{q.reason}</span>
                  </li>
                ))}
              </ul>
              {preview.quarantined.length > PREVIEW_ROWS && (
                <p className="px-3 py-1.5 text-[10px] text-rose-700 border-t border-rose-200">
                  …and {preview.quarantined.length - PREVIEW_ROWS} more. All are kept with the import.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={confirm}
              disabled={preview.records.length === 0}
              data-usage-confirm
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-wider hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              Import {preview.records.length} objects
            </button>
            <button
              onClick={startOver}
              className="text-xs text-slate-500 hover:text-slate-800 font-bold underline underline-offset-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Privacy notice */}
      <div className="flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>{PRIVACY_NOTICE}</p>
      </div>
    </div>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
          <span>{w}</span>
        </div>
      ))}
    </div>
  );
}
