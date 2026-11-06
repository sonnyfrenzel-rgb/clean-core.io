/**
 * Where the notice of the current amendment is served (`app/terms/notice/`).
 * No imports, so the client dialog can name the addresses without pulling the
 * builder, which reads files, into the browser bundle.
 */

/** The attachment of the mail, for download. */
export const NOTICE_FILE_PATH = '/terms/notice';
/** The summary the dialog reads: the changed provisions with their reasons, the effective day, the file. */
export const NOTICE_SUMMARY_PATH = '/terms/notice/changes';
