import { engineVersionAtLeast } from '../score-rule';

/**
 * Requirements the program's owner states in the source (roadmap 3.0.17,
 * owner decision 17.10.2026).
 *
 * The route used to be read from constructs only. A program whose code has no
 * side-by-side construct, but whose header states binding operating
 * requirements — one externally accessible service over several independent
 * ERP systems, no ERP owning the workflow state, no new ERP-side table
 * authorized, SAP BTP / CAP as the approved target — was recommended RAP. For
 * that owner the recommendation was wrong, and the source said so.
 *
 * This reader finds those statements, generically, in comment lines (`*` in
 * column one, or a line that starts with `"`):
 *
 *   - a labelled requirement item — `NFR-07:`, `REQ-3`, `[ADR-2]`,
 *     `Requirement:`, `Constraint:`, `Approved target:` …;
 *   - every item of a requirements block — a comment heading such as
 *     `REQUIREMENTS`, `NON-FUNCTIONAL REQUIREMENTS`, `OPERATING
 *     REQUIREMENTS`, `ARCHITECTURE`, `CONSTRAINTS`, `ARCHITECTURE DECISIONS`.
 *
 * Nothing else is a statement: a comment outside such an item — "unlike CAP,
 * this report …", "see the BTP docs" — names a platform; it states no
 * requirement. Commented-out code is not a statement either.
 *
 * Each item is classified by what it says about the target:
 *
 *   - `side-by-side` — it names SAP BTP, CAP, Kyma, side-by-side as the
 *     target, an independent externally accessible service over several
 *     systems, state that no ERP may own, or forbids new ERP-side objects;
 *   - `on-stack` — it names RAP, ABAP Cloud, on-stack, in-app or developer
 *     extensibility as the target, or requires the logic to stay in the ERP;
 *   - `neutral` — it says nothing about the target.
 *
 * A mention in passing inside an item does not count ("unlike CAP", "cf.
 * BTP", "see the RAP documentation", "via the released RAP APIs"), and a
 * negated one counts for the other side ("must not run on SAP BTP", "rather
 * than CAP"). An item is `binding` when the clause that names the target binds
 * it — must, shall, required, mandated, approved, authorized, governance, a
 * prohibition ("no … may") — and no hedge (could, consider, optional, future,
 * preferred, TBD) softens it. A soft item is reported but never sets a route.
 *
 * Pure: no imports beyond the version comparison, no I/O.
 */

/** The first engine version whose evidence carries the stated requirements and whose route reads them. */
export const STATED_REQUIREMENTS_FROM = '3.0.17';

/** True when a run of this engine version reads stated requirements. A missing or unreadable version does not. */
export function statedRequirementsApply(engineVersion: string | null | undefined): boolean {
  return engineVersionAtLeast(engineVersion, STATED_REQUIREMENTS_FROM);
}

export type StatedTarget = 'side-by-side' | 'on-stack' | 'neutral';

export interface StatedRequirement {
  /** The item's own label — `NFR-07`, `Requirement` — or null for an unlabelled item of a block. */
  label: string | null;
  /** The heading of the block the item stands under, or null. */
  heading: string | null;
  lineStart: number;
  lineEnd: number;
  /** The item's words, label removed, whitespace collapsed. */
  text: string;
  target: StatedTarget;
  /** The clause naming the target binds it. Always false for a neutral item. */
  binding: boolean;
  /** The phrases that decided the target, as they stand in the text. */
  signals: string[];
}

interface CommentLine {
  line: number;
  /** The comment's words, comment marker removed, trimmed. */
  text: string;
  /** Leading blanks after the comment marker. */
  indent: number;
}

/** The words of one full-line comment, or null for a line of code (or an empty one). */
function commentOf(raw: string, line: number): CommentLine | null {
  const s = raw.replace(/^﻿/, '').replace(/\r$/, '');
  let body: string;
  if (s.startsWith('*')) body = s.replace(/^\*+&?/, '');
  else if (/^\s*"/.test(s)) body = s.replace(/^\s*"+/, '');
  else return null;
  const trimmed = body.trim();
  return { line, text: trimmed, indent: body.length - body.trimStart().length };
}

