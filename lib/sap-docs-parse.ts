/**
 * Reads communication scenarios out of SAP's documentation sources on GitHub
 * (github.com/SAP-docs, CC BY 4.0) — Markdown as those repositories write it:
 * pipe tables, HTML tables inside Markdown, bullet lists with the title in
 * emphasis, and prose that names IDs alone. Pure; the sync calls it, the specs
 * feed it hand-written fixtures.
 *
 * What is read, and nothing more: the ID, SAP's title where the text pairs one
 * with the ID, the APIs named beside it, and "deprecated" only when the
 * scenario's own text says so. A service plan the page calls deprecated
 * (`sap_com_0109`, lower case) is a plan, not a scenario, and is not read at
 * all.
 */

export interface ParsedTable {
  headers: string[];
  rows: Array<Record<string, string>>;
}

export interface ParsedScenario {
  id: string;
  title: string | null;
  apiRefs: string[];
  protocol: 'V2' | 'V4' | 'REST' | 'SOAP' | null;
  deprecated: boolean | null;
}

const SCENARIO_ID = /SAP_COM_[0-9A-Z]{4}\b/g;

/** Markdown backslash escapes undone: `SAP\_COM\_0109` → `SAP_COM_0109`, `\(` → `(`. */
export function unescapeMarkdown(s: string): string {
  return s.replace(/\\([\\`*_{}[\]()#+\-.!|<>])/g, '$1');
}

/** Cell or line text as a reader sees it: tags, links, emphasis and code marks gone, whitespace collapsed. */
export function plainText(s: string): string {
  return unescapeMarkdown(s)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*`]/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------------------------ tables */

function splitPipeRow(line: string): string[] {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\\' && t[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (t[i] === '|') {
      cells.push(cur);
      cur = '';
    } else cur += t[i];
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function pipeTables(md: string): ParsedTable[] {
  const lines = md.split(/\r?\n/);
  const out: ParsedTable[] = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!/^\s*\|.*\|\s*$/.test(lines[i]) || !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i + 1])) continue;
    const headers = splitPipeRow(lines[i]).map(plainText);
    const rows: Array<Record<string, string>> = [];
    let j = i + 2;
    for (; j < lines.length && /^\s*\|/.test(lines[j]); j++) {
      const cells = splitPipeRow(lines[j]);
      const row: Record<string, string> = {};
      headers.forEach((h, k) => (row[h] = cells[k] ?? ''));
      rows.push(row);
    }
    out.push({ headers, rows });
    i = j - 1;
  }
  return out;
}

interface HtmlCell {
  text: string;
  colspan: number;
  rowspan: number;
  header: boolean;
}

