import { TERMS_EFFECTIVE_DATE_ISO, type LegalLang } from '@/lib/legal/open-values';
import { currentTermsChanges, type TermsChanges } from './changes';
import { buildTermsAnnouncementMail, clauseList, NOTICE_BASE_URL, type NoticeAttachment } from './mail';
import { NOTICE_FILE_PATH, NOTICE_SUMMARY_PATH } from './notice-paths';

/**
 * The notice of the current amendment (Terms 10.1) as the in-app dialog offers
 * it: the same attachment the mail carries, built by the same builder
 * (`buildTermsAnnouncementMail`), and the same list of changed provisions with
 * their reasons under 10.4. Dialog = notice: nothing here writes its own text.
 *
 * Read at build time by the two prerendered routes under `/terms/notice`, so
 * the archived file of the version in force is read off disk once, during
 * `next build`, never in a request.
 */

export interface NoticeSummary {
  /** The version announced (TERMS_VERSION) and its label. */
  version: string;
  label: string;
  /** The version it replaces. */
  from: { version: string; label: string };
  /** The day the amendment takes effect (TERMS_EFFECTIVE_DATE_ISO). */
  effectiveDateIso: string;
  /** The attachment of the mail: file name, SHA-256 and where to download it. */
  file: { filename: string; sha256: string; href: string };
  /** "2.1 (c): short reason" per changed provision, as the attachment lists them. */
  clauses: Record<LegalLang, string[]>;
  /** SHA-256 over the canonical change list, as every sent notice records it. */
  changesDigest: string;
}

export { NOTICE_FILE_PATH, NOTICE_SUMMARY_PATH };

export interface CurrentNotice {
  changes: TermsChanges;
  attachment: NoticeAttachment;
  summary: NoticeSummary;
}

/** The notice as the send script would build it today, or null while no effective day is set. */
export function currentNotice(root: string = process.cwd(), effectiveDateIso: string | null = TERMS_EFFECTIVE_DATE_ISO): CurrentNotice | null {
  if (!effectiveDateIso) return null;
  const changes = currentTermsChanges(root);
  const mail = buildTermsAnnouncementMail({ changes, effectiveDateIso, baseUrl: NOTICE_BASE_URL });
  const attachment = mail.attachments[0];
  return {
    changes,
    attachment,
    summary: {
      version: changes.to.version,
      label: changes.to.label,
      from: { version: changes.from.version, label: changes.from.label },
      effectiveDateIso,
      file: { filename: attachment.filename, sha256: attachment.sha256, href: NOTICE_FILE_PATH },
      clauses: { de: clauseList(changes.changes, 'de'), en: clauseList(changes.changes, 'en') },
      changesDigest: changes.digest,
    },
  };
}