/** Decoration only: `----`, `====`, `*&---`, `####`. */
const isSeparator = (t: string) => t.length >= 3 && /^[-=_*#~+.&|\s]+$/.test(t);

const ABAP_KEYWORDS = new Set(
  (
    'CALL SELECT DATA TYPES CONSTANTS IF ELSEIF ELSE ENDIF LOOP ENDLOOP DO ENDDO WHILE ENDWHILE CASE WHEN ENDCASE MOVE ' +
    'WRITE PERFORM FORM ENDFORM CLEAR REFRESH FREE APPEND READ MODIFY INSERT UPDATE DELETE COMMIT ROLLBACK SUBMIT EXIT ' +
    'CHECK RETURN RAISE MESSAGE METHOD ENDMETHOD METHODS CLASS ENDCLASS FUNCTION ENDFUNCTION TRY CATCH ENDTRY ' +
    'CONCATENATE SPLIT SORT COLLECT ASSIGN FIELD-SYMBOLS PARAMETERS SELECT-OPTIONS TABLES REPORT INCLUDE ' +
    'AUTHORITY-CHECK EXEC ENDEXEC SET GET OPEN CLOSE TRANSFER REPLACE TRANSLATE CONDENSE ADD SUBTRACT MULTIPLY DIVIDE ' +
    'CREATE START-OF-SELECTION END-OF-SELECTION INITIALIZATION ENDSELECT LEAVE CONTINUE'
  ).split(' '),
);

/**
 * Commented-out code, not words: an assignment (`lv_x = 1.`), a statement
 * opened by an ABAP keyword in upper case that ends like one or carries a code
 * token, or the same keyword in lower case followed by code tokens.
 */
function looksLikeCode(t: string): boolean {
  if (/^(?=[\w~\-<>/]*[_~>-])[\w~\-<>/]+\s*[+\-*/?]?=\s*\S.*[.,]$/.test(t)) return true;
  const first = /^([A-Za-z][\w-]*)/.exec(t)?.[1] ?? '';
  if (!ABAP_KEYWORDS.has(first.toUpperCase())) return false;
  const codeToken = /'[^']*'|->|=>|@|\(\s*\)|\bTYPE\b|\bINTO\b|\bFROM\b\s+\w+\s|\bEXPORTING\b|\bIMPORTING\b|\bUSING\b/;
  if (first === first.toUpperCase()) return /[.,:]$/.test(t) || codeToken.test(t);
  return first === first.toLowerCase() && codeToken.test(t) && /[.,]$/.test(t);
}

/** A labelled requirement item: `NFR-07:`, `REQ 3`, `[ADR-2]`, `Requirement:`, `Approved target:`. */
const CODE_LABEL =
  /^[[(]?((?:NFR|FR|REQ|Req|REQT|RQ|BR|AR|ADR|CONSTR|OPS|ARC|ARCH|GOV|IR)s?[-_ .]?\d+(?:\.\d+)*[a-z]?)[\])]?(?:\s*[:.)\-–—]\s*|\s+)(?=\S)/;
const WORD_LABEL =
  /^((?:non[- ]?functional\s+)?requirement(?:\s+\d+(?:\.\d+)*)?|operating\s+requirement|constraint(?:\s+\d+)?|architecture\s+(?:decision|requirement|constraint)(?:\s+\d+)?|target\s+architecture|approved\s+target(?:\s+architecture)?|governance(?:\s+decision)?|mandated\s+target)\s*:\s*(?=\S)/i;

