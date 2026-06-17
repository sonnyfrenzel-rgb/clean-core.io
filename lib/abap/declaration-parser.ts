import type {
  ClassNode, MethodDecl, AttributeDecl, EventDecl, AliasDecl,
  ParamDef, TypeRef, Visibility, SourceRef,
} from './class-model';

/**
 * ABAP declaration parser — parses ONLY the declaration parts of class/interface
 * definitions (CLASS ... DEFINITION ... ENDCLASS, INTERFACE ... ENDINTERFACE).
 * Method bodies (CLASS ... IMPLEMENTATION) are intentionally ignored — they are
 * handed to the LLM together with the resolved IR as grounding context.
 *
 * Scope (core subset): INHERITING FROM, INTERFACES, ABSTRACT/FINAL, CREATE x,
 * visibility sections, METHODS/CLASS-METHODS/REDEFINITION, DATA/CLASS-DATA/
 * CONSTANTS, EVENTS, ALIASES, FRIENDS, statement chaining (KEYWORD: a, b.).
 * Long tail (TYPES, nested types, macros) is out of scope for hierarchy resolution.
 */

const norm = (s: string) => s.trim().toUpperCase();

interface Statement { text: string; line: number; }

/** Strip comments, then split into statements (terminated by '.') with start line. */
export function tokenize(source: string): Statement[] {
  const lines = source.split(/\r?\n/);
  const statements: Statement[] = [];
  let buf = '';
  let startLine = 0;
  let inSingleQuote = false;
  let inBacktick = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Full-line comment
    if (/^\s*\*/.test(line)) continue;
    // Strip inline comment ("...) when not inside a string literal or backtick literal
    let clean = '';
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === "'" && !inBacktick) inSingleQuote = !inSingleQuote;
      if (ch === "`" && !inSingleQuote) inBacktick = !inBacktick;
      if (ch === '"' && !inSingleQuote && !inBacktick) break; // rest is comment
      clean += ch;
    }
    inSingleQuote = false; // comments don't span lines
    inBacktick = false;

    if (!buf) startLine = i + 1;
    buf += (buf ? ' ' : '') + clean.trim();

    // Split out completed statements on '.' (respect string literals and backticks)
    let str = false;
    let bt = false;
    let out = '';
    for (let c = 0; c < buf.length; c++) {
      const ch = buf[c];
      if (ch === "'" && !bt) str = !str;
      if (ch === "`" && !str) bt = !bt;
      if (ch === '.' && !str && !bt) {
        const text = out.trim();
        if (text) statements.push({ text, line: startLine });
        out = '';
        startLine = i + 1;
      } else {
        out += ch;
      }
    }
    buf = out.trim();
  }
  return statements;
}

