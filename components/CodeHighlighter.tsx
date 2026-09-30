'use client';

import { useMemo } from 'react';
import CcCodeSurface, { type CcCodeLine, type CcCodeToken } from '@/components/cc/CodeSurface';
import { tokenizeAbapLine } from '@/lib/process-map';

/**
 * A listing on the code surface of `DESIGN.md` §1.1 — block D, step D.15.
 *
 * This used to be Prism with the VS Code dark theme: its own background, its
 * own dozen syntax colours, a font size passed in per call. The product has one
 * dark surface for code and five syntax colours (`CcCodeSurface`), so this
 * component now only splits the text into those five kinds. It is
 * presentational: nothing here reads the code for meaning.
 *
 * ABAP uses the tokenizer of the process map (`lib/process-map.ts`), so ABAP is
 * coloured the same way wherever it appears. Everything else — TypeScript, CDS,
 * JSON, a Dockerfile, Markdown — goes through the small C-family reader below:
 * comments, quoted text, numbers and a keyword list, and the name after a
 * declaring keyword. A language it does not know is shown as plain text, which
 * is a listing without colour, not a wrong one.
 */

const TS_KEYWORDS = new Set([
  'abstract', 'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default',
  'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'if',
  'implements', 'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null', 'of', 'private',
  'protected', 'public', 'readonly', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try',
  'type', 'typeof', 'undefined', 'var', 'void', 'while', 'yield',
  // CDS and the RAP artefacts share the C-family shape and add these.
  'entity', 'service', 'namespace', 'using', 'key', 'define', 'view', 'select', 'association', 'composition',
  'many', 'to', 'on', 'where', 'projection', 'root', 'managed', 'unmanaged', 'implementation', 'behavior',
  'expose', 'annotate', 'with',
]);

/** Keywords after which the next word names something. */
const TS_NAMES_FOLLOW = new Set(['function', 'class', 'interface', 'type', 'enum', 'entity', 'service', 'view', 'namespace']);

const DOCKER_KEYWORDS = new Set([
  'FROM', 'AS', 'RUN', 'CMD', 'LABEL', 'EXPOSE', 'ENV', 'ADD', 'COPY', 'ENTRYPOINT', 'VOLUME', 'USER',
  'WORKDIR', 'ARG', 'ONBUILD', 'STOPSIGNAL', 'HEALTHCHECK', 'SHELL',
]);

/**
 * One line of a C-family language. `inBlock` says whether the line starts
 * inside a `/* … *\/` comment; the returned `inBlock` whether the next one does.
 */
function tokenizeCLine(line: string, inBlockAtStart: boolean, json: boolean): { tokens: CcCodeToken[]; inBlock: boolean } {
  const tokens: CcCodeToken[] = [];
  let inBlock = inBlockAtStart;
  let rest = line;
  let namesNext = false;

  while (rest.length > 0) {
    if (inBlock) {
      const end = rest.indexOf('*/');
      if (end === -1) {
        tokens.push({ kind: 'comment', text: rest });
        rest = '';
      } else {
        tokens.push({ kind: 'comment', text: rest.slice(0, end + 2) });
        rest = rest.slice(end + 2);
        inBlock = false;
      }
      continue;
    }
    if (!json && rest.startsWith('//')) {
      tokens.push({ kind: 'comment', text: rest });
      break;
    }
    if (!json && rest.startsWith('/*')) {
      const end = rest.indexOf('*/', 2);
      if (end === -1) {
        tokens.push({ kind: 'comment', text: rest });
        rest = '';
        inBlock = true;
      } else {
        tokens.push({ kind: 'comment', text: rest.slice(0, end + 2) });
        rest = rest.slice(end + 2);
      }
      continue;
    }
    const quoted = /^(['"`])(?:\\.|(?!\1)[^\\])*\1?/.exec(rest);
    if (quoted) {
      const text = quoted[0];
      rest = rest.slice(text.length);
      // A JSON key names a field; its value is the literal.
      const isKey = json && /^\s*:/.test(rest);
      tokens.push({ kind: isKey ? 'name' : 'literal', text });
      namesNext = false;
      continue;
    }
    const number = /^\d+(?:\.\d+)?/.exec(rest);
    if (number) {
      tokens.push({ kind: 'literal', text: number[0] });
      rest = rest.slice(number[0].length);
      namesNext = false;
      continue;
    }
    const word = /^[A-Za-z_$@][\w$]*/.exec(rest);
    if (word) {
      const text = word[0];
      rest = rest.slice(text.length);
      if (json) {
        tokens.push({ kind: /^(true|false|null)$/.test(text) ? 'literal' : 'plain', text });
      } else if (TS_KEYWORDS.has(text)) {
        tokens.push({ kind: 'keyword', text });
        namesNext = TS_NAMES_FOLLOW.has(text);
      } else {
        tokens.push({ kind: namesNext ? 'name' : 'plain', text });
        namesNext = false;
      }
      continue;
    }
    const other = /^(?:\s+|[^\w$@'"`/\s]+|\/)/.exec(rest);
    const text = other ? other[0] : rest[0];
    tokens.push({ kind: 'plain', text });
    rest = rest.slice(text.length);
  }
  return { tokens, inBlock };
}

function tokenizeDockerLine(line: string): CcCodeToken[] {
  if (/^\s*#/.test(line)) return [{ kind: 'comment', text: line }];
  const instruction = /^(\s*)([A-Za-z]+)(.*)$/.exec(line);
  if (!instruction || !DOCKER_KEYWORDS.has(instruction[2].toUpperCase())) return [{ kind: 'plain', text: line }];
  const tokens: CcCodeToken[] = [];
  if (instruction[1]) tokens.push({ kind: 'plain', text: instruction[1] });
  tokens.push({ kind: 'keyword', text: instruction[2] });
  for (const part of instruction[3].split(/("(?:\\.|[^"\\])*"|'[^']*')/)) {
    if (!part) continue;
    tokens.push({ kind: /^["']/.test(part) ? 'literal' : 'plain', text: part });
  }
  return tokens;
}

function tokenizeMarkdownLine(line: string): CcCodeToken[] {
  if (/^\s*#/.test(line)) return [{ kind: 'keyword', text: line }];
  if (/^\s*(```|~~~)/.test(line)) return [{ kind: 'comment', text: line }];
  return [{ kind: 'plain', text: line }];
}

export function codeLines(language: string, code: string): CcCodeLine[] {
  const source = code.replace(/\r\n?/g, '\n').split('\n');
  const lines: CcCodeLine[] = [];
  let inBlock = false;
  source.forEach((text, index) => {
    let tokens: CcCodeToken[];
    if (language === 'abap') {
      tokens = tokenizeAbapLine(text);
    } else if (language === 'dockerfile') {
      tokens = tokenizeDockerLine(text);
    } else if (language === 'markdown') {
      tokens = tokenizeMarkdownLine(text);
    } else if (language === 'typescript' || language === 'json') {
      const result = tokenizeCLine(text, inBlock, language === 'json');
      tokens = result.tokens;
      inBlock = result.inBlock;
    } else {
      tokens = [{ kind: 'plain', text }];
    }
    lines.push({ number: index + 1, tokens: tokens.length ? tokens : [{ kind: 'plain', text: '' }] });
  });
  return lines;
}

export default function CodeHighlighter({
  language,
  code,
  label,
}: {
  language: string;
  code: string;
  /** What the listing is — "Legacy source (ABAP)", "srv/service.ts". */
  label: string;
}) {
  const lines = useMemo(() => codeLines(language, code), [language, code]);
  return <CcCodeSurface lines={lines} label={label} />;
}