/** A requirements block heading, the whole comment: `NON-FUNCTIONAL REQUIREMENTS`, `ARCHITECTURE:`, `3. Constraints`. */
function headingOf(t: string): string | null {
  const s = t.replace(/^[-=#*>\s]+|[-=#*:\s]+$/g, '').replace(/^\d+(?:\.\d+)*\.?\s+/, '').trim();
  if (!s || s.split(/\s+/).length > 5) return null;
  const qualifier =
    '(?:non[- ]?functional|functional|operating|operational|operations|business|technical|architectur(?:e|al)|integration|deployment|platform|governance|customer|binding|key|quality|system)';
  if (new RegExp(`^(?:${qualifier}\\s+)*(?:requirements?|constraints?|decisions?|NFRs?)$`, 'i').test(s)) return s;
  if (/^(?:target\s+)?architecture(?:\s+(?:decisions?|constraints?|notes?|guidelines?))?$/i.test(s)) return s;
  if (/^(?:non[- ]?functional|governance|target\s+platform)$/i.test(s)) return s;
  return null;
}

/** A heading that is not one of ours, or a header field — it ends a block. */
const isOtherHeading = (t: string) =>
  /^[A-Z][A-Z0-9 &/()-]{2,40}:?$/.test(t) ||
  /^(?:author|date|created|changed|modified|version|transport|program|report|title|purpose|description|history|change\s+log)\b[^:]{0,20}:/i.test(t);

const BULLET = /^(?:[-•·+o]|\d+[.)]|[a-z][.)])\s+/;

/** Sentence or clause boundaries: `;`, or a full stop followed by a blank — `Node.js` and `e.g.` stay whole. */
function clausesOf(text: string): Array<{ start: number; text: string }> {
  const out: Array<{ start: number; text: string }> = [];
  const re = /;|\.(?=\s+[A-Z(])|\.$/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    // An abbreviation is no boundary.
    if (m[0] === '.' && /\b(?:e\.g|i\.e|cf|vs|approx|incl|resp)$/i.test(text.slice(start, m.index))) continue;
    out.push({ start, text: text.slice(start, m.index) });
    start = m.index + 1;
  }
  if (start < text.length) out.push({ start, text: text.slice(start) });
  return out.filter((c) => c.text.trim());
}

const BINDING =
  /\b(?:must|shall|has\s+to|have\s+to|required|requires?|mandatory|mandated|binding|approved|authori[sz]ed|decided|agreed|signed[- ]off|governance|architecture\s+board|design\s+authority|non[- ]negotiable|is\s+the\s+target|target\s+(?:is|architecture|platform|runtime))\b|^\s*target\s*:|\bno\s+[^;]{0,60}?\b(?:may|can|shall)\b|\b(?:may|can)\s*not\b|\bcannot\b/i;
const HEDGE =
  /\b(?:could|might|may\s+(?:later|eventually|also|be\s+considered)|possibly|perhaps|consider(?:ed)?|evaluate|optional(?:ly)?|alternatively|future|later|eventually|nice\s+to\s+have|prefer(?:ably|red)?|ideally|if\s+possible|tbd|to\s+be\s+(?:decided|clarified|confirmed)|proposal|proposed|draft)\b/i;

/** Platform names: a mention in passing does not count, a negated one counts for the other side. */
const SIDE_NAMES: RegExp[] = [
  /\bSAP\s+BTP\b|\bBTP\b|\bBusiness\s+Technology\s+Platform\b/gi,
  /\bCAP\b(?:\s+(?:Node(?:\.js)?|Java))?|\bCloud\s+Application\s+Programming(?:\s+model)?\b/g,
  /\bside[- ]by[- ]side\b/gi,
  /\bKyma\b|\bCloud\s+Foundry\b/gi,
];
const STACK_NAMES: RegExp[] = [
  /\bRAP\b|\bABAP\s+RESTful(?:\s+Application\s+Programming(?:\s+model)?)?\b/g,
  /\bABAP\s+Cloud\b/gi,
  /\bon[- ]stack\b/gi,
  /\bin-app(?:\s+extensibility)?\b/gi,
  /\b(?:developer|key[- ]user)\s+extensibility\b/gi,
];

