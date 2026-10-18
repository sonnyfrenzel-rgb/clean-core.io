/**
 * A small rule-based check for secrets and personal data in model text —
 * roadmap 3.0.18 item 9 (3), owner decision 15.10.2026.
 *
 * The decision took the idea of Guardrails AI's PII and secret validators, not
 * the library: those call a third-party model by default, and the point here is
 * that nothing leaves. So it is a list of patterns, each one narrow enough that
 * an ABAP program does not trip it by being an ABAP program — `INTO @DATA(ls)`
 * is no e-mail address, `'0000001000'` is no phone number, `lv_pwd = p_pwd` is
 * no password.
 *
 * Three uses, one module:
 *   - **case answers** ("Ask this case") — masked before they are shown, with a
 *     note saying what was masked (`screenSensitiveText`, `sensitiveTextNote`);
 *   - **the business layer of the documentation** — masked where the model's
 *     answer is accepted, before it is stored, so every export of it carries the
 *     masked text (`screenSensitiveValue`);
 *   - **fill bodies** of a generated package — a body that carries a secret is
 *     refused like any other body the checks on fills refuse (`secretInBody`),
 *     so it is never spliced and its reason, not its value, is what the package
 *     records.
 *
 * A finding never carries the value it found: it is a kind and a position, so a
 * finding can be logged, shown or written into a pack without repeating what it
 * exists to keep out. Pure, synchronous, no imports.
 */

export type SensitiveKind = 'password' | 'private-key' | 'api-key' | 'token' | 'email' | 'iban' | 'phone';

/** Kinds that are secrets rather than personal data. */
export const SECRET_KINDS: ReadonlySet<SensitiveKind> = new Set<SensitiveKind>(['password', 'private-key', 'api-key', 'token']);

export interface SensitiveFinding {
  kind: SensitiveKind;
  /** Position of the masked part in the text that was checked. */
  start: number;
  end: number;
}

const LABEL: Readonly<Record<SensitiveKind, [string, string]>> = {
  password: ['password', 'passwords'],
  'private-key': ['private key', 'private keys'],
  'api-key': ['access key', 'access keys'],
  token: ['token', 'tokens'],
  email: ['e-mail address', 'e-mail addresses'],
  iban: ['IBAN', 'IBANs'],
  phone: ['phone number', 'phone numbers'],
};

/** What replaces a masked value. */
export function maskFor(kind: SensitiveKind): string {
  return `[${LABEL[kind][0]} removed]`;
}

/* ----------------------------------------------------------------- patterns */

const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;

/** Vendor key formats with a fixed prefix — Google, OpenAI/Anthropic, GitHub, AWS, Slack, Stripe. */
const API_KEY =
  /\bAIza[0-9A-Za-z_-]{35}\b|\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bAKIA[0-9A-Z]{16}\b|\bxox[abposr]-[A-Za-z0-9-]{10,}|\b[sr]k_live_[0-9A-Za-z]{20,}\b/g;

/** A JSON Web Token, or a bearer credential. */
const TOKEN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g;

/** A name that says it holds a credential. */
const CREDENTIAL_NAME = String.raw`[A-Za-z0-9_-]*(?:password|passwort|passwd|kennwort|pwd|secret|api_?key|access_?key|auth_?token|client_?secret)[A-Za-z0-9_-]*`;

/**
 * A credential name given a literal value: `lv_password = 'Init1234'`,
 * `"client_secret": "…"`, `password: Hunter22`. The quoted form takes any
 * literal of three characters or more; the unquoted form only after `:` and
 * only a value with a digit in it, so "the password: required" stays prose and
 * `lv_pwd = p_pwd` (a variable, not a value) is never read as one.
 */
const CREDENTIAL_QUOTED = new RegExp(String.raw`\b(${CREDENTIAL_NAME})(["')]?\s*(?:=|:|\bis\b)\s*)(['"\`])([^'"\`\n]{3,})\3`, 'gi');
const CREDENTIAL_BARE = new RegExp(String.raw`\b(${CREDENTIAL_NAME})(\s*:\s*)([^\s'"\`,;]*\d[^\s'"\`,;]*)`, 'gi');

const EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g;

const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g;

/** International form with `+` (no space after it), or `00` with a separator after the country code. */
const PHONE = /(?<![\w+])(?:\+\d{1,3}|00\d{1,3}(?=[\s/-]))[\s./-]?(?:\(0\)[\s./-]?)?\d{1,5}(?:[\s./-]?\d{2,8}){1,4}\b/g;
/** A labelled number: `Tel.: 089 123 4567`, `phone 0170-1234567`. */
const PHONE_LABELLED = /\b(?:tel|telephone|phone|fax|mobile|telefon|handy)\b\.?\s*:?\s*([+(]?\d[\d\s()./-]{6,}\d)/gi;

const PLACEHOLDER = /^(?:\*+|x+|\.+|<[^>]*>|\$\{[^}]*\}|changeme|your[_-]?\w*|example|dummy|placeholder)$/i;

