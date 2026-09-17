import { constants, createCipheriv, createDecipheriv, createPrivateKey, privateDecrypt, publicEncrypt, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { latestArtifact } from '../../qa/lib/gh.mjs';

/**
 * Asymmetric sealing for the security audit.
 *
 * The job that runs the model seals with the public key and cannot open
 * anything — not its own report, not an earlier one. Only the mail job and the
 * maintainer hold the private key. A compromised or prompt-injected audit job
 * therefore has nothing to read and nothing to leak but the run it is doing.
 *
 * Construction: a fresh AES-256-GCM key per report, wrapped with RSA-OAEP-SHA256.
 */

export const AUDIT_PUBLIC_PEM = 'docs/security/audit-public-key.pem';

/** The artifact holding a run's report: `security-audit-<sha>-<attempt>` of the latest attempt that produced one. */
export const auditArtifact = (names, sha) => latestArtifact(names, 'security-audit', sha);

const SEALED_NAME = 'security-audit.enc.json';

/**
 * The sealed report in `artifact`, as text, or null when the download brings none.
 *
 * `download(dir)` fetches the artifact into `dir`, and every call gets a directory
 * of its own. The inbox used to empty and refill one shared directory per artifact,
 * and `gh run download` refuses to overwrite a file that is already there. Two
 * invocations at once — the SessionStart hook ran twice when a session was resumed
 * on 17.09.2026 — then raced: one read the report, the other found the file of the
 * first in its way and announced "the audit run 35188992683 produced no readable
 * report" about a report that opened without error.
 *
 * The sealed copy is still left at `<inbox>/<artifact>/`, where it always was. It is
 * a convenience: the report is what this call returns.
 */
export function fetchSealed(artifact, download, inbox) {
  mkdirSync(inbox, { recursive: true });
  const own = mkdtempSync(join(inbox, `${artifact}.download-`));
  try {
    download(own);
    const path = join(own, SEALED_NAME);
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf8');
    try {
      mkdirSync(join(inbox, artifact), { recursive: true });
      writeFileSync(join(inbox, artifact, SEALED_NAME), raw);
    } catch {
      // Another invocation is writing the same bytes; the copy is not what was read.
    }
    return raw;
  } catch {
    return null;
  } finally {
    rmSync(own, { recursive: true, force: true });
  }
}

export function sealFor(payload, publicKeyPem) {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const wrapped = publicEncrypt({ key: publicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key);
  return { v: 1, alg: 'rsa-oaep-sha256+aes-256-gcm', key: wrapped.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

/**
 * The private key travels as one line (GitHub secret, .env.local): the PEM
 * itself, or its base64 encoding when newlines are inconvenient.
 */
export function privateKeyFrom(value) {
  if (!value) throw new Error('SECURITY_AUDIT_PRIVATE_KEY is not set.');
  const pem = value.includes('BEGIN') ? value.replace(/\\n/g, '\n') : Buffer.from(value, 'base64').toString('utf8');
  return createPrivateKey(pem);
}

export function openWith(envelope, privateKey) {
  if (envelope?.v !== 1 || envelope?.alg !== 'rsa-oaep-sha256+aes-256-gcm') throw new Error('Unknown security audit envelope.');
  const key = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(envelope.key, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8'));
}
