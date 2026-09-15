import { constants, createCipheriv, createDecipheriv, createPrivateKey, privateDecrypt, publicEncrypt, randomBytes } from 'node:crypto';

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

export const PUBLIC_KEY_PATH = 'docs/security/audit-public-key.pem';

/**
 * The artifact holding a run's report: `security-audit-<sha>-<attempt>`, from the
 * latest attempt that produced one. A re-run of only the delivery job adds an
 * attempt without a new artifact, so the newest attempt is not always the one.
 */
export function auditArtifact(names, sha) {
  const re = new RegExp(`^security-audit-${String(sha).replace(/[^0-9a-f]/g, '')}-(\\d+)$`);
  return (
    names
      .map((name) => ({ name, attempt: Number(re.exec(name)?.[1]) }))
      .filter((a) => a.attempt > 0)
      .sort((a, b) => b.attempt - a.attempt)[0]?.name || null
  );
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
