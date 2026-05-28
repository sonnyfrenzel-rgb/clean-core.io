/**
 * Zero-dependency Web-Crypto-based TOTP (RFC 6238) implementation for zero-cost,
 * offline-secure two-factor authentication in the browser.
 */

/**
 * Base32 character set (RFC 4648)
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Generates a random Base32 secret for authenticator apps.
 */
export function generateSecret(length: number = 16): string {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : require('crypto').webcrypto;
  const randomValues = new Uint8Array(length);
  cryptoObj.getRandomValues(randomValues);
  
  let secret = '';
  for (let i = 0; i < length; i++) {
    secret += ALPHABET[randomValues[i] % 32];
  }
  return secret;
}

/**
 * Converts a Base32 string to Uint8Array bytes.
 */
export function base32ToBytes(base32: string): Uint8Array {
  const clean = base32.toUpperCase().replace(/=+$/, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let index = 0;

  for (let i = 0; i < clean.length; i++) {
    const idx = ALPHABET.indexOf(clean[i]);
    if (idx === -1) {
      throw new Error('Invalid base32 character');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes[index++] = (value >> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return bytes;
}

/**
 * Generates a 6-digit TOTP code based on a base32 secret and timestamp.
 */
export async function generateTOTP(secret: string, time: number = Date.now()): Promise<string> {
  const keyBytes = base32ToBytes(secret);
  const epoch = Math.floor(time / 1000);
  const counter = Math.floor(epoch / 30);

  // Format counter as 8-byte big-endian ArrayBuffer
  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  view.setUint32(0, 0); // High 32 bits
  view.setUint32(4, counter); // Low 32 bits
  const counterBytes = new Uint8Array(counterBuffer);

  const cryptoObj = typeof window !== 'undefined' ? window.crypto : require('crypto').webcrypto;

  // Import base32 secret bytes as an HMAC-SHA1 key
  const key = await cryptoObj.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  // Sign counter bytes using HMAC-SHA1
  const signature = await cryptoObj.subtle.sign(
    'HMAC',
    key,
    counterBytes
  );

  const hmac = new Uint8Array(signature);

  // Dynamic truncation
  const offset = hmac[hmac.length - 1] & 0xf;
  const codeBin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = codeBin % 1000000;
  return otp.toString().padStart(6, '0');
}

/**
 * Verifies a 6-digit TOTP code with time-step drift windows.
 */
export async function verifyTOTP(secret: string, code: string, windowSteps: number = 1): Promise<boolean> {
  const now = Date.now();
  const cleanCode = code.replace(/\s+/g, '');
  if (cleanCode.length !== 6 || isNaN(Number(cleanCode))) {
    return false;
  }

  for (let i = -windowSteps; i <= windowSteps; i++) {
    const stepTime = now + i * 30 * 1000;
    const computedCode = await generateTOTP(secret, stepTime);
    if (computedCode === cleanCode) {
      return true;
    }
  }
  return false;
}

/**
 * Generates backup recovery codes (5 codes, CC-XXXX-YYYY format).
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Distinguishable characters
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : require('crypto').webcrypto;
  
  for (let i = 0; i < 5; i++) {
    const randomVals = new Uint8Array(8);
    cryptoObj.getRandomValues(randomVals);
    
    let part1 = '';
    let part2 = '';
    for (let j = 0; j < 4; j++) {
      part1 += chars[randomVals[j] % chars.length];
      part2 += chars[randomVals[j + 4] % chars.length];
    }
    codes.push(`CC-${part1}-${part2}`);
  }
  return codes;
}

/**
 * Generates an otpauth URL for QR codes.
 */
export function generateOtpauthUrl(secret: string, email: string): string {
  const cleanEmail = encodeURIComponent(email);
  return `otpauth://totp/CleanCore:${cleanEmail}?secret=${secret}&issuer=CleanCore&algorithm=SHA1&digits=6&period=30`;
}