function ibanValid(raw: string): boolean {
  const s = raw.replace(/ /g, '');
  if (s.length < 15 || s.length > 34) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}

function digitCount(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

/* ------------------------------------------------------------------- finding */

/** Every secret and personal datum in a text, earliest first, overlaps merged to the first. */
export function findSensitive(text: string): SensitiveFinding[] {
  if (!text) return [];
  const found: SensitiveFinding[] = [];
  const add = (kind: SensitiveKind, start: number, end: number) => found.push({ kind, start, end });

  for (const m of text.matchAll(PRIVATE_KEY)) add('private-key', m.index!, m.index! + m[0].length);
  for (const m of text.matchAll(API_KEY)) add('api-key', m.index!, m.index! + m[0].length);
  for (const m of text.matchAll(TOKEN)) add('token', m.index!, m.index! + m[0].length);
  for (const m of text.matchAll(CREDENTIAL_QUOTED)) {
    const value = m[4];
    if (PLACEHOLDER.test(value.trim())) continue;
    const start = m.index! + m[1].length + m[2].length + 1;
    add('password', start, start + value.length);
  }
  for (const m of text.matchAll(CREDENTIAL_BARE)) {
    if (PLACEHOLDER.test(m[3])) continue;
    const start = m.index! + m[1].length + m[2].length;
    add('password', start, start + m[3].length);
  }
  for (const m of text.matchAll(EMAIL)) add('email', m.index!, m.index! + m[0].length);
  for (const m of text.matchAll(IBAN)) if (ibanValid(m[0])) add('iban', m.index!, m.index! + m[0].length);
  for (const m of text.matchAll(PHONE)) {
    const d = digitCount(m[0]);
    if (d >= 8 && d <= 15) add('phone', m.index!, m.index! + m[0].length);
  }
  for (const m of text.matchAll(PHONE_LABELLED)) {
    const d = digitCount(m[1]);
    if (d < 7 || d > 15) continue;
    const start = m.index! + m[0].length - m[1].length;
    add('phone', start, start + m[1].length);
  }

  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: SensitiveFinding[] = [];
  for (const f of found) {
    const last = merged[merged.length - 1];
    if (last && f.start < last.end) continue;
    merged.push(f);
  }
  return merged;
}

/** The text with every finding replaced by its mask, and what was masked. */
export function screenSensitiveText(text: string): { text: string; findings: SensitiveFinding[] } {
  const findings = findSensitive(text);
  if (findings.length === 0) return { text, findings };
  let out = '';
  let at = 0;
  for (const f of findings) {
    out += text.slice(at, f.start) + maskFor(f.kind);
    at = f.end;
  }
  return { text: out + text.slice(at), findings };
}

/**
 * Every string inside a JSON-shaped value screened, the shape kept — for a
 * model answer that is accepted as an object (the documentation's business
 * layer). Keys are not screened: they are the schema's, not the model's prose.
 */
export function screenSensitiveValue<T>(value: T): { value: T; findings: SensitiveFinding[] } {
  const findings: SensitiveFinding[] = [];
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const s = screenSensitiveText(v);
      findings.push(...s.findings);
      return s.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return { value: walk(value) as T, findings };
}

/** "one e-mail address and two passwords" — counts by kind, in a fixed order. */
function countsOf(findings: readonly SensitiveFinding[]): string {
  const order: SensitiveKind[] = ['password', 'private-key', 'api-key', 'token', 'email', 'iban', 'phone'];
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const parts = order
    .map((kind) => [kind, findings.filter((f) => f.kind === kind).length] as const)
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => `${words[n] ?? String(n)} ${LABEL[kind][n === 1 ? 0 : 1]}`);
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The note shown beside a text from which something was masked. */
export function sensitiveTextNote(findings: readonly SensitiveFinding[]): string {
  return `Masked before it is shown: ${countsOf(findings)}. A rule-based check keeps secrets and personal data that a model repeats off the screen; the source lines themselves are in the evidence.`;
}

/**
 * Why a fill body may not be spliced, or null — the checks on fills call this
 * beside their own. Only secrets refuse a body: an e-mail address or a phone
 * number may be the original's own constant, carried faithfully, while a
 * password, key or token has no place in generated code whoever wrote it.
 * The reason names the kind, never the value.
 */
export function secretInBody(body: string): string | null {
  const secrets = findSensitive(body).filter((f) => SECRET_KINDS.has(f.kind));
  if (secrets.length === 0) return null;
  return `the body carries ${countsOf(secrets)} as a literal (rule-based check for secrets); generated code reads credentials from a secure store, never from its source`;
}
