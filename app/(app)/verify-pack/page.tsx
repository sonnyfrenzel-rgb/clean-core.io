'use client';

export const dynamic = 'force-dynamic';

import { useState, useCallback, useRef } from 'react';
import { verifyAuditPack, type VerifyResult, type FileVerifyResult } from '@/lib/audit-pack-verify';
import { ShieldCheck, ShieldAlert, ShieldX, Upload, CheckCircle2, XCircle, AlertCircle, FileText, Clock, Tag, Hash, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';

export default function VerifyPackPage() {
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setVerifying(true);
    setResult(null);
    try {
      const blob = new Blob([await file.arrayBuffer()]);
      const res = await verifyAuditPack(blob);
      setResult(res);
    } catch (err: any) {
      setResult({
        success: false,
        status: 'failed',
        fileIntegrity: [],
        manifestHashValid: false,
        signatureValid: null,
        manifest: null,
        errors: [`Failed to process ZIP: ${err.message}`],
      });
    } finally {
      setVerifying(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.zip') || file.type === 'application/zip')) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const signatureBadge = (sv: boolean | null) => {
    if (sv === true) return (
      <div className="flex items-center gap-2 text-emerald-600">
        <ShieldCheck size={20} className="shrink-0" />
        <span className="font-bold text-sm">Authenticity Confirmed</span>
      </div>
    );
    if (sv === false) return (
      <div className="flex items-center gap-2 text-red-600">
        <ShieldX size={20} className="shrink-0" />
        <span className="font-bold text-sm">Signature Invalid</span>
      </div>
    );
    return (
      <div className="flex items-center gap-2 text-amber-600">
        <ShieldAlert size={20} className="shrink-0" />
        <span className="font-bold text-sm">Unsigned / Unverified</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-emerald-50/30 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 text-xs font-bold uppercase tracking-widest mb-6 transition-colors">
            <ArrowLeft size={14} /> Back to Dashboard
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight">
            Audit Pack Verification
          </h1>
          <p className="text-gray-500 text-sm mt-2 max-w-xl leading-relaxed">
            Upload an exported Audit Pack ZIP to verify its integrity and cryptographic authenticity.
            All verification is performed locally in your browser — only the signature check contacts the server.
          </p>
        </div>

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => inputRef.current?.click()}
          className={`
            relative cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-300
            ${dragOver
              ? 'border-emerald-500 bg-emerald-50/60 scale-[1.01]'
              : 'border-gray-300 bg-white hover:border-emerald-400 hover:bg-emerald-50/20'
            }
            ${verifying ? 'pointer-events-none opacity-60' : ''}
          `}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".zip"
            onChange={handleInputChange}
            className="hidden"
          />
          <Upload size={40} className={`mx-auto mb-4 ${dragOver ? 'text-emerald-500' : 'text-gray-400'}`} />
          <p className="text-gray-600 font-semibold text-sm">
            {verifying ? 'Verifying...' : 'Drop your Audit Pack ZIP here or click to browse'}
          </p>
          <p className="text-gray-400 text-xs mt-1">Accepts .zip files exported from Clean-Core.io</p>
        </div>

        {/* Results */}
        <AnimatePresence mode="wait">
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className="mt-8 space-y-6"
            >
              {/* Overall Status */}
              <div className={`rounded-2xl p-6 border ${
                result.status === 'authentic'
                  ? 'bg-emerald-50 border-emerald-200'
                  : result.status === 'integrity-only'
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-start gap-4">
                  {result.status === 'authentic' ? (
                    <CheckCircle2 size={32} className="text-emerald-600 shrink-0 mt-0.5" />
                  ) : result.status === 'integrity-only' ? (
                    <AlertCircle size={32} className="text-amber-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle size={32} className="text-red-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <h2 className={`text-xl font-black ${
                      result.status === 'authentic'
                        ? 'text-emerald-800'
                        : result.status === 'integrity-only'
                          ? 'text-amber-800'
                          : 'text-red-800'
                    }`}>
                      {result.status === 'authentic'
                        ? 'Authenticity & Integrity Verified'
                        : result.status === 'integrity-only'
                          ? 'Integrity Verified (Unsigned)'
                          : 'Verification Failed'}
                    </h2>
                    <p className={`text-sm mt-1 ${
                      result.status === 'authentic'
                        ? 'text-emerald-700'
                        : result.status === 'integrity-only'
                          ? 'text-amber-700'
                          : 'text-red-700'
                    }`}>
                      {fileName}
                    </p>
                  </div>
                </div>
              </div>

              {/* Checks Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* File Integrity */}
                <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText size={16} className="text-gray-500" />
                    <span className="font-bold text-xs uppercase tracking-widest text-gray-500">File Integrity</span>
                  </div>
                  {result.fileIntegrity.length > 0 ? (
                    <div className="space-y-1.5">
                      {result.fileIntegrity.map((f: FileVerifyResult) => (
                        <div key={f.path} className="flex items-center gap-2 text-xs">
                          {f.valid ? (
                            <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                          ) : (
                            <XCircle size={13} className="text-red-500 shrink-0" />
                          )}
                          <span className={`truncate ${f.valid ? 'text-gray-600' : 'text-red-700 font-semibold'}`}>
                            {f.path}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">No files to verify</p>
                  )}
                </div>

                {/* Manifest Hash */}
                <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Hash size={16} className="text-gray-500" />
                    <span className="font-bold text-xs uppercase tracking-widest text-gray-500">Manifest Hash</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {result.manifestHashValid ? (
                      <CheckCircle2 size={18} className="text-emerald-500" />
                    ) : (
                      <XCircle size={18} className="text-red-500" />
                    )}
                    <span className={`text-sm font-semibold ${result.manifestHashValid ? 'text-emerald-700' : 'text-red-700'}`}>
                      {result.manifestHashValid ? 'Valid' : 'Invalid'}
                    </span>
                  </div>
                  {result.manifest?.manifestHash && (
                    <p className="text-[10px] text-gray-400 font-mono mt-2 break-all">
                      {result.manifest.manifestHash}
                    </p>
                  )}
                </div>

                {/* Signature */}
                <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck size={16} className="text-gray-500" />
                    <span className="font-bold text-xs uppercase tracking-widest text-gray-500">Signature</span>
                  </div>
                  {signatureBadge(result.signatureValid)}
                  {result.manifest?.signature && (
                    <p className="text-[10px] text-gray-400 font-mono mt-2 break-all">
                      {result.manifest.signature.substring(0, 32)}...
                    </p>
                  )}
                </div>
              </div>

              {/* Metadata */}
              {result.manifest && (
                <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm">
                  <h3 className="font-bold text-xs uppercase tracking-widest text-gray-500 mb-3">Export Metadata</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-gray-400 block">Engine Version</span>
                      <span className="text-gray-800 font-bold">{result.manifest.engineVersion}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">SAP Catalog</span>
                      <span className="text-gray-800 font-bold">{result.manifest.sapApiCatalogVersion}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Generated</span>
                      <span className="text-gray-800 font-bold">
                        {new Date(result.manifest.generatedAt).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Run ID</span>
                      <span className="text-gray-800 font-mono text-[10px]">{result.manifest.runId || '—'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Errors */}
              {result.errors.length > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle size={16} className="text-amber-600" />
                    <span className="font-bold text-xs uppercase tracking-widest text-amber-700">
                      {result.success ? 'Notices' : 'Errors'}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {result.errors.map((err, i) => (
                      <li key={i} className="text-xs text-amber-800 leading-relaxed">• {err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
