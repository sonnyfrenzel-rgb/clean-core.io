'use client';

export const dynamic = 'force-dynamic';

import { useState, useCallback, useRef } from 'react';
import { verifyAuditPack, signatureStateOf, verdictHeadline, type VerifyResult, type FileVerifyResult } from '@/lib/audit-pack-verify';
import { ShieldCheck, ShieldAlert, ShieldX, Upload, CheckCircle2, XCircle, AlertCircle, FileText, Hash } from 'lucide-react';
import BackLink from '@/components/BackLink';
import { motion, AnimatePresence } from 'motion/react';
import { STATE_CLASSES } from '@/components/cc/state';
import { formatDateTime } from '@/lib/format';
import type { SemanticState } from '@/lib/provenance';

/** The verdict's state (DESIGN.md §1.1): the verifier decides the status, this only names its colour. */
const VERDICT_STATE: Record<VerifyResult['status'], SemanticState> = {
  authentic: 'success',
  'integrity-only': 'warning',
  failed: 'error',
};

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
      // The file goes in as it is: the verifier asks its size before reading it.
      const res = await verifyAuditPack(file);
      setResult(res);
    } catch (err: any) {
      setResult({
        success: false,
        integrityValid: false,
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

  const signatureBadge = (state: ReturnType<typeof signatureStateOf>) => {
    if (state === 'valid') return (
      <div className="flex items-center gap-2 text-cc-success">
        <ShieldCheck size={20} className="shrink-0" aria-hidden="true" />
        <span className="font-bold text-sm">Authenticity Confirmed</span>
      </div>
    );
    if (state === 'invalid') return (
      <div className="flex items-center gap-2 text-cc-error">
        <ShieldX size={20} className="shrink-0" aria-hidden="true" />
        <span className="font-bold text-sm">Signature Invalid</span>
      </div>
    );
    return (
      <div className="flex items-center gap-2 text-cc-warning">
        <ShieldAlert size={20} className="shrink-0" aria-hidden="true" />
        <span className="font-bold text-sm">{state === 'unchecked' ? 'Signed / Not Checked' : 'Unsigned / Unverified'}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          {/* UX-015/UX-104: a pack can be verified without an account, so the way
              back cannot be a hard link to /dashboard. */}
          <div className="mb-6">
            <BackLink />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-cc-ink tracking-tight">
            Audit Pack Verification
          </h1>
          <p className="text-cc-ink-muted text-sm mt-2 max-w-xl leading-relaxed">
            Upload an exported Audit Pack ZIP to verify its integrity and cryptographic authenticity.
            All verification is performed locally in your browser — only the signature check contacts the server.
          </p>
        </div>

        {/* Drop Zone */}
        {/* A clickable div is not a control: this page is the one a reviewer
            opens to check a pack someone sent them, and it could not be reached
            by keyboard at all — no role, no focus, and the file input hidden
            without a label (UX review of 52f171091948, 07882b7eb23f). It is a
            button now, with the state announced rather than only coloured. */}
        <div
          role="button"
          tabIndex={verifying ? -1 : 0}
          aria-label="Upload an Audit Pack ZIP to verify"
          aria-busy={verifying}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (verifying) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={`
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cc-focus focus-visible:ring-offset-2
            relative cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-colors duration-300
            ${dragOver
              ? 'border-cc-brand-strong bg-cc-brand-surface'
              : 'border-cc-field-border bg-cc-surface hover:border-cc-brand-strong hover:bg-cc-brand-surface'
            }
            ${verifying ? 'pointer-events-none opacity-60' : ''}
          `}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".zip"
            aria-label="Audit Pack ZIP file"
            onChange={handleInputChange}
            className="hidden"
          />
          <Upload size={40} aria-hidden="true" className={`mx-auto mb-4 ${dragOver ? 'text-cc-brand-strong' : 'text-cc-ink-muted'}`} />
          <p className="text-cc-ink font-semibold text-sm" aria-live="polite">
            {verifying ? 'Verifying...' : 'Drop your Audit Pack ZIP here, or press Enter to browse'}
          </p>
          <p className="text-cc-ink-muted text-xs mt-1">Accepts .zip files exported from Clean-Core.io</p>
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
              <div className={`rounded-2xl p-6 border ${STATE_CLASSES[VERDICT_STATE[result.status]].bg} ${STATE_CLASSES[VERDICT_STATE[result.status]].border}`}>
                <div className="flex items-start gap-4">
                  {result.status === 'authentic' ? (
                    <CheckCircle2 size={32} className="text-cc-success shrink-0 mt-0.5" aria-hidden="true" />
                  ) : result.status === 'integrity-only' ? (
                    <AlertCircle size={32} className="text-cc-warning shrink-0 mt-0.5" aria-hidden="true" />
                  ) : (
                    <XCircle size={32} className="text-cc-error shrink-0 mt-0.5" aria-hidden="true" />
                  )}
                  <div>
                    <h2 className="text-xl font-extrabold text-cc-ink">
                      {verdictHeadline(result)}
                    </h2>
                    <p className={`text-sm mt-1 font-semibold ${STATE_CLASSES[VERDICT_STATE[result.status]].text}`}>
                      {fileName}
                    </p>
                  </div>
                </div>
              </div>

              {/* Checks Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* File Integrity */}
                <div className="rounded-xl bg-cc-surface border border-cc-line p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText size={16} className="text-cc-ink-muted" aria-hidden="true" />
                    <span className="cc-text-label text-cc-ink-muted">File Integrity</span>
                  </div>
                  {result.fileIntegrity.length > 0 ? (
                    <div className="space-y-2">
                      {result.fileIntegrity.map((f: FileVerifyResult) => (
                        <div key={f.path} className="flex items-center gap-2 text-xs">
                          {f.signed === false && f.valid ? (
                            <AlertCircle size={14} className="text-cc-warning shrink-0" aria-hidden="true" />
                          ) : f.valid ? (
                            <CheckCircle2 size={14} className="text-cc-success shrink-0" aria-hidden="true" />
                          ) : (
                            <XCircle size={14} className="text-cc-error shrink-0" aria-hidden="true" />
                          )}
                          <span className={`truncate font-cc-mono ${f.valid ? 'text-cc-ink-muted' : 'text-cc-error font-semibold'}`}>
                            {f.path}
                          </span>
                          {f.signed === false && f.valid && (
                            // A pack sealed from manifest version 3 binds the
                            // bytes of an attested file, so the row can say the
                            // statement was not rewritten. One sealed before
                            // that carries no digest, and the label has to keep
                            // saying so rather than borrow the stronger claim.
                            <span className="shrink-0 cc-text-label text-cc-warning">
                              {f.expectedHash
                                ? 'user-attested · sealed, not confirmed'
                                : 'user-attested · not covered by the signature'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-cc-ink-muted">No files to verify</p>
                  )}
                </div>

                {/* Manifest Hash */}
                <div className="rounded-xl bg-cc-surface border border-cc-line p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Hash size={16} className="text-cc-ink-muted" aria-hidden="true" />
                    <span className="cc-text-label text-cc-ink-muted">Manifest Hash</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {result.manifestHashValid ? (
                      <CheckCircle2 size={18} className="text-cc-success" aria-hidden="true" />
                    ) : (
                      <XCircle size={18} className="text-cc-error" aria-hidden="true" />
                    )}
                    <span className={`text-sm font-semibold ${result.manifestHashValid ? 'text-cc-success' : 'text-cc-error'}`}>
                      {result.manifestHashValid ? 'Valid' : 'Invalid'}
                    </span>
                  </div>
                  {result.manifest?.manifestHash && (
                    <p className="text-xs text-cc-ink-muted font-cc-mono mt-2 break-all">
                      {result.manifest.manifestHash}
                    </p>
                  )}
                </div>

                {/* Signature */}
                <div className="rounded-xl bg-cc-surface border border-cc-line p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck size={16} className="text-cc-ink-muted" aria-hidden="true" />
                    <span className="cc-text-label text-cc-ink-muted">Signature</span>
                  </div>
                  {signatureBadge(signatureStateOf(result))}
                  {result.manifest?.signature && (
                    <p className="text-xs text-cc-ink-muted font-cc-mono mt-2 break-all">
                      {result.manifest.signature.substring(0, 32)}...
                    </p>
                  )}
                </div>
              </div>

              {/* Metadata */}
              {result.manifest && (
                <div className="rounded-xl bg-cc-surface border border-cc-line p-5">
                  <h3 className="cc-text-label text-cc-ink-muted mb-3">Export Metadata</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-cc-ink-muted block">Engine Version</span>
                      <span className="text-cc-ink font-bold">{result.manifest.engineVersion}</span>
                    </div>
                    <div>
                      <span className="text-cc-ink-muted block">SAP Catalog</span>
                      <span className="text-cc-ink font-bold">{result.manifest.sapApiCatalogVersion}</span>
                    </div>
                    <div>
                      <span className="text-cc-ink-muted block">Generated</span>
                      <span className="text-cc-ink font-bold">
                        {formatDateTime(result.manifest.generatedAt) ?? result.manifest.generatedAt}
                      </span>
                    </div>
                    <div>
                      <span className="text-cc-ink-muted block">Run ID</span>
                      <span className="text-cc-ink font-cc-mono break-all">{result.manifest.runId || '—'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Errors */}
              {result.errors.length > 0 && (
                <div className="rounded-xl bg-cc-warning-bg border border-cc-warning-border p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle size={16} className="text-cc-warning" aria-hidden="true" />
                    <span className="cc-text-label text-cc-warning">
                      {result.success ? 'Notices' : 'Errors'}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {result.errors.map((err, i) => (
                      <li key={i} className="text-xs text-cc-ink leading-relaxed">• {err}</li>
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
