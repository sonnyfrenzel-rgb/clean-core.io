'use client';

export const dynamic = 'force-dynamic';

import { useState, useCallback, useRef } from 'react';
import {
  verifyAuditPack,
  signatureStateOf,
  verdictHeadline,
  ed25519Label,
  type VerifyResult,
  type FileVerifyResult,
  type Ed25519Result,
} from '@/lib/audit-pack-verify';
import { ShieldCheck, ShieldAlert, ShieldX, Upload, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import BackLink from '@/components/BackLink';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { formatDateTime } from '@/lib/format';
import type { SemanticState } from '@/lib/provenance';
import { cn } from '@/lib/utils';

/** The verdict's state (DESIGN.md §1.1): the verifier decides the status, this only names its colour. */
const VERDICT_STATE: Record<VerifyResult['status'], SemanticState> = {
  authentic: 'success',
  'integrity-only': 'warning',
  failed: 'error',
};

/**
 * Audit pack verification — a tool page of the workspace (gap audit 3.0, §18).
 *
 * The head is the tool-page head (22/800, one line of lead) rather than the
 * 36 px title it had; the drop zone, the verdict and the checks are cc blocks.
 * What the page says about a pack is unchanged: the headline comes from
 * `verdictHeadline`, the signature line from `signatureStateOf`, both in
 * `lib/audit-pack-verify.ts` (tests/verify-pack-verdict-qa220.spec.ts).
 */
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
    if (verifying) return;
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.zip') || file.type === 'application/zip')) {
      handleFile(file);
    }
  }, [handleFile, verifying]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // The same file can be chosen again after a change to it.
    e.target.value = '';
  }, [handleFile]);

  /**
   * The Ed25519 line, said as it is (owner decision 02.10.2026): verified, not
   * present, failed, or not checked — with the reason for the last two. The
   * words come from `ed25519Label` in `lib/audit-pack-verify.ts`.
   */
  const ed25519Line = (ed: Ed25519Result) => {
    const tone =
      ed.state === 'verified' ? 'text-cc-success' : ed.state === 'failed' ? 'text-cc-error' : 'text-cc-warning';
    const Icon = ed.state === 'verified' ? ShieldCheck : ed.state === 'failed' ? ShieldX : ShieldAlert;
    return (
      <div data-ed25519-state={ed.state}>
        <div className={cn('flex items-center gap-2', tone)}>
          <Icon size={16} className="shrink-0" aria-hidden="true" />
          <span className="text-[13px] font-semibold">{ed25519Label(ed.state)}</span>
        </div>
        {ed.keyId && (
          <p className="m-0 mt-1 break-all font-cc-mono text-[12px] text-cc-ink-muted">key {ed.keyId}</p>
        )}
      </div>
    );
  };

  const signatureBadge = (state: ReturnType<typeof signatureStateOf>) => {
    if (state === 'valid') return (
      <div className="flex items-center gap-2 text-cc-success">
        <ShieldCheck size={16} className="shrink-0" aria-hidden="true" />
        <span className="text-[13px] font-semibold">HMAC: Authenticity Confirmed</span>
      </div>
    );
    if (state === 'invalid') return (
      <div className="flex items-center gap-2 text-cc-error">
        <ShieldX size={16} className="shrink-0" aria-hidden="true" />
        <span className="text-[13px] font-semibold">HMAC: Signature Invalid</span>
      </div>
    );
    return (
      <div className="flex items-center gap-2 text-cc-warning">
        <ShieldAlert size={16} className="shrink-0" aria-hidden="true" />
        <span className="text-[13px] font-semibold">{state === 'unchecked' ? 'HMAC: Signed / Not Checked' : 'HMAC: Unsigned / Unverified'}</span>
      </div>
    );
  };

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-4 px-4 py-6 pb-20 sm:px-6">
      {/* UX-015/UX-104: a pack can be verified without an account, so the way
          back cannot be a hard link to /dashboard. */}
      <div>
        <BackLink />
      </div>

      <div>
        <h1 className="m-0 text-[22px] font-extrabold tracking-[-0.02em] text-cc-ink">Verify an audit pack</h1>
        <p className="mt-1 text-[13px] font-medium text-cc-ink-muted">
          Check that an exported audit pack is complete, unchanged and signed by Clean-Core.io. The files and the Ed25519 signature are checked in your browser against our published keys; only the HMAC check asks our server.
        </p>
      </div>

      {/* The drop zone. It is a drop target and nothing else; the way in by
          keyboard and by pointer is the one real button inside it, so there
          is no clickable `div` pretending to be a control (UX review of
          52f171091948, 07882b7eb23f). */}
      <div
        data-verify-drop-zone=""
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); if (!verifying) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        className={cn(
          'rounded-cc-card border border-dashed px-4 py-8 text-center',
          dragOver ? 'border-cc-brand-strong bg-cc-brand-surface' : 'border-cc-field-border bg-cc-surface',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".zip"
          aria-label="Audit Pack ZIP file"
          onChange={handleInputChange}
          className="hidden"
        />
        <div className="mb-2 flex justify-center">
          <Upload size={20} aria-hidden="true" className={dragOver ? 'text-cc-brand-strong' : 'text-cc-ink-muted'} />
        </div>
        <p className="m-0 text-[14px] font-bold text-cc-ink">Drop the audit pack ZIP here</p>
        <p className="mx-auto mt-1 mb-4 max-w-md text-[13px] font-medium text-cc-ink-muted">
          The .zip file exported from the Delivery stage of a Clean-Core.io project.
        </p>
        <CcButton
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          busy={verifying}
          icon={<Upload size={16} aria-hidden={true} />}
        >
          {verifying ? 'Verifying...' : 'Choose a ZIP file'}
        </CcButton>
        <p className="sr-only" aria-live="polite">
          {verifying ? `Verifying ${fileName}` : ''}
        </p>
      </div>

      {result && (
        <>
          {/* The verdict first, in words with its state colour (§2.6); it
              takes the focus once, as the answer to the reader's action. */}
          <CcMessageStrip state={VERDICT_STATE[result.status]} headline={verdictHeadline(result)} announce>
            <span className="break-all font-cc-mono text-[12px]">{fileName}</span>
          </CcMessageStrip>

          <CcCard level={2} title="Checks">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="min-w-0">
                <h3 className="m-0 mb-2 cc-text-label text-cc-ink-muted">File integrity</h3>
                {result.fileIntegrity.length > 0 ? (
                  <ul className="m-0 list-none space-y-2 p-0">
                    {result.fileIntegrity.map((f: FileVerifyResult) => (
                      <li key={f.path} className="flex flex-wrap items-center gap-2 text-[12px]">
                        {f.signed === false && f.valid ? (
                          <AlertCircle size={14} className="shrink-0 text-cc-warning" aria-hidden="true" />
                        ) : f.valid ? (
                          <CheckCircle2 size={14} className="shrink-0 text-cc-success" aria-hidden="true" />
                        ) : (
                          <XCircle size={14} className="shrink-0 text-cc-error" aria-hidden="true" />
                        )}
                        <span className={cn('min-w-0 truncate font-cc-mono', f.valid ? 'text-cc-ink-muted' : 'font-semibold text-cc-error')}>
                          {f.path}
                        </span>
                        {!f.valid && <span className="sr-only">(does not match)</span>}
                        {f.signed === false && f.valid && (
                          // A pack sealed from manifest version 3 binds the
                          // bytes of an attested file, so the row can say the
                          // statement was not rewritten. One sealed before
                          // that carries no digest, and the label has to keep
                          // saying so rather than borrow the stronger claim.
                          <span className="cc-text-label text-cc-warning">
                            {f.expectedHash
                              ? 'user-attested · sealed, not confirmed'
                              : 'user-attested · not covered by the signature'}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 text-[13px] text-cc-ink-muted">No files to verify</p>
                )}
              </div>

              <div className="min-w-0">
                <h3 className="m-0 mb-2 cc-text-label text-cc-ink-muted">Manifest hash</h3>
                <div className={cn('flex items-center gap-2', result.manifestHashValid ? 'text-cc-success' : 'text-cc-error')}>
                  {result.manifestHashValid ? (
                    <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />
                  ) : (
                    <XCircle size={16} className="shrink-0" aria-hidden="true" />
                  )}
                  <span className="text-[13px] font-semibold">
                    {result.manifestHashValid ? 'Valid' : 'Invalid'}
                  </span>
                </div>
                {result.manifest?.manifestHash && (
                  <p className="m-0 mt-2 break-all font-cc-mono text-[12px] text-cc-ink-muted">
                    {result.manifest.manifestHash}
                  </p>
                )}
              </div>

              <div className="min-w-0">
                <h3 className="m-0 mb-2 cc-text-label text-cc-ink-muted">Signatures</h3>
                {signatureBadge(signatureStateOf(result))}
                {result.manifest?.signature && (
                  <p className="m-0 mt-2 break-all font-cc-mono text-[12px] text-cc-ink-muted">
                    {result.manifest.signature.substring(0, 32)}...
                  </p>
                )}
                <div className="mt-3">
                  {ed25519Line(result.ed25519 ?? { state: 'not-present', keyId: null, reason: null })}
                </div>
              </div>
            </div>
          </CcCard>

          {result.manifest && (
            <CcCard level={2} title="Export details">
              <dl className="m-0 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                <div className="min-w-0">
                  <dt className="cc-text-label text-cc-ink-muted">Engine version</dt>
                  <dd className="m-0 mt-1 text-[13px] font-semibold text-cc-ink">{result.manifest.engineVersion}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="cc-text-label text-cc-ink-muted">SAP catalog</dt>
                  <dd className="m-0 mt-1 text-[13px] font-semibold text-cc-ink">{result.manifest.sapApiCatalogVersion}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="cc-text-label text-cc-ink-muted">Generated</dt>
                  <dd className="m-0 mt-1 text-[13px] font-semibold text-cc-ink">
                    {formatDateTime(result.manifest.generatedAt) ?? result.manifest.generatedAt}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="cc-text-label text-cc-ink-muted">Run ID</dt>
                  <dd className="m-0 mt-1 break-all font-cc-mono text-[12px] text-cc-ink">{result.manifest.runId || '—'}</dd>
                </div>
              </dl>
            </CcCard>
          )}

          {result.errors.length > 0 && (
            <CcMessageStrip state={result.success ? 'warning' : 'error'} headline={result.success ? 'Notices' : 'Errors'}>
              <ul className="m-0 mt-1 list-disc space-y-1 pl-4">
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </CcMessageStrip>
          )}
        </>
      )}
    </div>
  );
}
