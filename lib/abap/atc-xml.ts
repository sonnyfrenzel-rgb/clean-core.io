/**
 * ATC results as XML — the two open shapes a check run is exported in besides
 * a spreadsheet (roadmap 3.0.21, owner decision 22.10.2026: "dock on, don't
 * compete").
 *
 *   - **The ADT ATC worklist** (`atcworklist:worklist`): what ABAP Development
 *     Tools receives from the system's ATC REST resource and what the result
 *     browser's XML export holds. One `object` per checked program, class or
 *     function group, each with its `finding`s; the finding's `location` is an
 *     ADT URI whose fragment `#start=<line>,<column>` names the line, and whose
 *     path names the include the line stands in. The worklist carries the time
 *     the run was made (`timestamp`), which is the date the panel names.
 *   - **Checkstyle XML** (`<checkstyle><file name><error line severity message
 *     source/>`): the shape CI pipelines write ATC results in. It carries no run
 *     date, and it is a generic format — other linters write it too — so the
 *     screen names the format, never more than the file says.
 *
 * The shapes are read from their element and attribute names, which are the
 * documented, openly published structures; nothing here fetches anything. The
 * XML is scanned, not evaluated: no DTD, no entity beyond the five predefined
 * ones and numeric references, no external reference — so a file cannot make
 * the browser load or expand anything.
 *
 * Personal data: the worklist names a person on every finding (`processor`,
 * `lastChangedBy`) and every object (`author`). None of it is read into a
 * finding; the whitelist in `atc-privacy.ts` holds the line again.
 */

import type { AtcFinding, AtcFormat, AtcPriority, AtcQuarantineEntry } from './atc-model';
import { objectNameOfFile } from './include-resolution';

/** What the XML half hands to `parseAtc`. */
export interface AtcXmlRead {
  format: Exclude<AtcFormat, 'table'>;
  findings: AtcFinding[];
  quarantined: AtcQuarantineEntry[];
  warnings: string[];
  /** ISO date of the ATC run, when the file names one. */
  runAt?: string;
}

/** True when the text is XML — a declaration or a first element, after an optional byte order mark. */
export function looksLikeXml(text: string): boolean {
  return /^﻿?\s*</.test(text);
}

/* ------------------------------------------------------------ the scanner */

interface Element {
  /** Qualified name as written, e.g. `atcfinding:finding`. */
  name: string;
  /** Attributes by local name (after the prefix), upper-cased key. Later duplicates do not overwrite. */
  attrs: Record<string, string>;
  /** Index just after the start tag. */
  end: number;
  selfClosing: boolean;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[ref.toLowerCase()] ?? whole;
  });
}

function localName(qualified: string): string {
  const colon = qualified.indexOf(':');
  return (colon < 0 ? qualified : qualified.slice(colon + 1)).toUpperCase();
}