/** Requirements that say the target without naming a platform — no passing-mention or negation reading. */
const SIDE_PHRASES: RegExp[] = [
  /\bexternal(?:ly)?[- ](?:accessible|exposed|reachable|hosted|facing)\s+(?:[\w-]+\s+){0,3}?(?:service|API|endpoint|application|app)s?\b/gi,
  /\b(?:spanning|across|over|serving|for|between|from)\s+(?:several|multiple|many|all|two\s+or\s+more|\d+)\s+(?:independent\s+|separate\s+|different\s+|distinct\s+)*(?:ERP|S\/4\s?HANA|SAP|backend|back-end)?\s*(?:systems|ERPs|instances|backends|back-ends|landscapes|tenants)\b/gi,
  /\bindependent(?:ly)?\s+(?:of|from)\s+(?:any|the|a|each|every|one)?\s*(?:single\s+)?(?:ERP|S\/4\s?HANA|SAP\s+system|backend|core)\b/gi,
  /\bno\s+(?:single\s+|one\s+|individual\s+)?(?:ERP|S\/4\s?HANA|backend|SAP\s+system|core\s+system)\s+(?:[\w-]+\s+){0,3}?(?:may|shall|must|can|should|is\s+allowed\s+to)\s+(?:[\w-]+\s+){0,2}?own\b/gi,
  /\b(?:state|data|persistence)\b(?:\s+[\w-]+){0,6}?\s+(?:outside|independent\s+of|external\s+to)\s+(?:the\s+|any\s+|each\s+|every\s+)?(?:ERP|S\/4\s?HANA|core|SAP\s+system|backend)s?\b/gi,
  /\bno\s+new\s+(?:[\w-]+\s+){0,2}?(?:ERP|S\/4\s?HANA|ABAP|backend|core|SAP)[- ]side\b/gi,
  /\b(?:ERP|S\/4\s?HANA|backend|core)[- ]side\s+(?:[\w-]+\s+){0,4}?(?:is|are)\s+not\s+(?:authori[sz]ed|allowed|permitted|approved)\b/gi,
  /\bno\s+new\s+[^;]{0,40}?\b(?:custom\s+tables?|Z[- ]?tables?|ABAP\s+(?:objects?|code|development)|runtime)\b[^;]{0,40}?\b(?:authori[sz]ed|allowed|permitted|approved)\b/gi,
];
const STACK_PHRASES: RegExp[] = [
  /\b(?:must|shall|has\s+to|is\s+to)\s+(?:run|stay|remain|be\s+(?:built|implemented|kept|developed))\s+(?:in|on|inside|within)\s+(?:the\s+)?(?:ERP|S\/4\s?HANA|core|SAP\s+system|ABAP\s+stack|backend)\b/gi,
  /\bno\s+(?:separate|additional|external)\s+(?:runtime|platform|middleware)\b/gi,
];

const PASSING_BEFORE =
  /\b(?:unlike|like|similar\s+to|compared\s+(?:to|with)|in\s+contrast\s+to|cf\.?|see|as\s+in|e\.g\.?|for\s+example|such\s+as|versus|vs\.?|based\s+on\s+the)\s+(?:the\s+|a\s+|an\s+|SAP\s+|our\s+)*$/i;
