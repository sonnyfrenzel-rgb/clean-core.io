import crypto from 'crypto';
import { encrypt, decrypt } from './s4-credentials';
import { verifyTOTP } from './totp';

/**
 * Hash a backup code using Node's native scryptSync with the user's UID as salt.
 */
export function hashBackupCode(code: string, uid: string): string {
  const cleanCode = code.trim().toUpperCase();
  // Using user's UID as a salt
  const salt = uid;
  return crypto.scryptSync(cleanCode, salt, 32).toString('base64');
}

/**
 * Encrypt the TOTP secret using AES-256-GCM.
 */
export function encryptMfaSecret(secret: string): string {
  return encrypt(secret);
}

/**
 * Decrypt the TOTP secret using AES-256-GCM.
 */
export function decryptMfaSecret(encrypted: string): string {
  return decrypt(encrypted);
}

/**
 * Verify a TOTP code against the decrypted secret.
 */
export async function verifyServerTOTP(secretEnc: string, code: string): Promise<boolean> {
  try {
    const secret = decryptMfaSecret(secretEnc);
    return await verifyTOTP(secret, code);
  } catch (err) {
    console.error('[verifyServerTOTP] Failed to verify TOTP:', err);
    return false;
  }
}

/**
 * Verify a code (either TOTP or backup code).
 * Returns verification outcome, whether it was a backup code, and updated backup codes list.
 */
export async function verifyMfa(
  secretEnc: string,
  hashedBackupCodes: string[],
  code: string,
  uid: string
): Promise<{ success: boolean; isBackupCode: boolean; remainingBackupCodes?: string[] }> {
  // 1. Try TOTP verification
  const isTotpValid = await verifyServerTOTP(secretEnc, code);
  if (isTotpValid) {
    return { success: true, isBackupCode: false };
  }

  // 2. Try backup code verification
  const hashedInput = hashBackupCode(code, uid);
  const matchedIndex = hashedBackupCodes.indexOf(hashedInput);
  if (matchedIndex !== -1) {
    const remaining = hashedBackupCodes.filter((_, idx) => idx !== matchedIndex);
    return {
      success: true,
      isBackupCode: true,
      remainingBackupCodes: remaining,
    };
  }

  return { success: false, isBackupCode: false };
}