/** Every start tag whose local name is one of `names`, in document order. */
function startTags(xml: string, names: readonly string[]): Element[] {
  const wanted = new Set(names.map((n) => n.toUpperCase()));
  const out: Element[] = [];
  const tag = /<([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  for (let m = tag.exec(xml); m; m = tag.exec(xml)) {
    if (!wanted.has(localName(m[1]))) continue;
    const attrs: Record<string, string> = {};
    const attr = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    for (let a = attr.exec(m[2]); a; a = attr.exec(m[2])) {
      const key = localName(a[1]);
      if (key.startsWith('XMLNS') || a[1].startsWith('xmlns')) continue;
      if (!(key in attrs)) attrs[key] = decodeEntities(a[2] ?? a[3] ?? '');
    }
    out.push({ name: m[1], attrs, end: tag.lastIndex, selfClosing: m[3] === '/' });
  }
  return out;
}

/** The text between a start tag and its matching end tag (no nesting of the same name assumed). */
function innerOf(xml: string, element: Element): string {
  if (element.selfClosing) return '';
  const close = xml.indexOf(`</${element.name}`, element.end);
  return close < 0 ? xml.slice(element.end) : xml.slice(element.end, close);
}

/* --------------------------------------------------------------- shared */

function isoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

function lineOf(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) return undefined;
  const n = Number(value.trim());
  return n > 0 ? n : undefined;
}

const PRIORITY: Record<string, AtcPriority> = {
  '1': 'error', '2': 'warning', '3': 'info',
  ERROR: 'error', WARNING: 'warning', INFO: 'info', INFORMATION: 'info',
};

const EXEMPTED_TRUE = new Set(['X', 'TRUE', 'YES', 'APPROVED', 'EXEMPTED']);
const EXEMPTED_FALSE = new Set(['', '-', 'FALSE', 'NO', 'NOT APPROVED', 'OPEN']);

/**
 * An ADT URI's object and line: `/sap/bc/adt/programs/includes/zfoo_f01/source/main#start=12,4`
 * → include `ZFOO_F01`, line 12. The object segment follows the collection
 * that names it (`programs/programs`, `programs/includes`, `oo/classes`,
 * `oo/interfaces`, `functions/groups/<group>/includes` or `…/fmodules`).
 */
export function adtLocation(uri: string | undefined): { object?: string; include?: string; line?: number } {
  if (!uri) return {};
  const [path, fragment = ''] = uri.split('#');
  const start = /(?:^|[;&])start=(\d+)/.exec(fragment)?.[1];
  const line = start ? lineOf(start) : undefined;
  const segment = (rx: RegExp) => {
    const raw = rx.exec(path)?.[1];
    return raw ? decodeURIComponent(raw).toUpperCase() : undefined;
  };
  const include =
    segment(/\/programs\/includes\/([^/?#]+)/i) ??
    segment(/\/functions\/groups\/[^/]+\/includes\/([^/?#]+)/i);
  const object =
    segment(/\/programs\/programs\/([^/?#]+)/i) ??
    segment(/\/oo\/classes\/([^/?#]+)/i) ??
    segment(/\/oo\/interfaces\/([^/?#]+)/i) ??
    segment(/\/functions\/groups\/([^/?#]+)/i) ??
    include;
  return { ...(object ? { object } : {}), ...(include ? { include } : {}), ...(line ? { line } : {}) };
}

/* ------------------------------------------------------- the ADT worklist */

function readWorklist(xml: string): AtcXmlRead {
  const root = startTags(xml, ['worklist'])[0];
  const findings: AtcFinding[] = [];
  const quarantined: AtcQuarantineEntry[] = [];
  const warnings: string[] = [];
  let position = 0;
  let unreadablePriorities = 0;
  for (const object of startTags(xml, ['object'])) {
    const objectName = (object.attrs.NAME ?? '').toUpperCase().trim();
    const objectType = (object.attrs.TYPE ?? '').toUpperCase().trim();
    for (const finding of startTags(innerOf(xml, object), ['finding'])) {
      position += 1;
      const at = adtLocation(finding.attrs.LOCATION);
      const name = objectName || at.object || '';
      const message = (finding.attrs.MESSAGETITLE ?? '').trim();
      if (!name) {
        quarantined.push({ row: position, objectName: '—', reason: 'no object name' });
        continue;
      }
      if (!message) {
        quarantined.push({ row: position, objectName: name, reason: 'no finding text' });
        continue;
      }
      const rawPriority = (finding.attrs.PRIORITY ?? '').trim().toUpperCase();
      const priority = PRIORITY[rawPriority] ?? 'unknown';
      if (!PRIORITY[rawPriority]) unreadablePriorities += 1;
      const approval = finding.attrs.EXEMPTIONAPPROVAL;
      const exempted =
        approval === undefined ? undefined
          : EXEMPTED_TRUE.has(approval.trim().toUpperCase()) ? true
            : EXEMPTED_FALSE.has(approval.trim().toUpperCase()) ? false
              : undefined;
      findings.push({
        objectName: name,
        ...(objectType ? { objectType } : {}),
        ...(finding.attrs.CHECKID ? { checkId: finding.attrs.CHECKID.trim() } : {}),
        ...(finding.attrs.CHECKTITLE ? { checkTitle: finding.attrs.CHECKTITLE.trim() } : {}),
        message,
        priority,
        ...(at.line ? { line: at.line } : {}),
        ...(at.include && at.include !== name ? { include: at.include } : {}),
        ...(exempted !== undefined ? { exempted } : {}),
      });
    }
  }
  if (unreadablePriorities > 0) {
    warnings.push(
      `${unreadablePriorities} priorit${unreadablePriorities === 1 ? 'y value' : 'y values'} not recognised and ` +
        'kept as "unknown" — not assumed to be a minor finding.',
    );
  }
  const runAt = isoDate(root?.attrs.TIMESTAMP);
  if (!runAt) warnings.push('The worklist names no readable run date, so the panel cannot say when ATC ran.');
  return { format: 'adt-worklist-xml', findings, quarantined, warnings, ...(runAt ? { runAt } : {}) };
}

/* -------------------------------------------------------------- checkstyle */

/** The object a checkstyle `file name` stands for: an ADT URI, a path with an abapGit name, or a bare name. */
function objectOfCheckstyleFile(name: string): { object: string; include?: string } {
  if (/\/sap\/bc\/adt\//i.test(name)) {
    const at = adtLocation(name);
    if (at.object) return { object: at.object, ...(at.include && at.include !== at.object ? { include: at.include } : {}) };
  }
  const base = name.split(/[\\/]/).pop() ?? name;
  return { object: (/\.abap$/i.test(base) ? objectNameOfFile(base) : base).toUpperCase().trim() };
}

function readCheckstyle(xml: string): AtcXmlRead {
  const findings: AtcFinding[] = [];
  const quarantined: AtcQuarantineEntry[] = [];
  const warnings: string[] = [];
  let position = 0;
  let unreadable = 0;
  for (const file of startTags(xml, ['file'])) {
    const { object, include } = objectOfCheckstyleFile((file.attrs.NAME ?? '').trim());
    for (const error of startTags(innerOf(xml, file), ['error'])) {
      position += 1;
      const message = (error.attrs.MESSAGE ?? '').trim();
      if (!object) {
        quarantined.push({ row: position, objectName: '—', reason: 'no object name' });
        continue;
      }
      if (!message) {
        quarantined.push({ row: position, objectName: object, reason: 'no finding text' });
        continue;
      }
      const raw = (error.attrs.SEVERITY ?? '').trim().toUpperCase();
      const priority = PRIORITY[raw] ?? 'unknown';
      if (!PRIORITY[raw]) unreadable += 1;
      const line = lineOf(error.attrs.LINE);
      findings.push({
        objectName: object,
        ...(error.attrs.SOURCE ? { checkId: error.attrs.SOURCE.trim() } : {}),
        message,
        priority,
        ...(line ? { line } : {}),
        ...(include ? { include } : {}),
      });
    }
  }
  if (unreadable > 0) {
    warnings.push(`${unreadable} severity value${unreadable === 1 ? '' : 's'} not recognised and kept as "unknown" — not assumed to be a minor finding.`);
  }
  warnings.push('Checkstyle XML carries no run date. Enter the date of the ATC run, or the panel says only when the file was imported.');
  return { format: 'checkstyle-xml', findings, quarantined, warnings };
}

/* ------------------------------------------------------------------ entry */

/**
 * Read an ATC result in one of the two XML shapes. Throws a sentence a reader
 * can act on when the XML is neither.
 */
export function parseAtcXmlText(xml: string): AtcXmlRead {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error('This XML declares a document type or entities, which an ATC export does not. It was not read.');
  }
  if (startTags(xml, ['worklist']).length > 0) return readWorklist(xml);
  if (startTags(xml, ['checkstyle']).length > 0) return readCheckstyle(xml);
  throw new Error(
    'This XML is neither an ATC worklist (atcworklist:worklist, as ABAP Development Tools exports it) nor checkstyle XML. Export the ATC result in one of these, or as CSV or XLSX.',
  );
}
