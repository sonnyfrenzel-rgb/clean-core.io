/**
 * Audit Pack Verification Engine (v1.17.0)
 *
 * Validates the integrity and authenticity of exported Audit Pack ZIP files.
 * Checks file SHA-256 hashes against the manifest, verifies the manifest hash,
 * and optionally validates the HMAC-SHA256 signature via the server.
 */

import JSZip from 'jszip';
import type { AuditPackManifest } from './audit-pack';

/** SHA-256 hash of a string using Web Crypto API. */
async function sha256(content: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface FileVerifyResult {
  path: string;
  expectedHash: string;
  actualHash: string;
  valid: boolean;
  found: boolean;
}

export interface VerifyResult {
  success: boolean;
  fileIntegrity: FileVerifyResult[];
  manifestHashValid: boolean;
  signatureValid: boolean | null; // null = unsigned or verification skipped
  manifest: AuditPackManifest | null;
  errors: string[];
}

/**
 * Verify an Audit Pack ZIP blob.
 *
 * 1. Extracts and parses manifest.json
 * 2. Verifies SHA-256 hashes of all listed files
 * 3. Verifies the manifest hash (canonical string)
 * 4. Optionally verifies the HMAC signature via /api/export/verify
 */
export async function verifyAuditPack(zipBlob: Blob): Promise<VerifyResult> {
  const errors: string[] = [];
  const fileResults: FileVerifyResult[] = [];
  let manifest: AuditPackManifest | null = null;
  let manifestHashValid = false;
  let signatureValid: boolean | null = null;

  try {
    // 1. Load ZIP
    const zip = await JSZip.loadAsync(zipBlob);

    // 2. Extract manifest.json
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      return {
        success: false,
        fileIntegrity: [],
        manifestHashValid: false,
        signatureValid: null,
        manifest: null,
        errors: ['manifest.json not found in ZIP. This may be an Audit Pack v1 (pre-v1.17) without integrity verification.'],
      };
    }

    const manifestText = await manifestFile.async('text');
    try {
      manifest = JSON.parse(manifestText) as AuditPackManifest;
    } catch {
      return {
        success: false,
        fileIntegrity: [],
        manifestHashValid: false,
        signatureValid: null,
        manifest: null,
        errors: ['manifest.json contains invalid JSON.'],
      };
    }

    // 3. Verify file integrity
    for (const entry of manifest.files) {
      const file = zip.file(entry.path);
      if (!file) {
        fileResults.push({
          path: entry.path,
          expectedHash: entry.sha256,
          actualHash: '',
          valid: false,
          found: false,
        });
        errors.push(`File missing from ZIP: ${entry.path}`);
        continue;
      }

      const content = await file.async('text');
      const actualHash = await sha256(content);
      const valid = actualHash === entry.sha256;

      fileResults.push({
        path: entry.path,
        expectedHash: entry.sha256,
        actualHash,
        valid,
        found: true,
      });

      if (!valid) {
        errors.push(`Hash mismatch for ${entry.path}: expected ${entry.sha256.substring(0, 16)}..., got ${actualHash.substring(0, 16)}...`);
      }
    }

    // 4. Verify manifest hash
    const sortedFiles = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path));
    const canonicalManifest = sortedFiles.map(f => `${f.path}:${f.sha256}`).join(';') + ';';
    const computedManifestHash = await sha256(canonicalManifest);
    manifestHashValid = computedManifestHash === manifest.manifestHash;

    if (!manifestHashValid) {
      errors.push(`Manifest hash mismatch: expected ${manifest.manifestHash.substring(0, 16)}..., got ${computedManifestHash.substring(0, 16)}...`);
    }

    // 5. Verify HMAC signature via server
    if (manifest.signed && manifest.signature) {
      try {
        const verifyResponse = await fetch('/api/export/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            canonicalManifest,
            signature: manifest.signature,
          }),
        });

        if (verifyResponse.ok) {
          const verifyData = await verifyResponse.json();
          signatureValid = verifyData.valid === true;
          if (!signatureValid) {
            errors.push('HMAC-SHA256 signature verification failed. The manifest may have been tampered with.');
          }
        } else {
          errors.push('Signature verification service unavailable.');
          signatureValid = null;
        }
      } catch (fetchErr: any) {
        errors.push(`Signature verification request failed: ${fetchErr.message}`);
        signatureValid = null;
      }
    } else {
      // Unsigned manifest
      signatureValid = null;
      if (!manifest.signed) {
        errors.push('Manifest is unsigned. Cryptographic authenticity cannot be verified.');
      }
    }

    const allFilesValid = fileResults.every(f => f.valid);
    const success = allFilesValid && manifestHashValid && (signatureValid === true || signatureValid === null);

    return {
      success,
      fileIntegrity: fileResults,
      manifestHashValid,
      signatureValid,
      manifest,
      errors,
    };
  } catch (err: any) {
    return {
      success: false,
      fileIntegrity: fileResults,
      manifestHashValid: false,
      signatureValid: null,
      manifest,
      errors: [`Verification failed: ${err.message}`],
    };
  }
}