function htmlCells(tr: string): HtmlCell[] {
  const cells: HtmlCell[] = [];
  for (const m of tr.matchAll(/<(t[hd])\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const attrs = m[2];
    const span = (name: string) => Math.max(1, Number(new RegExp(`${name}\\s*=\\s*"?(\\d+)`, 'i').exec(attrs)?.[1] ?? 1));
    cells.push({ text: m[3], colspan: span('colspan'), rowspan: span('rowspan'), header: m[1].toLowerCase() === 'th' });
  }
  return cells;
}

function htmlTables(md: string): ParsedTable[] {
  const out: ParsedTable[] = [];
  for (const t of md.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const trs = [...t[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => htmlCells(m[1]));
    if (!trs.length) continue;
    // A grid with column and row spans laid out, so every row has every column.
    const grid: string[][] = [];
    const carry: Array<{ text: string; left: number } | undefined> = [];
    for (const cells of trs) {
      const row: string[] = [];
      let col = 0;
      let k = 0;
      while (k < cells.length || carry.slice(col).some((c) => c && c.left > 0)) {
        const pending = carry[col];
        if (pending && pending.left > 0) {
          row[col] = pending.text;
          pending.left--;
          col++;
          continue;
        }
        if (k >= cells.length) {
          col++;
          continue;
        }
        const cell = cells[k++];
        for (let s = 0; s < cell.colspan; s++) {
          row[col] = cell.text;
          if (cell.rowspan > 1) carry[col] = { text: cell.text, left: cell.rowspan - 1 };
          col++;
        }
      }
      grid.push(row);
    }
    const headerRowIsTh = trs[0].every((c) => c.header);
    const headers = (grid[0] ?? []).map((h) => plainText(h ?? ''));
    const body = headerRowIsTh || headers.length ? grid.slice(1) : grid;
    out.push({
      headers,
      rows: body.map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']))),
    });
  }
  return out;
}

/** Every table in a Markdown file, pipe or HTML, each row keyed by its header. */
export function parseTables(md: string): ParsedTable[] {
  return [...pipeTables(md), ...htmlTables(md)];
}

/* ------------------------------------------------ scenarios */

function protocolIn(text: string): ParsedScenario['protocol'] {
  const m = /\bOData\s*(?:v(?:ersion)?\s*)?([24])\b|\b(SOAP|REST)\b/i.exec(text);
  if (!m) return null;
  return m[1] ? (`V${m[1]}` as 'V2' | 'V4') : (m[2].toUpperCase() as 'SOAP' | 'REST');
}

function apiRefsIn(raw: string): string[] {
  const text = unescapeMarkdown(raw);
  const refs = new Set<string>();
  for (const m of text.matchAll(/api\.sap\.com\/api\/([A-Za-z][A-Za-z0-9_]+)\b/g)) refs.add(m[1]);
  for (const m of text.matchAll(/\bAPI_[A-Z0-9_]*[A-Z0-9]\b/g)) refs.add(m[0]);
  return [...refs].sort();
}

/**
 * The scenario a piece of text names: the last `(SAP_COM_nnnn)` in it, and
 * the words before it as the title. "Security Information and Event Management
 * Integration (SIEM) (SAP_COM_0750)" keeps its "(SIEM)".
 */
export function scenarioInText(raw: string): Omit<ParsedScenario, 'apiRefs' | 'protocol'> | null {
  const text = plainText(raw);
  const all = [...text.matchAll(/\((SAP_COM_[0-9A-Z]{4})\)/g)];
  if (all.length) {
    const last = all[all.length - 1];
    const title = text.slice(0, last.index).replace(/^[\s:;,.-]+|[\s:;,.-]+$/g, '').trim();
    return { id: last[1], title: title || null, deprecated: /\bdeprecated\b/i.test(text) ? true : null };
  }
  const bare = text.match(SCENARIO_ID);
  return bare && bare.length === 1 ? { id: bare[0], title: null, deprecated: null } : null;
}

/** Scenarios from every table that has a communication-scenario column (found by its header, not its position). */
export function scenariosFromTables(md: string): ParsedScenario[] {
  const out: ParsedScenario[] = [];
  for (const table of parseTables(md)) {
    const scenarioCol =
      table.headers.find((h) => /communication scenario/i.test(h)) ??
      table.headers.find((h) => table.rows.some((r) => /SAP\\?_COM\\?_[0-9A-Z]{4}/.test(r[h] ?? '')));
    if (!scenarioCol) continue;
    const apiCols = table.headers.filter((h) => h !== scenarioCol && /\b(api|service|interface)\b/i.test(h));
    const protocolCols = table.headers.filter((h) => /protocol|odata version|api version/i.test(h));
    for (const row of table.rows) {
      const s = scenarioInText(row[scenarioCol] ?? '');
      if (!s) continue;
      const apiText = apiCols.map((h) => row[h] ?? '').join(' ');
      out.push({
        ...s,
        apiRefs: apiRefsIn(apiText),
        protocol: protocolCols.length ? protocolIn(protocolCols.map((h) => plainText(row[h] ?? '')).join(' ')) : null,
      });
    }
  }
  return out;
}

/**
 * Scenarios written in prose or lists with the title in emphasis:
 * `*Sales Order Integration \(SAP\_COM\_0109\)*: … https://api.sap.com/api/API_SALES_ORDER_SRV/…`.
 * Tables are left to `scenariosFromTables`.
 */
export function scenariosFromProse(md: string): ParsedScenario[] {
  const withoutTables = md.replace(/<table\b[\s\S]*?<\/table>/gi, ' ').split(/\r?\n/).filter((l) => !/^\s*\|/.test(l));
  const out: ParsedScenario[] = [];
  for (const line of withoutTables) {
    const text = unescapeMarkdown(line);
    for (const m of text.matchAll(/\*([^*\n]+?\((SAP_COM_[0-9A-Z]{4})\)[^*\n]*?)\*/g)) {
      const s = scenarioInText(m[1]);
      if (!s) continue;
      out.push({ ...s, apiRefs: apiRefsIn(line), protocol: null });
    }
  }
  return out;
}

/**
 * IDs named alone in sentences that place them in a product: "the automatic
 * enablement of the `SAP_COM_0892` communication scenario in SAP S/4HANA
 * Cloud". No title is read — the sentence names none.
 */
export function scenarioIdsInContext(md: string, context: RegExp): ParsedScenario[] {
  const out: ParsedScenario[] = [];
  const seen = new Set<string>();
  for (const line of md.split(/\r?\n/)) {
    const text = unescapeMarkdown(line);
    if (!/communication scenarios?/i.test(text) || !context.test(text)) continue;
    for (const m of text.matchAll(SCENARIO_ID)) {
      if (seen.has(m[0])) continue;
      seen.add(m[0]);
      out.push({ id: m[0], title: null, apiRefs: [], protocol: null, deprecated: null });
    }
  }
  return out;
}

/** The licence a REUSE.toml states for every path (`path = "**"`), or null. */
export function reuseLicense(toml: string): string | null {
  for (const block of toml.split(/\[\[annotations\]\]/).slice(1)) {
    const path = /^\s*path\s*=\s*"([^"]*)"/m.exec(block)?.[1];
    const spdx = /^\s*SPDX-License-Identifier\s*=\s*"([^"]+)"/m.exec(block)?.[1];
    if (path === '**' && spdx) return spdx.trim();
  }
  return null;
}
