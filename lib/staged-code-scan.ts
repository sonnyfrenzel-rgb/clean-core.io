/**
 * The content half of the upload scan, at module scope so the paste path can use
 * it too.
 *
 * It used to live only inside the upload handler. Pasting set `legacyCode`
 * straight from the textarea's onChange, and the banner below the editor — which
 * hangs on `legacyCode` merely existing — then told the reader the file was
 * "clean and safe for processing", having been scanned by nothing at all.
 * Uploads were genuinely checked and genuinely blocked. Paste was not, and paste
 * is the common case.
 */
export function scanCodeContent(content: string): string | null {
  const lower = content.toLowerCase();

  // Exploit / Script Injection Checks
  const maliciousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /javascript:/i,
    /onerror\s*=/i,
    /onload\s*=/i,
    /eval\s*\(/i,
    /exec\s*\(/i,
    /system\s*\(/i,
    /spawn\s*\(/i,
    /fork\s*\(/i,
    /sh\s+-c/i,
    /bash\s+-c/i,
    /cmd\.exe/i,
    /powershell/i
  ];

  for (const pattern of maliciousPatterns) {
    if (pattern.test(content)) {
      return 'Security Block: Malicious script or shell injection payload detected in staged code. Raw iframe elements, shell commands, and execution wrappers are blocked.';
    }
  }

  // Plaintext SAP Secrets Check
  const secretKeywords = [
    "sap_pass", "db_password", "client_secret", "begin private key", "-----begin"
  ];
  for (const key of secretKeywords) {
    if (lower.includes(key)) {
      return 'Security Block: Plaintext security credential leak detected. Master passwords or private keys are prohibited to prevent corporate security breaches.';
    }
  }

  return null;
}
