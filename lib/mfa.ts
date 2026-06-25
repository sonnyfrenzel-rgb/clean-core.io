import crypto from 'crypto';
import { encrypt, decrypt } from './s4-credentials';
import { verifyTOTP } from './totp';

/**
 * Hash a backup code using Node's native scryptSync with the user's UID as salt.
 * @deprecated Use hashBackupCodeWithSaltAndPepper instead.
 */
export function hashBackupCode(code: string, uid: string): string {
  const cleanCode = code.trim().toUpperCase();
  const salt = uid;
  return crypto.scryptSync(cleanCode, salt, 32).toString('base64');
}

/**
 * Hash a backup code with a specific random salt and a server-side pepper.
 */
export function hashBackupCodeWithSaltAndPepper(code: string, salt: string): string {
  const cleanCode = code.trim().toUpperCase();
  const pepper = process.env.MFA_BACKUP_CODE_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new Error('MFA_BACKUP_CODE_PEPPER is not configured (minimum 32 characters).');
  }
  // Combine code, salt and pepper. We pass the combined string as password and salt as salt.
  return crypto.scryptSync(cleanCode + pepper, salt, 32).toString('base64');
}

/**
 * Cryptographically timing-safe string comparison.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'base64');
  const bufB = Buffer.from(b, 'base64');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
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
 * Works with both old array of strings and new array of HashedBackupCode objects.
 */
export async function verifyMfa(
  secretEnc: string,
  backupCodes: any[],
  code: string,
  uid: string
): Promise<{ success: boolean; isBackupCode: boolean; remainingBackupCodes?: any[] }> {
  // 1. Try TOTP verification
  const isTotpValid = await verifyServerTOTP(secretEnc, code);
  if (isTotpValid) {
    return { success: true, isBackupCode: false };
  }

  // 2. Try backup code verification
  const cleanInput = code.trim().toUpperCase();
  for (let i = 0; i < backupCodes.length; i++) {
    const bc = backupCodes[i];
    if (typeof bc === 'string') {
      // old format (array of strings)
      const hashedInput = hashBackupCode(code, uid);
      if (timingSafeCompare(hashedInput, bc)) {
        const remaining = backupCodes.filter((_, idx) => idx !== i);
        return {
          success: true,
          isBackupCode: true,
          remainingBackupCodes: remaining,
        };
      }
    } else if (bc && typeof bc === 'object' && bc.salt && bc.hash) {
      // new format (array of objects { salt, hash, createdAt, usedAt })
      const expectedHash = hashBackupCodeWithSaltAndPepper(cleanInput, bc.salt);
      if (timingSafeCompare(expectedHash, bc.hash)) {
        // Remove the consumed backup code
        const remaining = backupCodes.filter((_, idx) => idx !== i);
        return {
          success: true,
          isBackupCode: true,
          remainingBackupCodes: remaining,
        };
      }
    }
  }

  return { success: false, isBackupCode: false };
}
