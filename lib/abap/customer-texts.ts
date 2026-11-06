/**
 * The customer's own texts from an uploaded abapGit package (concept "Business-Lesbarkeit" H5(b), owner decision
 * 06.11.2026): the descriptions the customer's dictionary gives its data elements, tables and their fields, the texts
 * of a domain's fixed values, and the program's selection texts and text symbols — read from the abapGit XML files
 * beside the sources (`zfoo.dtel.xml`, `ztab.tabl.xml`, `zdom.doma.xml`, `zprog.prog.xml`), which the import only
 * counted before.
 *
 * From engine 3.5.0 (`ENGINE_READS_350_FROM`) they are the first source of words for that project's Business view —
 * before the glossary and the dictionary — and every word taken from them is marked "customer text"
 * (`CUSTOMER_TEXT_LABEL`). They are the customer's, not SAP's and not ours: they stay with the project
 * (`projects/{id}/customer_texts/current`, Admin SDK only, deleted with the project) and never enter the signed payload
 * or the audit pack.
 *
 * Pure and bounded: no XML library, a reader for the few tags abapGit writes, every text trimmed and cut to
 * `MAX_TEXT`, at most `MAX_ENTRIES` entries per kind. A file it cannot read adds nothing.
 */

export const CUSTOMER_TEXT_LABEL = 'Customer text';
export const CUSTOMER_TEXTS_VERSION = 1;

/** The longest text kept; SAP's own description fields are 60 characters. */
export const MAX_TEXT = 80;
/** Per kind (fields, tables, …): a package with more is read up to here. */
export const MAX_ENTRIES = 5000;

export interface CustomerTexts {
  version: typeof CUSTOMER_TEXTS_VERSION;
  /** Data elements and table fields, lower-case name → text ("profl" → "Dangerous goods profile"). */
  fields: Record<string, string>;
  /** Tables and views, lower-case name → its description ("zsd_minmenge" → "Minimum quantities per customer"). */
  tables: Record<string, string>;
  /** A field's or a domain's fixed values: lower-case field or domain → value (upper case) → text. */
  values: Record<string, Record<string, string>>;
  /** Selection texts: lower-case parameter or select-option → text ("p_werks" → "Plant"). */
  selections: Record<string, string>;
  /** Text symbols, by id (`TEXT-001` → "001"). */
  textSymbols: Record<string, string>;
}

export function emptyCustomerTexts(): CustomerTexts {
  return { version: CUSTOMER_TEXTS_VERSION, fields: {}, tables: {}, values: {}, selections: {}, textSymbols: {} };
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITIES[e])
    .replace(/&#(\d{1,6});/g, (_, n: string) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, n: string) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)));
}

/** A text as kept: entities decoded, no control characters, whitespace collapsed, at most `MAX_TEXT`. */
function clean(text: string | undefined): string {
  if (!text) return '';
  return decode(text).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

/** The text of the first `<tag>` inside `xml`. */
function tag(xml: string, name: string): string | undefined {
  return new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml)?.[1];
}

