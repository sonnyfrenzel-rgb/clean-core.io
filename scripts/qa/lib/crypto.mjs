import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * The repository is public, and so are its Actions logs and artifacts. A review
 * can name an exploitable bug before it is fixed, so the report leaves the
 * runner only sealed: AES-256-GCM under QA_REVIEW_KEY, which lives in the
 * GitHub secret and in the maintainer's .env.local and nowhere else.
 */

const keyFrom = (secret) => {
  if (!secret || String(secret).length < 32) throw new Error('The sealing key (QA_REVIEW_KEY or UX_REVIEW_KEY) is missing or shorter than 32 characters.');
  return createHash('sha256').update(String(secret)).digest();
};

export function seal(payload, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return { v: 1, alg: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

export function open(envelope, secret) {
  if (envelope?.v !== 1 || envelope?.alg !== 'aes-256-gcm') throw new Error('Unknown sealed envelope.');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}