/** Split on top-level commas (ignore commas inside '...' literals, `...` backticks, or (...) parens). */
function splitTopLevelCommas(s: string): string[] {
  const parts: string[] = [];
  let depth = 0, str = false, bt = false, cur = '';
  for (const ch of s) {
    if (ch === "'" && !bt) str = !str;
    if (ch === "`" && !str) bt = !bt;
    if (!str && !bt && ch === '(') depth++;
    if (!str && !bt && ch === ')') depth--;
    if (ch === ',' && depth === 0 && !str && !bt) { parts.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function parseTypeRef(seg: string): TypeRef {
  // "TYPE REF TO zcl_foo" | "TYPE string" | "LIKE x" | "TYPE REF TO data"
  const refTo = seg.match(/TYPE\s+REF\s+TO\s+([\w\/]+)/i);
  if (refTo) return { raw: seg.trim(), kind: 'ref', refToType: norm(refTo[1]) };
  return { raw: seg.trim(), kind: 'value' };
}

/** Best-effort param parsing for a METHODS declaration tail. */
function parseParams(tail: string): { params: ParamDef[]; raises: string[] } {
  const params: ParamDef[] = [];
  const raises: string[] = [];
  const sectionRe = /\b(IMPORTING|EXPORTING|CHANGING|RETURNING|RAISING)\b/gi;
  const tokens: { kw: string; body: string }[] = [];
  let m: RegExpExecArray | null;
  const marks: { kw: string; idx: number }[] = [];
  while ((m = sectionRe.exec(tail))) marks.push({ kw: m[1].toUpperCase(), idx: m.index });
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].idx + marks[i].kw.length;
    const end = i + 1 < marks.length ? marks[i + 1].idx : tail.length;
    tokens.push({ kw: marks[i].kw, body: tail.slice(start, end).trim() });
  }
  for (const t of tokens) {
    if (t.kw === 'RAISING') {
      for (const r of t.body.split(/\s+/).filter(Boolean)) raises.push(norm(r));
      continue;
    }
    const dir = t.kw.toLowerCase() as ParamDef['direction'];
    // params separated by whitespace groups; each "name TYPE ..."
    // VALUE(x)/REFERENCE(x) wrappers handled
    const paramChunks = t.body.split(/\s+(?=\w+\s*(?:\(|TYPE|LIKE))/i).filter(Boolean);
    for (const chunk of paramChunks) {
      const nameM = chunk.match(/^(?:VALUE|REFERENCE)?\(?\s*([\w\/]+)\s*\)?/);
      if (!nameM) continue;
      const name = nameM[1];
      const optional = /\bOPTIONAL\b/i.test(chunk);
      const def = chunk.match(/\bDEFAULT\s+('[^']*'|`[^`]*`|\S+)/i);
      params.push({
        name, direction: dir, optional,
        defaultValue: def?.[1],
        type: parseTypeRef(chunk),
      });
    }
  }
  return { params, raises };
}

/** Parse all class/interface DEFINITIONS in one source file. */
export function parseDeclarations(source: string, file: string): ClassNode[] {
  const statements = tokenize(source);
  const nodes: ClassNode[] = [];
  let cur: ClassNode | null = null;
  let inDefinition = false;
  let section: Visibility = 'public';

  const ref = (line: number): SourceRef => ({ file, line });

  for (const st of statements) {
    const up = norm(st.text);

    // Skip IMPLEMENTATION blocks entirely
    if (/^CLASS\s+[\w\/]+\s+IMPLEMENTATION/i.test(st.text)) { inDefinition = false; continue; }
    if (up === 'ENDCLASS' || up === 'ENDINTERFACE') { if (cur) { nodes.push(cur); cur = null; } inDefinition = false; continue; }

    // CLASS x DEFINITION ...
    const classDef = st.text.match(/^CLASS\s+([\w\/]+)\s+DEFINITION\b(.*)$/i);
    if (classDef) {
      const opts = classDef[2];
      cur = {
        key: norm(classDef[1]), kind: 'class', source: ref(st.line), isStandard: false,
        isAbstract: /\bABSTRACT\b/i.test(opts), isFinal: /\bFINAL\b/i.test(opts),
        createVisibility: (opts.match(/CREATE\s+(PUBLIC|PROTECTED|PRIVATE)/i)?.[1]?.toLowerCase() as Visibility) || undefined,
        superClass: opts.match(/INHERITING\s+FROM\s+([\w\/]+)/i)?.[1] ? norm(opts.match(/INHERITING\s+FROM\s+([\w\/]+)/i)![1]) : undefined,
        interfaces: [], friends: [], methods: [], attributes: [], events: [], aliases: [],
      };
      const fr = opts.match(/(?:GLOBAL\s+)?FRIENDS\s+([\w\/\s]+)/i);
      if (fr) cur.friends = fr[1].split(/\s+/).filter(Boolean).map(norm);
      inDefinition = true; section = 'public';
      continue;
    }

    // INTERFACE x.
    const ifDef = st.text.match(/^INTERFACE\s+([\w\/]+)\b/i);
    if (ifDef && !/^INTERFACES\b/i.test(st.text)) {
      cur = {
        key: norm(ifDef[1]), kind: 'interface', source: ref(st.line), isStandard: false,
        isAbstract: false, isFinal: false, interfaces: [], friends: [],
        methods: [], attributes: [], events: [], aliases: [],
      };
      inDefinition = true; section = 'public';
      continue;
    }

    if (!inDefinition || !cur) continue;

    // Sections
    if (/^PUBLIC\s+SECTION$/i.test(st.text)) { section = 'public'; continue; }
    if (/^PROTECTED\s+SECTION$/i.test(st.text)) { section = 'protected'; continue; }
    if (/^PRIVATE\s+SECTION$/i.test(st.text)) { section = 'private'; continue; }

    // Determine leading keyword (handle hyphenated CLASS-METHODS / CLASS-DATA)
    const kwMatch = st.text.match(/^([A-Z]+(?:-[A-Z]+)?)\s*:?/i);
    const kw = kwMatch ? norm(kwMatch[1]) : '';
    const chained = /^[A-Z-]+\s*:/i.test(st.text);
    const body = st.text.replace(/^[A-Z-]+\s*:?/i, '').trim();
    const entries = chained ? splitTopLevelCommas(body) : [body];

    switch (kw) {
      case 'INTERFACES':
        for (const e of entries) { const n = e.match(/^([\w\/]+)/); if (n) cur.interfaces.push(norm(n[1])); }
        break;

      case 'ALIASES':
        for (const e of entries) {
          const a = e.match(/^([\w\/]+)\s+FOR\s+([\w\/~]+)/i);
          if (a) cur.aliases.push({ alias: norm(a[1]), target: norm(a[2]), source: ref(st.line) });
        }
        break;

      case 'DATA':
      case 'CLASS-DATA':
      case 'CONSTANTS':
        for (const e of entries) {
          const n = e.match(/^([\w\/]+)/); if (!n) continue;
          cur.attributes.push({
            name: norm(n[1]), visibility: section,
            isStatic: kw === 'CLASS-DATA',
            isReadOnly: /\bREAD-ONLY\b/i.test(e),
            isConstant: kw === 'CONSTANTS',
            type: parseTypeRef(e), source: ref(st.line),
          });
        }
        break;

      case 'METHODS':
      case 'CLASS-METHODS':
        for (const e of entries) {
          const n = e.match(/^([\w\/]+)/); if (!n) continue;
          const name = norm(n[1]);
          const isCtor = name === 'CONSTRUCTOR';
          const isClassCtor = name === 'CLASS_CONSTRUCTOR' || (kw === 'CLASS-METHODS' && name === 'CONSTRUCTOR');
          const { params, raises } = parseParams(e);
          cur.methods.push({
            name, visibility: section,
            isStatic: kw === 'CLASS-METHODS',
            isAbstract: /\bABSTRACT\b/i.test(e),
            isFinal: /\bFINAL\b/i.test(e),
            isRedefinition: /\bREDEFINITION\b/i.test(e),
            isConstructor: isCtor, isClassConstructor: isClassCtor,
            params, raises, source: ref(st.line),
          });
        }
        break;

      case 'EVENTS':
      case 'CLASS-EVENTS':
        for (const e of entries) {
          const n = e.match(/^([\w\/]+)/); if (!n) continue;
          const { params } = parseParams(e.replace(/\bEXPORTING\b/i, 'EXPORTING'));
          cur.events.push({
            name: norm(n[1]), visibility: section,
            isStatic: kw === 'CLASS-EVENTS', params, source: ref(st.line),
          });
        }
        break;

      default:
        // TYPES, includes, macros, etc. — not relevant to hierarchy resolution
        break;
    }
  }

  if (cur) nodes.push(cur);
  return nodes;
}
