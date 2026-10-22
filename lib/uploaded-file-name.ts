/**
 * The name of the uploaded source as a signed run may carry it (L-05).
 *
 * `uploadedFileName` goes into the signed evidence — every finding names the
 * file it was found in — and is printed in the audit pack and on screen. It
 * comes from the request body, so it is held to what a browser's `File.name`
 * can be: a base name of at most 255 characters, without control characters,
 * without path separators and without the Unicode controls that reorder how
 * text is displayed (a name that reads `report.abap` on screen and is
 * something else in bytes).
 *
 * Pure and import-free; the route and the tests read the same rule.
 */

export const UPLOADED_FILE_NAME_MAX_CHARS = 255;

/** C0/C1 controls, DEL, and the bidirectional formatting characters. */
function isForbiddenCode(c: number): boolean {
  return (
    c <= 0x1f ||
    (c >= 0x7f && c <= 0x9f) ||
    c === 0x061c ||
    c === 0x200e ||
    c === 0x200f ||
    (c >= 0x202a && c <= 0x202e) ||
    (c >= 0x2066 && c <= 0x2069) ||
    c === 0xfeff
  );
}

function hasForbidden(value: string): boolean {
  for (let i = 0; i < value.length; i++) if (isForbiddenCode(value.charCodeAt(i))) return true;
  return false;
}

/**
 * Why this value cannot be signed as the file name, or null when it can.
 * `undefined`, `null` and the empty string are "no name given" and pass: the
 * route then uses its default.
 */
export function uploadedFileNameDefect(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return 'The file name must be text.';
  if (value.length > UPLOADED_FILE_NAME_MAX_CHARS) return `The file name is longer than ${UPLOADED_FILE_NAME_MAX_CHARS} characters.`;
  if (value.trim() === '') return 'The file name is blank.';
  if (hasForbidden(value)) return 'The file name contains a control character.';
  if (/[\\/]/.test(value)) return 'The file name must not contain a path.';
  return null;
}