/** Every `<tag>…</tag>` block inside `xml`. */
function blocks(xml: string, name: string): string[] {
  return [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g'))].map((m) => m[1]);
}

const NAME = /^[A-Za-z0-9_/]{1,40}$/;
const put = (map: Record<string, string>, key: string | undefined, text: string) => {
  const k = clean(key).toLowerCase();
  if (!k || !NAME.test(k) || !text || Object.keys(map).length >= MAX_ENTRIES || Object.prototype.hasOwnProperty.call(map, k)) return;
  map[k] = text;
};

/** What one abapGit XML file adds. `links` collects field → data element → domain, resolved in `finish`. */
interface Links {
  fieldElement: Map<string, string>;
  elementDomain: Map<string, string>;
  domainValues: Map<string, Record<string, string>>;
}

function readOne(fileName: string, xml: string, out: CustomerTexts, links: Links): void {
  const base = (fileName.split('/').pop() ?? fileName).toLowerCase();
  const type = /\.([a-z]{4})\.xml$/.exec(base)?.[1];
  if (type === 'dtel') {
    const v = tag(xml, 'DD04V');
    if (!v) return;
    const name = clean(tag(v, 'ROLLNAME'));
    put(out.fields, name, clean(tag(v, 'SCRTEXT_L')) || clean(tag(v, 'DDTEXT')) || clean(tag(v, 'SCRTEXT_M')));
    const domain = clean(tag(v, 'DOMNAME')).toLowerCase();
    if (name && domain) links.elementDomain.set(name.toLowerCase(), domain);
  } else if (type === 'tabl' || type === 'view') {
    const v = tag(xml, type === 'tabl' ? 'DD02V' : 'DD25V');
    if (v) put(out.tables, tag(v, type === 'tabl' ? 'TABNAME' : 'VIEWNAME'), clean(tag(v, 'DDTEXT')));
    for (const f of blocks(xml, 'DD03P')) {
      const field = clean(tag(f, 'FIELDNAME')).toLowerCase();
      const element = clean(tag(f, 'ROLLNAME')).toLowerCase();
      if (field && element && element !== field) links.fieldElement.set(field, element);
      // A field with a built-in type carries its own description.
      const own = clean(tag(f, 'DDTEXT'));
      if (own) put(out.fields, field, own);
    }
  } else if (type === 'doma') {
    const v = tag(xml, 'DD01V');
    const domain = clean(v ? tag(v, 'DOMNAME') : undefined).toLowerCase();
    if (!domain) return;
    const values: Record<string, string> = {};
    for (const d of blocks(xml, 'DD07V')) {
      const value = clean(tag(d, 'DOMVALUE_L')).toUpperCase();
      const text = clean(tag(d, 'DDTEXT'));
      if (value && text && Object.keys(values).length < 200) values[value] = text;
    }
    if (Object.keys(values).length) links.domainValues.set(domain, values);
  } else if (type === 'prog' || type === 'fugr' || type === 'clas') {
    for (const item of blocks(xml, 'item')) {
      const id = clean(tag(item, 'ID'));
      const key = clean(tag(item, 'KEY'));
      // A selection text written as "D       ." takes the dictionary's text: nothing of the customer's own.
      const entry = clean(tag(item, 'ENTRY'));
      if (!key || !entry || /^D\s*\.?$/.test(entry)) continue;
      if (id === 'S') put(out.selections, key, entry.replace(/^D\s{2,}/, ''));
      else if (id === 'I' && /^[A-Za-z0-9]{1,3}$/.test(key) && Object.keys(out.textSymbols).length < MAX_ENTRIES) out.textSymbols[key.toUpperCase()] = entry;
    }
  }
}

/** The customer's texts out of the abapGit XML files of one upload; `null` when none of them has any. */
export function readCustomerTexts(files: ReadonlyArray<{ name: string; text: string }>): CustomerTexts | null {
  const out = emptyCustomerTexts();
  const links: Links = { fieldElement: new Map(), elementDomain: new Map(), domainValues: new Map() };
  for (const f of files) {
    try {
      readOne(f.name, String(f.text ?? ''), out, links);
    } catch { /* a file that cannot be read adds nothing */ }
  }
  // A table field takes its data element's text; a field and its element take their domain's fixed values.
  for (const [field, element] of links.fieldElement) {
    const text = out.fields[element];
    if (text) put(out.fields, field, text);
  }
  for (const [element, domain] of links.elementDomain) {
    const values = links.domainValues.get(domain);
    if (values && !out.values[element]) out.values[element] = values;
  }
  for (const [field, element] of links.fieldElement) {
    const values = out.values[element] ?? links.domainValues.get(element);
    if (values && !out.values[field]) out.values[field] = values;
  }
  const count = Object.keys(out.fields).length + Object.keys(out.tables).length + Object.keys(out.values).length
    + Object.keys(out.selections).length + Object.keys(out.textSymbols).length;
  return count ? out : null;
}

/** Whether a stored or posted value is customer texts this build reads — the shape, the bounds, strings only. */
export function isCustomerTexts(value: unknown): value is CustomerTexts {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.version !== CUSTOMER_TEXTS_VERSION) return false;
  const flat = (m: unknown) => !!m && typeof m === 'object' && !Array.isArray(m)
    && Object.keys(m).length <= MAX_ENTRIES
    && Object.entries(m as Record<string, unknown>).every(([k, t]) => NAME.test(k) && typeof t === 'string' && t.length <= MAX_TEXT);
  const nested = (m: unknown) => !!m && typeof m === 'object' && !Array.isArray(m) && Object.keys(m).length <= MAX_ENTRIES
    && Object.entries(m as Record<string, unknown>).every(([k, vals]) => NAME.test(k) && !!vals && typeof vals === 'object'
      && Object.keys(vals as object).length <= 200
      && Object.entries(vals as Record<string, unknown>).every(([val, t]) => val.length <= 10 && typeof t === 'string' && t.length <= MAX_TEXT));
  return flat(v.fields) && flat(v.tables) && nested(v.values) && flat(v.selections) && flat(v.textSymbols);
}
