'use client';

import { useState, useRef, useCallback } from 'react';
import { FileSpreadsheet, AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import clsx from 'clsx';
import type { AtcReport } from '@/lib/abap/atc-model';
import { ATC_PRIVACY_NOTICE } from '@/lib/abap/atc-privacy';
import {
  personalDataHintKey,
  scanForPersonalDataHints,
  type PersonalDataHint,
} from '@/lib/personal-data-hints';
import PersonalDataHints from '@/components/PersonalDataHints';

interface AtcUploadProps {
  onImport: (report: AtcReport) => void;
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

  const confirm = () => {
    if (!preview || hintPending) return;
    readSeq.current++;
    setImported(preview);
    onImport(preview);
    setPreview(null);
    setFile(null);
    setHintScan(null);
    setHintAckFor('');
  };

  const startOver = () => {
    readSeq.current++;
    hintSeq.current++;
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
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5" data-atc-imported>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-emerald-900">
              ATC results imported — {imported.findings.length} findings, as reported by ATC
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-emerald-700">
              {(['error', 'warning', 'info', 'unknown'] as const)
                .filter((p) => counts[p] > 0)
                .map((p) => (
                  <span key={p}>{counts[p]} {PRIORITY_LABEL[p]}</span>
                ))}
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

  // ── Drop ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
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
          parsing && 'opacity-50 pointer-events-none',
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
        <FileSpreadsheet className={clsx('w-8 h-8 mx-auto mb-2', isDragging ? 'text-emerald-500' : 'text-slate-300')} />
        <p className="text-sm font-bold text-slate-700">
          {parsing ? 'Reading ATC worklist…' : file ? `${file.name} — drop another file to replace it` : 'Drop ATC worklist export here'}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          CSV/TSV (from SAP GUI "Local File") or XLSX (from ADT export) · nothing is stored until you confirm
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-800">Import failed</p>
            <p className="text-xs text-red-600 mt-0.5">{error}</p>
          </div>
        </div>
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
        <div className="border border-slate-200 rounded-2xl p-4 space-y-3" data-atc-preview>
          <p className="text-sm font-bold text-slate-800">
            Preview: {preview.findings.length} findings would be imported, as reported by ATC
            {preview.quarantined && preview.quarantined.length > 0 && (
              <span className="text-rose-700"> · {preview.quarantined.length} rows rejected</span>
            )}
          </p>
          <Warnings warnings={preview.warnings} />

          {preview.quarantined && preview.quarantined.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 overflow-hidden" data-atc-quarantine>
              <p className="px-3 py-2 text-[11px] font-bold text-rose-800 border-b border-rose-200">
                Rejected rows — not imported, not compared with the engine
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

          {preview.findings.length > 0 && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <p className="px-3 py-2 text-[11px] font-bold text-slate-600 border-b border-slate-200">
                First {Math.min(PREVIEW_ROWS, preview.findings.length)} findings, as ATC reported them
              </p>
              <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                {[...preview.findings]
                  .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
                  .slice(0, PREVIEW_ROWS)
                  .map((f, i) => (
                    <li key={i} className="px-3 py-1.5 text-[11px] text-slate-700 flex items-start gap-2">
                      <span className={clsx(
                        'shrink-0 px-1.5 py-0.5 rounded font-black uppercase text-[9px]',
                        f.priority === 'error' ? 'bg-red-100 text-red-700' :
                        f.priority === 'warning' ? 'bg-amber-100 text-amber-700' :
                        f.priority === 'info' ? 'bg-slate-100 text-slate-600' : 'bg-slate-100 text-slate-400',
                      )}>
                        {PRIORITY_LABEL[f.priority]}
                      </span>
                      <span className="font-mono font-bold shrink-0">{f.objectName}</span>
                      <span className="min-w-0 truncate">{f.message}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={confirm}
              disabled={preview.findings.length === 0 || hintPending}
              data-atc-confirm
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-wider hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              Import {preview.findings.length} findings
            </button>
            <button
              onClick={startOver}
              className="text-xs text-slate-500 hover:text-slate-800 font-bold underline underline-offset-2"
            >
              Cancel
            </button>
            {hintPending && (
              <span data-atc-personal-data-pending className="text-xs font-bold text-amber-700">
                Tick the box above to say you have checked this file. Nothing has been imported yet.
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
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