const PASSING_AFTER = /^\s*(?:-?\s*)?(?:docs?|documentation|guide|guidelines|help|blog|tutorial|samples?|examples?|community|training|course|wiki|page|notes?)\b/i;
/** On-stack names that only name what is consumed: "via the released RAP APIs". */
const CONSUMED_AFTER = /^\s*(?:APIs?|business\s+objects?|BOs?|interfaces?|services?|OData)\b/i;
const CONSUMED_BEFORE = /\b(?:released|via|through|using|consum\w*|call\w*|reads?|from|of\s+the)\s+(?:the\s+|its\s+|their\s+)?(?:released\s+)?$/i;
const NEGATION = /\b(?:no|not|never|without|instead\s+of|rather\s+than|excluding|except|must\s+not|may\s+not|shall\s+not|cannot|can't|isn't|aren't)\b/gi;
const CONTRAST = /\b(?:but|however|instead|rather|only|so|therefore|thus|which|because)\b/i;
const NEGATED_AFTER =
  /^\s*(?:[\w.-]+\s+){0,2}?(?:is|are)\s+(?:not|no\s+longer)\s+(?:licensed|approved|available|authori[sz]ed|allowed|permitted|an\s+option|in\s+scope|used|wanted)\b/i;

type Side = 'side-by-side' | 'on-stack';
const other = (s: Side): Side => (s === 'side-by-side' ? 'on-stack' : 'side-by-side');

interface Mention {
  side: Side;
  binding: boolean;
  phrase: string;
}

function mentionsOf(text: string): Mention[] {
  const out: Mention[] = [];
  for (const clause of clausesOf(text)) {
    const c = clause.text;
    const binding = BINDING.test(c) && !HEDGE.test(c);
    const named = (patterns: RegExp[], side: Side) => {
      for (const re of patterns) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(c))) {
          const before = c.slice(0, m.index);
          const after = c.slice(m.index + m[0].length);
          if (PASSING_BEFORE.test(before) || PASSING_AFTER.test(after)) continue;
          if (side === 'on-stack' && CONSUMED_AFTER.test(after) && (CONSUMED_BEFORE.test(before) || /\breleased\b/i.test(before.slice(-30)))) continue;
          // The negation's scope: back to the last comma or contrast word.
          const scope = before.split(/,/).pop() ?? '';
          let negated = false;
          let last = -1;
          NEGATION.lastIndex = 0;
          let n: RegExpExecArray | null;
          while ((n = NEGATION.exec(scope))) last = n.index + n[0].length;
          if (last >= 0 && !CONTRAST.test(scope.slice(last))) negated = true;
          if (NEGATED_AFTER.test(after)) negated = true;
          out.push({ side: negated ? other(side) : side, binding, phrase: m[0] });
        }
      }
    };
    const phrased = (patterns: RegExp[], side: Side) => {
      for (const re of patterns) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(c))) out.push({ side, binding, phrase: m[0] });
      }
    };
    named(SIDE_NAMES, 'side-by-side');
    named(STACK_NAMES, 'on-stack');
    phrased(SIDE_PHRASES, 'side-by-side');
    phrased(STACK_PHRASES, 'on-stack');
  }
  return out;
}

/** The target an item's words state, and whether they bind it. */
export function classifyStatement(text: string): { target: StatedTarget; binding: boolean; signals: string[] } {
  const mentions = mentionsOf(text);
  const weight = (s: Side) => mentions.filter((m) => m.side === s).reduce((n, m) => n + (m.binding ? 2 : 1), 0);
  const side = weight('side-by-side');
  const stack = weight('on-stack');
  if (side === stack) return { target: 'neutral', binding: false, signals: [] };
  const target: Side = side > stack ? 'side-by-side' : 'on-stack';
  const own = mentions.filter((m) => m.side === target);
  return {
    target,
    binding: own.some((m) => m.binding),
    signals: [...new Set(own.map((m) => m.phrase.replace(/\s+/g, ' ')))],
  };
}

interface Draft {
  label: string | null;
  heading: string | null;
  lines: CommentLine[];
  parts: string[];
}

