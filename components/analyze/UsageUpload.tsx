'use client';

import { useState, useRef, useCallback } from 'react';
import { UploadCloud, FileSpreadsheet, AlertTriangle, CheckCircle2, Info, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import type { UsageSource, UsageReport } from '@/lib/abap/usage-model';
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

export default function UsageUpload({ onImport, existingReport }: UsageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedSource, setSelectedSource] = useState<UsageSource | 'auto'>('auto');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UsageReport | null>(existingReport || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setParsing(true);

    try {
      // Dynamic import to keep the parser out of the main bundle
      const { parseUsage } = await import('@/lib/abap/usage-parser');
      const hinted = selectedSource === 'auto' ? undefined : selectedSource;
      const report = await parseUsage(file, hinted);
      setResult(report);
      onImport(report);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to parse usage file.';
      setError(msg);
    } finally {
      setParsing(false);
    }
  }, [selectedSource, onImport]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // Already imported view
  if (result && !error) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-emerald-900">
              Usage data imported — {result.records.length} objects from {result.source.toUpperCase()}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-emerald-700">
              {result.periodDays && (
                <span>📅 {result.periodDays}-day measurement window</span>
              )}
              {result.measuredFrom && result.measuredTo && (
                <span>🕐 {result.measuredFrom} – {result.measuredTo}</span>
              )}
              <span>📊 Imported {new Date(result.importedAt).toLocaleDateString()}</span>
            </div>
            {result.warnings.length > 0 && (
              <div className="mt-2 space-y-1">
                {result.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700">
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => { setResult(null); setError(null); }}
            className="text-xs text-emerald-600 hover:text-emerald-800 font-bold underline underline-offset-2 shrink-0"
          >
            Replace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Source selector */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0">Source format:</label>
        <div className="relative">
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value as UsageSource | 'auto')}
            className="appearance-none bg-white border border-slate-200 rounded-lg px-3 py-1.5 pr-8 text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
          >
            {SOURCE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>
        <span className="text-[11px] text-slate-400 hidden sm:block">
          {SOURCE_OPTIONS.find(o => o.value === selectedSource)?.description}
        </span>
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
          className="hidden"
        />
        <FileSpreadsheet className={clsx(
          'w-8 h-8 mx-auto mb-2',
          isDragging ? 'text-emerald-500' : 'text-slate-300'
        )} />
        <p className="text-sm font-bold text-slate-700">
          {parsing ? 'Parsing usage data...' : 'Drop SAP usage export here'}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          CSV (semicolon, comma, tab) or XLSX · SCMON / UPL / ST03N
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

      {/* Privacy notice */}
      <div className="flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>{PRIVACY_NOTICE}</p>
      </div>
    </div>
  );
}