/** Every owner-stated requirement item in the source, in source order. */
export function readStatedRequirements(code: string): StatedRequirement[] {
  const rawLines = code.split('\n');
  const drafts: Draft[] = [];
  let block: { heading: string; items: number } | null = null;
  let current: Draft | null = null;
  // An item outside a block takes continuation lines only while they read as its sentence.
  let labelIndent = 0;

  const close = () => {
    if (current && current.parts.join(' ').trim()) drafts.push(current);
    current = null;
  };
  const open = (label: string | null, first: string, line: CommentLine) => {
    close();
    current = { label, heading: block?.heading ?? null, lines: [line], parts: [first] };
    labelIndent = line.indent;
    if (block) block.items++;
  };

  for (let i = 0; i < rawLines.length; i++) {
    const c = commentOf(rawLines[i], i + 1);
    if (!c) {
      // Code (or an empty line) ends whatever was open.
      close();
      block = null;
      continue;
    }
    const t = c.text;
    if (!t) {
      close();
      continue;
    }
    if (isSeparator(t)) {
      close();
      if (block && block.items > 0) block = null;
      continue;
    }
    const heading = headingOf(t);
    if (heading) {
      close();
      block = { heading, items: 0 };
      continue;
    }
    if (looksLikeCode(t)) {
      close();
      continue;
    }
    const code = CODE_LABEL.exec(t);
    const word = code ? null : WORD_LABEL.exec(t);
    if (code || word) {
      const m = (code ?? word)!;
      open(m[1].replace(/\s+/g, ' '), t.slice(m[0].length), c);
      continue;
    }
    if (block) {
      if (isOtherHeading(t)) {
        close();
        block = null;
        continue;
      }
      const bullet = BULLET.exec(t);
      if (bullet) {
        open(null, t.slice(bullet[0].length), c);
        continue;
      }
      if (current) {
        (current as Draft).lines.push(c);
        (current as Draft).parts.push(t);
      } else {
        open(null, t, c);
      }
      continue;
    }
    // Outside a block: a continuation of a labelled item, or nothing.
    if (current) {
      const cur = current as Draft;
      const prev = cur.parts[cur.parts.length - 1] ?? '';
      if (c.indent > labelIndent || !/[.!?:;]$/.test(prev.trim())) {
        cur.lines.push(c);
        cur.parts.push(t);
        continue;
      }
      close();
    }
  }
  close();

  return drafts.map((d) => {
    const text = d.parts.join(' ').replace(/\s+/g, ' ').trim();
    const cls = classifyStatement(text);
    return {
      label: d.label,
      heading: d.heading,
      lineStart: d.lines[0].line,
      lineEnd: d.lines[d.lines.length - 1].line,
      text,
      target: cls.target,
      binding: cls.target !== 'neutral' && cls.binding,
      signals: cls.signals,
    };
  });
}

/**
 * What the stated requirements of a program say about its target, together.
 *
 * Only binding items set a target, and only when no binding item names the
 * other side: two binding statements that disagree set none (`contradictory`).
 * Soft items never set one; they are returned so the route can name them.
 */
export interface StatedTargetVerdict {
  target: Side | null;
  /** The binding items that name `target` (empty when there is none). */
  binding: StatedRequirement[];
  /** Items that name a target without binding it. */
  soft: StatedRequirement[];
  /** Binding items on both sides. */
  contradictory: boolean;
  /** With `contradictory`: the binding items of each side. */
  sides: { 'side-by-side': StatedRequirement[]; 'on-stack': StatedRequirement[] };
}

export function statedTargetOf(items: readonly StatedRequirement[] | null | undefined): StatedTargetVerdict {
  const list = items ?? [];
  const bindingOf = (s: Side) => list.filter((r) => r.binding && r.target === s);
  const sides = { 'side-by-side': bindingOf('side-by-side'), 'on-stack': bindingOf('on-stack') };
  const soft = list.filter((r) => !r.binding && r.target !== 'neutral');
  const both = sides['side-by-side'].length > 0 && sides['on-stack'].length > 0;
  const target: Side | null = both
    ? null
    : sides['side-by-side'].length > 0
      ? 'side-by-side'
      : sides['on-stack'].length > 0
        ? 'on-stack'
        : null;
  return { target, binding: target ? sides[target] : [], soft, contradictory: both, sides };
}

/** "NFR-07 (line 5)", "an item under OPERATING REQUIREMENTS (lines 7–8)", with its words quoted. */
export function citeStatement(r: StatedRequirement, quote = true): string {
  const where = r.lineStart === r.lineEnd ? `line ${r.lineStart}` : `lines ${r.lineStart}–${r.lineEnd}`;
  const name = r.label ?? (r.heading ? `an item under “${r.heading}”` : 'a stated requirement');
  if (!quote) return `${name} (${where})`;
  const words = r.text.length > 160 ? `${r.text.slice(0, 157).replace(/\s+\S*$/, '')}…` : r.text;
  return `${name} (${where}): “${words}”`;
}
