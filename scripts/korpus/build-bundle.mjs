#!/usr/bin/env node
/**
 * Reference corpus -> machine-readable bundle (roadmap 2.10).
 *
 * The case book is prose with a fixed set of sections per case. This script
 * reads it and writes `tests/korpus/cases/CC-nnn/` from it, with
 * `source.abap` (per source file of the case), `profile.json` and
 * `expected.json`, plus `tests/korpus/manifest.json`.
 *
 * Three properties everything depends on:
 *
 *   Deterministic — building twice gives byte-identical files. Every object is
 *   written with sorted keys, every file with LF and exactly one trailing
 *   newline. `tests/korpus-engine.spec.ts` rebuilds in memory and compares;
 *   a bundle that no longer matches the case book turns the run red.
 *
 *   Nothing invented — where the case book does not give a value, it is
 *   `null`. The expected answers are not interpreted, only translated. The
 *   only value that is not literally in the case is the target profile of the
 *   v1 cases: the preamble of part A explains it once for all 25, and
 *   `profile.json` then carries `declared_in: "teil-a-vorspann"` instead of
 *   `"fall"`.
 *
 *   Nothing swallowed — a section this script does not know is neither an
 *   abort nor silently skipped: it is counted and named in the report
 *   (`--report`) with case and heading. Version 2.1 brings sections that do
 *   not exist here yet; they should not stop the build, but should not go
 *   unnoticed either.
 *
 * Usage:
 *   node scripts/korpus/build-bundle.mjs
 *   node scripts/korpus/build-bundle.mjs --book docs/korpus/referenzkorpus-v2.1.md
 *   node scripts/korpus/build-bundle.mjs --import <source.md>   (redacts + copies, then builds)
 *   node scripts/korpus/build-bundle.mjs --check                (builds nothing, reports differences)
 *   node scripts/korpus/build-bundle.mjs --report <file.json>
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

const DEFAULT_BOOK = 'docs/korpus/referenzkorpus-v2.1.md';
const DEFAULT_OUT = 'tests/korpus';

// ---------------------------------------------------------------------------
// Small tools
// ---------------------------------------------------------------------------

/** LF, exactly one trailing newline — the form everything is hashed in. */
export function normaliseText(raw) {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * The canonical form of a source block: LF, no trailing whitespace, exactly
 * one trailing newline. The case book's `Quellenhash:` entries check against
 * this form — recomputed on CC-001, CC-026, CC-057 and CC-060.
 */
export function canonicalSource(lines) {
  return `${lines.join('\n').replace(/\s+$/, '')}\n`;
}

/** JSON with sorted keys — otherwise byte identity would depend on the read order. */
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortValue(value[key]);
    return out;
  }
  return value;
}

export function stableJson(value) {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

/** Markdown emphasis removed, backticks removed, whitespace normalised. */
function plain(text) {
  if (text == null) return null;
  const out = text
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[—–-]\s*$/, '')
    .trim();
  return out.length > 0 ? out : null;
}

/**
 * The independence levels are a closed set (case book §2). The line on the
 * case names them with an explanation in brackets; here the identifier counts.
 */
const INDEPENDENCE_LEVELS = [
  'modellreview',
  'abaplint',
  'metamorph',
  'sap-doku',
  'architekt',
  'gegenreview',
  'keine',
];

function parseIndependence(raw) {
  const text = plain(raw);
  if (!text) return [];
  return INDEPENDENCE_LEVELS.filter((level) => new RegExp(`\\b${level}\\b`).test(text));
}

/** The first backtick value after a keyword, e.g. Verwendung `read`. */
function backtickValues(text) {
  return [...text.matchAll(/`([^`]*)`/g)].map((m) => m[1]);
}

/**
 * An anchor of the case book: `source.abap:5`, `source.abap:10+4`,
 * `zcl_route_service.clas.abap:11`, or — in lists — the short form `:13`,
 * which inherits the file of the previous one.
 */
export function parseAnchor(raw, inheritFile = null) {
  if (raw == null) return null;
  const text = raw.replace(/`/g, '').trim();
  // `file.abap:12`, `:12` (file of the previous one), each optionally with a
  // token offset `+4` and — new in v2.1 — an expression path `#cond`, `#arm1`,
  // `#e1`. The expression path is a proposal by the case authors and not yet
  // unified; it is carried, not interpreted.
  const tail = '(?:\\s*\\+\\s*(\\d+))?(?:\\s*#\\s*([A-Za-z0-9_]+))?';
  const withFile = new RegExp(`^([A-Za-z0-9_.\\-]+\\.abap)\\s*:\\s*(\\d+)${tail}`).exec(text);
  if (withFile) {
    return {
      file: withFile[1],
      line: Number(withFile[2]),
      token: withFile[3] == null ? null : Number(withFile[3]),
      expressionPath: withFile[4] ?? null,
      raw: text,
    };
  }
  const bare = new RegExp(`^:\\s*(\\d+)${tail}`).exec(text);
  if (bare && inheritFile) {
    return {
      file: inheritFile,
      line: Number(bare[1]),
      token: bare[2] == null ? null : Number(bare[2]),
      expressionPath: bare[3] ?? null,
      raw: text,
    };
  }
  return { file: null, line: null, token: null, expressionPath: null, raw: text };
}

/** Split on commas, but not inside brackets — ":18 (Sekundäranker, Bedingungszeile)". */
function splitTopLevel(text, separator) {
  const out = [];
  let depth = 0;
  let buffer = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === separator && depth === 0) {
      out.push(buffer);
      buffer = '';
    } else {
      buffer += ch;
    }
  }
  out.push(buffer);
  return out;
}

/** An anchor list such as "source.abap:11, :13, source.abap:14–17". */
export function parseAnchorList(raw) {
  if (raw == null) return [];
  const body = raw.replace(/\.\s*$/, '');
  const out = [];
  let lastFile = null;
  for (const piece of splitTopLevel(body, ',')) {
    const anchor = parseAnchor(piece.trim(), lastFile);
    if (!anchor || anchor.line == null) continue;
    if (anchor.file) lastFile = anchor.file;
    out.push(anchor);
  }
  return out;
}

/** A Markdown table from `startIdx` (the header row). Returns header + rows. */
function readTable(lines, startIdx) {
  const rows = [];
  let i = startIdx;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trimStart().startsWith('|')) break;
    rows.push(
      line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim()),
    );
  }
  if (rows.length < 2) return { header: [], rows: [], next: i };
  const header = rows[0];
  const body = rows.slice(1).filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell) || cell === ''));
  return { header, rows: body, next: i };
}

/** List items ("- …" or "1. …") of a block, without running text in between. */
function bulletList(lines) {
  const out = [];
  for (const line of lines) {
    const m = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
    if (m) out.push(plain(m[1]));
  }
  return out.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Split the case book into cases and sections
// ---------------------------------------------------------------------------

const CASE_HEAD = /^##\s+(CC-\d{3})\s*(?:—|-|–)\s*(.*)$/;

/**
 * Splits a case into a header block and `###` sections. Code fences are
 * skipped so that a `###` in a comment does not open a section.
 */
function splitSections(lines) {
  const sections = [];
  let current = { heading: null, lines: [] };
  let fence = null;
  for (const line of lines) {
    const fenceMatch = /^```(\w*)/.exec(line);
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1] || 'plain';
      else fence = null;
      current.lines.push(line);
      continue;
    }
    if (fence === null) {
      const head = /^###\s+(.*)$/.exec(line);
      if (head) {
        sections.push(current);
        current = { heading: head[1].trim(), lines: [] };
        continue;
      }
    }
    current.lines.push(line);
  }
  sections.push(current);
  return sections;
}

/** All ``` blocks of one language from a section. */
function fencedBlocks(lines, language) {
  const out = [];
  let open = false;
  let buffer = [];
  let openLanguage = null;
  for (const line of lines) {
    const fenceMatch = /^```(\w*)/.exec(line);
    if (fenceMatch) {
      if (!open) {
        open = true;
        openLanguage = fenceMatch[1] || '';
        buffer = [];
      } else {
        if (language == null || openLanguage === language) out.push(buffer);
        open = false;
        openLanguage = null;
      }
      continue;
    }
    if (open) buffer.push(line);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Header block: classes, level, profile, hashes
// ---------------------------------------------------------------------------

const PROFILE_FIELDS = [
  'edition',
  'abap_language_version',
  'release',
  'catalog_revision',
  'rule_revision',
  'runtime_context',
];

/** "edition=onpremise-s4 · abap_language_version=standard · …" */
export function parseProfileValue(raw) {
  const profile = {};
  for (const field of PROFILE_FIELDS) profile[field] = null;
  // A profile may say more than the six required fields — v2.1 introduces
  // `update_mode` and `db_connection`. They are carried, not dropped: a
  // discarded profile field is a silent loss of context.
  profile.extra = {};
  if (!raw) return { profile, unknownFields: [] };
  const unknown = [];
  for (const part of raw.split('·')) {
    const m = /^\s*([a-z_]+)\s*=\s*(.*?)\s*$/.exec(part.replace(/`/g, ''));
    if (!m) continue;
    const key = m[1];
    const value = m[2].replace(/\s+$/, '');
    if (PROFILE_FIELDS.includes(key)) profile[key] = value.length > 0 ? value : null;
    else {
      profile.extra[key] = value.length > 0 ? value : null;
      unknown.push(`${key}=${value}`);
    }
  }
  return { profile, unknownFields: unknown };
}

/** All `**key:** value` pairs of a header block, including several on one line. */
function parseHeaderKeys(lines) {
  const keys = new Map();
  for (const line of lines) {
    const markers = [...line.matchAll(/\*\*([^*]{1,90}?):\*\*/g)];
    for (let i = 0; i < markers.length; i++) {
      const start = markers[i].index + markers[i][0].length;
      const end = i + 1 < markers.length ? markers[i + 1].index : line.length;
      const value = line
        .slice(start, end)
        .replace(/\s*·\s*$/, '')
        .trim();
      // v2.1 writes some keys as code: `**\`known_worst_level\`:**`
      // next to `**known_worst_level:**`. That is the same key.
      const key = markers[i][1].replace(/`/g, '').trim();
      if (!keys.has(key)) keys.set(key, value);
    }
  }
  return keys;
}

/** "Unknown (`known_worst_level`: B)" -> { level: 'Unknown', knownWorst: 'B' } */
function parseClassicLevel(raw) {
  if (!raw) return { level: null, knownWorst: null };
  const text = raw.replace(/\s+$/, '');
  const worst = /known_worst_level`?\s*:?\s*`?([A-D]|Unknown|n\/a)/i.exec(text);
  const level = /^\s*`?([A-D]|Unknown|n\/a)`?\b/.exec(text.replace(/`/g, ''));
  return {
    level: level ? level[1] : plain(text),
    knownWorst: worst ? worst[1] : null,
  };
}

// ---------------------------------------------------------------------------
// The individual sections
// ---------------------------------------------------------------------------

const SOURCE_HEAD = /^Quelltext\s+`([^`]+)`/;

/**
 * Fields that v2.1 introduces in expected answers. They appear as
 * `**field:** value` in the case and are passed through unchanged — they are
 * not interpreted here, because the engine does not know them today anyway.
 * Where a case does not name one of these fields, it is not in `expected.json`.
 */
const V21_ANSWER_FIELDS = [
  'known_worst_level',
  'potential_worst_level',
  'unresolved_targets',
  'target_resolution',
  'component_level',
  'extension_level',
  'scope_members',
  'host_context',
  'assessment_applicable',
  'source_process',
  'runtime_context',
  'expression_path',
  'cloud_api_surface',
  'cloud_artefact',
  'release_contract',
];

function parseSourceSection(section) {
  const m = SOURCE_HEAD.exec(section.heading);
  if (!m) return null;
  const blocks = fencedBlocks(section.lines, 'abap');
  if (blocks.length === 0) return null;
  return { name: assertPlainSourceName(m[1]), lines: blocks[0] };
}

/**
 * The name from the heading becomes a file name under `tests/korpus/cases/…`
 * and is written with `path.join`. A name with path parts (`../../package.json`)
 * would write outside the output folder — hence only a plain file name
 * (carried QA finding 537a326d624e).
 */
export function assertPlainSourceName(name) {
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(name) || name.includes('..')) {
    throw new Error(`Quelltextname ist kein schlichter Dateiname: ${name}`);
  }
  return name;
}

/**
 * Which profiles a findings table applies to — the heading says so:
 * "Sollbefunde", "Sollbefunde — Profil 1", "— beide Profile", "— nur Profil 2".
 */
function findingScopeFromHeading(heading) {
  const tail = heading.replace(/^Sollbefunde\s*(?:—|-|–)?\s*/, '').trim();
  if (tail === '' || tail === heading) return null;
  if (/beide Profile/i.test(tail)) return ['Profil 1', 'Profil 2'];
  const profiles = [...tail.matchAll(/Profil\s+(\d)/g)].map((x) => `Profil ${x[1]}`);
  return profiles.length > 0 ? [...new Set(profiles)] : null;
}

function parseFindingTable(section, caseId) {
  const findings = [];
  const idx = section.lines.findIndex((line) => /^\s*\|\s*ID\s*\|/.test(line));
  if (idx < 0) return findings;
  const { header, rows } = readTable(section.lines, idx);
  const col = (name) => header.findIndex((h) => h.replace(/\*/g, '').trim() === name);
  const iId = col('ID');
  const iRule = col('Regelversion');
  const iAnchor = col('Exakter Anker');
  const iSeverity = col('Schwere');
  const iStatement = col('Sollaussage');
  const iSources = col('Quellen');
  const profiles = findingScopeFromHeading(section.heading);
  for (const row of rows) {
    const id = iId >= 0 ? plain(row[iId]) : null;
    if (!id || !id.startsWith(caseId)) continue;
    const ruleRaw = iRule >= 0 ? row[iRule].trim() : '';
    // R13 is split in two in v2: R13a and R13b carry the letter in the name.
    const ruleMatch = /^\s*`?(R\d+[a-z]?)`?\s*@\s*([^\s(/]+)/.exec(ruleRaw.replace(/\*\*/g, ''));
    findings.push({
      id,
      rule: ruleMatch ? ruleMatch[1] : null,
      ruleVersion: ruleMatch ? ruleMatch[2].replace(/\.$/, '') : null,
      ruleRaw: plain(ruleRaw),
      anchor: iAnchor >= 0 ? parseAnchor(row[iAnchor]) : null,
      severity: iSeverity >= 0 ? plain(row[iSeverity]) : null,
      statement: iStatement >= 0 ? plain(row[iStatement]) : null,
      sources:
        iSources >= 0
          ? row[iSources]
              .split(',')
              .map((s) => plain(s))
              .filter(Boolean)
          : [],
      profiles,
    });
  }
  return findings;
}

function parseObjectSection(section) {
  const objects = [];
  let current = null;
  let jsonBuffer = null;
  const flush = () => {
    if (current) objects.push(current);
    current = null;
  };
  for (let i = 0; i < section.lines.length; i++) {
    const line = section.lines[i];
    if (/^```json/.test(line)) {
      jsonBuffer = [];
      continue;
    }
    if (jsonBuffer !== null) {
      if (/^```/.test(line)) {
        if (current) {
          try {
            current.successors = JSON.parse(jsonBuffer.join('\n'));
          } catch {
            current.successors = null;
          }
        }
        jsonBuffer = null;
      } else {
        jsonBuffer.push(line);
      }
      continue;
    }
    const head = /^\*\*([^*]+)\*\*\s*·\s*Eigentümer/.exec(line);
    if (head) {
      flush();
      const values = backtickValues(line);
      const usageMatch = /Verwendung\s+(.*)$/.exec(line);
      current = {
        name: plain(head[1]),
        owner: values.length > 0 ? values[0] : null,
        usage: usageMatch ? backtickValues(usageMatch[1]).join(', ') || null : null,
        anchor: null,
        identity: null,
        releaseContract: null,
        successors: null,
        successorStatus: null,
        cloudRawState: null,
        classicRawState: null,
      };
      continue;
    }
    if (!current) continue;
    const anchor = /^Anker:\s*([^.]*(?:\.[a-z]+:\d+[^.]*)*)\./.exec(line) || /^Anker:\s*(.*?)(?:\.\s|\.$|$)/.exec(line);
    if (anchor && current.anchor === null) current.anchor = parseAnchor(anchor[1]);
    const identity = /Identität:\s*`(\{.*?\})`/.exec(line);
    if (identity) {
      try {
        current.identity = JSON.parse(identity[1]);
      } catch {
        current.identity = null;
      }
    }
    const cloudRaw = /Cloud-Rohzustand:\s*`([^`]+)`/.exec(line);
    if (cloudRaw) current.cloudRawState = cloudRaw[1];
    const classicRaw = /Classic-Rohzustand:\s*`([^`]+)`/.exec(line);
    if (classicRaw) current.classicRawState = classicRaw[1];
    const status = /Nachfolgerstatus:\s*`([^`]+)`/.exec(line);
    if (status) current.successorStatus = status[1];
    const emptyList = /Nachfolgerliste:\s*`(\[\s*\])`/.exec(line);
    if (emptyList && current.successors === null) current.successors = [];
    const contract = /release_contract`?\s*:\s*\*?\*?([A-Za-z0-9_]+)/.exec(line);
    if (contract) current.releaseContract = contract[1];
  }
  flush();
  return objects;
}

function parseBusinessStatements(section, caseId) {
  const out = [];
  let current = null;
  for (const line of section.lines) {
    const head = new RegExp(`^\\*\\*(${caseId}-B\\d+)\\*\\*\\s*(?:—|-|–)\\s*(.*)$`).exec(line);
    if (head) {
      if (current) out.push(current);
      current = { id: head[1], text: plain(head[2]), anchors: [] };
      continue;
    }
    if (!current) continue;
    const anchors = /^Anker:\s*(.*?)(?:\s*Kontext:.*)?$/.exec(line);
    if (anchors && current.anchors.length === 0) current.anchors = parseAnchorList(anchors[1]);
  }
  if (current) out.push(current);
  return out;
}

function parseSkeleton(section) {
  const nodes = [];
  const idx = section.lines.findIndex((line) => /^\s*\|\s*Knoten\s*\|/.test(line));
  if (idx >= 0) {
    const { header, rows } = readTable(section.lines, idx);
    const col = (name) => header.findIndex((h) => h.trim() === name);
    const iId = col('Knoten');
    const iType = col('Typ');
    const iSource = col('Quelle');
    const iMeaning = col('Bedeutung');
    for (const row of rows) {
      const id = iId >= 0 ? plain(row[iId]) : null;
      if (!id) continue;
      nodes.push({
        id,
        type: iType >= 0 ? plain(row[iType]) : null,
        anchor: iSource >= 0 ? parseAnchor(row[iSource]) : null,
        meaning: iMeaning >= 0 ? plain(row[iMeaning]) : null,
      });
    }
  }
  const edges = [];
  for (const block of fencedBlocks(section.lines, 'mermaid')) {
    for (const line of block) {
      const withLabel = /^\s*([A-Za-z0-9_]+)\s*--+>\s*\|\s*"?(.*?)"?\s*\|\s*([A-Za-z0-9_]+)/.exec(line);
      if (withLabel) {
        edges.push({ from: withLabel[1], to: withLabel[3], condition: plain(withLabel[2]) });
        continue;
      }
      const bare = /^\s*([A-Za-z0-9_]+)\s*--+>\s*([A-Za-z0-9_]+)\s*$/.exec(line);
      if (bare) edges.push({ from: bare[1], to: bare[2], condition: null });
    }
  }
  return { nodes, edges };
}

/**
 * The table "Sollantwort je Profil" — the first column is the field, `Datei`
 * and `Scope` are further key columns, every other column is an answer
 * column. Besides "Profil 1/2", v2.1 brings "Variante 1/2" and a Scope column;
 * that is why the column heading is read and not checked for "Profil".
 */
const QUALIFIER_COLUMNS = ['Datei', 'Scope'];

function parseProfileAnswerTable(section) {
  const idx = section.lines.findIndex((line) => /^\s*\|\s*Feld\s*\|/.test(line));
  if (idx < 0) return [];
  const { header, rows } = readTable(section.lines, idx);
  const iField = 0;
  const iFile = header.findIndex((h) => h.trim() === 'Datei');
  const iScope = header.findIndex((h) => h.trim() === 'Scope');
  const answerColumns = [];
  header.forEach((name, i) => {
    if (i === iField || QUALIFIER_COLUMNS.includes(name.trim())) return;
    const numbered = /^(Profil|Variante)\s+(\d)/.exec(name.trim());
    answerColumns.push({
      index: i,
      label: numbered ? `${numbered[1]} ${numbered[2]}` : plain(name),
      header: plain(name),
    });
  });
  return answerColumns.map((column) => ({
    label: column.label,
    header: column.header,
    fields: rows
      .map((row) => ({
        field: plain(row[iField]),
        file: iFile >= 0 ? plain(row[iFile]) : null,
        scope: iScope >= 0 ? plain(row[iScope]) : null,
        value: plain(row[column.index]),
      }))
      .filter((entry) => entry.field),
  }));
}

function parseForbiddenConclusions(sections) {
  const out = [];
  for (const section of sections) {
    let collecting = false;
    for (const line of section.lines) {
      if (/^\*\*Explizit unzulässige Schlussfolgerungen:\*\*/.test(line)) {
        collecting = true;
        continue;
      }
      if (!collecting) continue;
      if (/^###?\s/.test(line)) break;
      const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
      if (bullet) out.push(plain(bullet[1]));
      else if (line.trim() !== '' && out.length > 0) break;
    }
  }
  return out.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Sections this script knows
// ---------------------------------------------------------------------------

const KNOWN_SECTIONS = [
  { test: (h) => SOURCE_HEAD.test(h), kind: 'quelltext' },
  { test: (h) => /^Sollbefunde\b/.test(h), kind: 'sollbefunde' },
  // "Sollantwort je Profil", "… je Variante", "… je Profil und Scope" — all the
  // same table with one field column and one column per answer.
  { test: (h) => /^Sollantwort je\b/.test(h), kind: 'sollantwort-je-profil' },
  { test: (h) => /^SAP-\/Repository-Objekte/.test(h), kind: 'objekte' },
  { test: (h) => /^Fachliche Ground-Truth-Kandidaten\b/.test(h), kind: 'fachsaetze' },
  { test: (h) => /^Erwartetes Prozessskelett\b/.test(h), kind: 'skelett' },
  { test: (h) => /^(?:Offene\s+)?Prüferfragen\s*$/.test(h), kind: 'pruefferfragen' },
  { test: (h) => /^Konkrete Handarbeit und Schätzgrenze\b/.test(h), kind: 'handarbeit' },
  { test: (h) => /^Zusätzliche fachliche Prüfeingaben\b/.test(h), kind: 'pruefeingaben' },
  // Version 2.1: known, but without a field in the bundle — deliberately skipped, not unknown.
  { test: (h) => /^Korrekturen v2\.1\b/.test(h), kind: 'korrekturen-v2.1' },
  { test: (h) => /^Fundstelle in einem öffentlichen Repository\b/.test(h), kind: 'fundstelle' },
  { test: (h) => /^(?:Offene\s+)?Prüferfragen\s*(?:—|-|–)/.test(h), kind: 'pruefferfragen-beantwortet' },
  { test: (h) => /^Zustandsachsen\b/.test(h), kind: 'zustandsachsen' },
];

const SECTIONS_WITHOUT_FIELD = new Set([
  'handarbeit',
  'pruefeingaben',
  'korrekturen-v2.1',
  'fundstelle',
  'pruefferfragen-beantwortet',
  'zustandsachsen',
]);

function classifySection(heading) {
  for (const entry of KNOWN_SECTIONS) if (entry.test(heading)) return entry.kind;
  return null;
}

// ---------------------------------------------------------------------------
// One case
// ---------------------------------------------------------------------------

/** The v2.1 answer fields, wherever they stand in the case. */
function collectAnswerFields(lines) {
  const found = {};
  const all = parseHeaderKeys(lines.filter((line) => !/^\s*\|/.test(line)));
  for (const field of V21_ANSWER_FIELDS) {
    if (all.has(field)) found[field] = plain(all.get(field));
  }
  return found;
}

function parseCase(caseId, title, lines, defaults, report) {
  const sections = splitSections(lines);
  const header = sections[0];
  const keys = parseHeaderKeys(header.lines);
  const answerFields = collectAnswerFields(lines);

  const sources = [];
  let findings = [];
  let objects = [];
  let businessStatements = [];
  let skeleton = { nodes: [], edges: [] };
  let profileAnswers = [];
  const openReviewerQuestions = [];
  const declaredEmpty = { findings: false, objects: false };

  for (const section of sections.slice(1)) {
    const kind = classifySection(section.heading);
    if (kind === null) {
      report.unknownSections.push({ case: caseId, heading: section.heading });
      continue;
    }
    if (SECTIONS_WITHOUT_FIELD.has(kind)) {
      report.skippedSections.push({ case: caseId, heading: section.heading, kind });
      continue;
    }
    switch (kind) {
      case 'quelltext': {
        const source = parseSourceSection(section);
        if (source) sources.push(source);
        else report.problems.push({ case: caseId, problem: `Quelltextabschnitt ohne abap-Block: ${section.heading}` });
        break;
      }
      case 'sollbefunde': {
        const parsedFindings = parseFindingTable(section, caseId);
        // Five cases are negative controls: the section says in words that there
        // is no finding. Recording that is the difference between "the corpus
        // expects nothing" and "the reader lost the table".
        if (parsedFindings.length === 0 && section.lines.some((l) => /Keine Findings/i.test(l))) {
          declaredEmpty.findings = true;
        }
        findings = findings.concat(parsedFindings);
        break;
      }
      case 'sollantwort-je-profil':
        profileAnswers = profileAnswers.concat(parseProfileAnswerTable(section));
        break;
      case 'objekte': {
        const parsedObjects = parseObjectSection(section);
        if (parsedObjects.length === 0 && section.lines.some((l) => /Keine explizite externe SAP-Repository-Identität/i.test(l))) {
          declaredEmpty.objects = true;
        }
        objects = objects.concat(parsedObjects);
        break;
      }
      case 'fachsaetze':
        businessStatements = businessStatements.concat(parseBusinessStatements(section, caseId));
        break;
      case 'skelett': {
        const parsed = parseSkeleton(section);
        skeleton = { nodes: skeleton.nodes.concat(parsed.nodes), edges: skeleton.edges.concat(parsed.edges) };
        break;
      }
      case 'pruefferfragen':
        openReviewerQuestions.push(...bulletList(section.lines));
        break;
      default:
        break;
    }
  }

  // --- Source hashes ----------------------------------------------------
  // Three spellings occur: `Quellenhash: <h>` (one file),
  // ``Quellenhash `datei`: <h>`` and — new in v2.1 — `Quellenhash (datei): <h>`.
  const sourceHashes = new Map();
  let singleHash = null;
  for (const line of header.lines) {
    const named = /^Quellenhash\s+(?:`([^`]+)`|\(([^)]+)\))\s*:\s*`?([0-9a-f]{64})`?/.exec(line);
    if (named) {
      sourceHashes.set((named[1] ?? named[2]).trim(), named[3]);
      continue;
    }
    const plainHash = /^Quellenhash\s*:\s*`?([0-9a-f]{64})`?/.exec(line);
    if (plainHash) singleHash = plainHash[1];
  }

  // --- Profile(s) -------------------------------------------------------
  const profilePair = keys.has('Zielprofil 1') || keys.has('Zielprofil 2');
  let profileDoc;
  if (profilePair) {
    const entries = [];
    for (const n of [1, 2, 3]) {
      const raw = keys.get(`Zielprofil ${n}`);
      if (!raw) continue;
      const { profile, unknownFields } = parseProfileValue(raw);
      if (unknownFields.length > 0) {
        report.extraProfileFields.push({ case: caseId, fields: unknownFields });
      }
      entries.push({ label: `Profil ${n}`, ...profile, raw: plain(raw) });
    }
    profileDoc = { profiles: entries, declared_in: 'fall', second_profile: plain(keys.get('Zweites Profil') ?? null) };
  } else if (keys.has('Zielprofil')) {
    const { profile, unknownFields } = parseProfileValue(keys.get('Zielprofil'));
    if (unknownFields.length > 0) {
      report.extraProfileFields.push({ case: caseId, fields: unknownFields });
    }
    profileDoc = {
      ...profile,
      raw: plain(keys.get('Zielprofil')),
      declared_in: 'fall',
      second_profile: plain(keys.get('Zweites Profil') ?? null),
    };
  } else if (defaults.profile) {
    profileDoc = {
      ...defaults.profile,
      raw: defaults.profileRaw,
      declared_in: 'teil-a-vorspann',
      second_profile: plain(keys.get('Zweites Profil') ?? null),
    };
  } else {
    const empty = {};
    for (const field of PROFILE_FIELDS) empty[field] = null;
    profileDoc = { ...empty, raw: null, declared_in: null, second_profile: null };
  }

  // --- Level and surface ----------------------------------------------
  const classic = parseClassicLevel(keys.get('Classic') ?? keys.get('Classic (Profil 1)') ?? null);
  const beleggrad = plain(keys.get('Beleggrad') ?? defaults.beleggrad ?? null);
  const independenceRaw = keys.get('Unabhängigkeit') ?? defaults.independence ?? null;

  const expected = {
    id: caseId,
    title: plain(title),
    classes: plain(keys.get('Konstruktklassen') ?? '')
      ? plain(keys.get('Konstruktklassen'))
          .split(/[,·]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    classic_level: profilePair ? null : classic.level,
    known_worst_level: profilePair ? null : (classic.knownWorst ?? answerFields.known_worst_level ?? null),
    cloud_api_surface: profilePair ? null : plain(keys.get('Cloud-API') ?? answerFields.cloud_api_surface ?? null),
    cloud_artefact: profilePair ? null : (answerFields.cloud_artefact ?? null),
    answerFields,
    scope: plain(keys.get('Scope') ?? null),
    status: plain(keys.get('Status') ?? null),
    beleggrad,
    independence: parseIndependence(independenceRaw),
    independenceRaw: plain(independenceRaw),
    convergence: plain(keys.get('Konvergenz') ?? null),
    findings: findings.filter((f) => /-F\d+$/.test(f.id)),
    securityFindings: findings.filter((f) => /-S\d+$/.test(f.id)),
    objects,
    businessStatements,
    skeleton,
    forbiddenConclusions: parseForbiddenConclusions(sections),
    openReviewerQuestions,
    declaredEmpty,
    expectedByProfile: profileAnswers.length > 0 ? profileAnswers : null,
  };

  for (const statement of businessStatements) {
    if (statement.anchors.length === 0) {
      report.problems.push({ case: caseId, problem: `Fachsatz ohne lesbaren Anker: ${statement.id}` });
    }
  }

  // Findings that are neither -Fnn nor -Snn must not disappear silently.
  const classified = new Set([...expected.findings, ...expected.securityFindings].map((f) => f.id));
  for (const finding of findings) {
    if (!classified.has(finding.id)) {
      report.problems.push({ case: caseId, problem: `Befund-ID ohne Klasse: ${finding.id}` });
      expected.findings.push(finding);
    }
  }

  if (expected.expectedByProfile) {
    for (const entry of expected.expectedByProfile) {
      entry.findingIds = findings
        .filter((f) => f.profiles == null || f.profiles.includes(entry.label))
        .map((f) => f.id);
      const artefact = entry.fields.find((f) => f.field === 'cloud_artefact');
      if (artefact) entry.cloud_artefact = artefact.value;
      const level = entry.fields.find((f) => f.field === 'classic_extension.level');
      if (level) entry.classic_level = level.value;
      const worst = entry.fields.find((f) => f.field === 'known_worst_level');
      if (worst) entry.known_worst_level = worst.value;
    }
  }

  return { expected, profileDoc, sources, sourceHashes, singleHash, keys };
}

// ---------------------------------------------------------------------------
// Preamble of part A: the target profile of the 25 v1 cases
// ---------------------------------------------------------------------------

function parsePartADefaults(lines) {
  for (const line of lines) {
    if (!/Jeder v1-Fall trägt in v2 implizit/.test(line)) continue;
    const keys = parseHeaderKeys([line]);
    const raw = keys.get('Zielprofil');
    if (!raw) continue;
    const { profile } = parseProfileValue(raw);
    return {
      profile,
      profileRaw: plain(raw),
      beleggrad: keys.get('Beleggrad') ?? null,
      independence: keys.get('Unabhängigkeit') ?? null,
    };
  }
  return { profile: null, profileRaw: null, beleggrad: null, independence: null };
}

// ---------------------------------------------------------------------------
// Redact occurrences — no third-party code into the repository
// ---------------------------------------------------------------------------

/**
 * In the sections "### Fundstelle in einem öffentlichen Repository", replaces
 * every literal ```abap quote with a hash line. The source stays verifiable via
 * URL, commit and hash; the code itself is not reproduced.
 */
export function redactFundstellen(text) {
  const lines = normaliseText(text).split('\n');
  const out = [];
  let inFundstelle = false;
  let fence = null;
  let buffer = null;
  let replaced = 0;
  for (const line of lines) {
    const heading = /^#{1,3}\s+(.*)$/.exec(line);
    if (heading && fence === null) {
      inFundstelle = /^Fundstelle in einem öffentlichen Repository\b/.test(heading[1].trim());
      out.push(line);
      continue;
    }
    const fenceMatch = /^```(\w*)/.exec(line);
    if (fenceMatch) {
      if (fence === null) {
        fence = fenceMatch[1] || '';
        if (inFundstelle && (fence === 'abap' || fence === '')) {
          buffer = [];
          continue;
        }
      } else {
        if (buffer !== null) {
          const body = canonicalSource(buffer);
          out.push(
            `Ausschnitt: SHA-256 \`${sha256(body)}\` über ${buffer.length} Zeilen ` +
              '(nicht abgedruckt — Quelle ohne Lizenz; nachprüfbar über URL und Commit)',
          );
          buffer = null;
          fence = null;
          replaced += 1;
          continue;
        }
        fence = null;
      }
      out.push(line);
      continue;
    }
    if (buffer !== null) buffer.push(line);
    else out.push(line);
  }
  return { text: out.join('\n'), replaced };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/** Builds the whole bundle in memory: path -> file content. */
export function buildBundle(bookText, bookPath) {
  const report = {
    unknownSections: [],
    skippedSections: [],
    extraProfileFields: [],
    problems: [],
    hashChecked: 0,
    hashMismatch: [],
  };
  const normalised = normaliseText(bookText);
  const lines = normalised.split('\n');

  // A case ends at the next heading of level 1 or 2 — not only at the next
  // case. Between CC-025 and CC-026 stand the quality-assurance appendix and
  // the case authors' preliminary notes; without this barrier they would land
  // in the body of CC-025 and show up as six unknown sections of a case that
  // does not have them.
  const starts = [];
  const breaks = [];
  let fence = null;
  lines.forEach((line, i) => {
    if (/^```/.test(line)) {
      fence = fence === null ? true : null;
      return;
    }
    if (fence !== null) return;
    const m = CASE_HEAD.exec(line);
    if (m) {
      starts.push({ id: m[1], title: m[2].trim(), idx: i });
      breaks.push(i);
    } else if (/^#{1,2}\s/.test(line)) {
      breaks.push(i);
    }
  });
  const endOfCase = (startIdx) => {
    for (const idx of breaks) if (idx > startIdx) return idx;
    return lines.length;
  };

  const defaults = parsePartADefaults(starts.length > 0 ? lines.slice(0, starts[0].idx) : lines);

  const files = new Map();
  const manifestCases = [];

  for (let i = 0; i < starts.length; i++) {
    const from = starts[i].idx + 1;
    const to = endOfCase(starts[i].idx);
    const caseId = starts[i].id;
    const parsed = parseCase(caseId, starts[i].title, lines.slice(from, to), defaults, report);
    const dir = `cases/${caseId}`;

    if (parsed.sources.length === 0) {
      report.problems.push({ case: caseId, problem: 'kein Quelltextblock gefunden' });
    }

    const fileEntries = [];
    for (const source of parsed.sources) {
      const body = canonicalSource(source.lines);
      const digest = sha256(body);
      // A case with several files and only one unnamed `Quellenhash:` means
      // `source.abap` by it where there is one — recomputed on CC-009, whose hash
      // matches neither the concatenation nor either of the two other files —,
      // otherwise the only file without a hash line of its own
      // (CC-065: `caller.abap` next to `Quellenhash (child.abap):`).
      const unnamed = parsed.sources.filter((s) => !parsed.sourceHashes.has(s.name));
      const single =
        parsed.sources.length === 1 ||
        (unnamed.some((s) => s.name === 'source.abap')
          ? source.name === 'source.abap'
          : unnamed.length === 1 && unnamed[0].name === source.name)
          ? parsed.singleHash
          : null;
      const declared = parsed.sourceHashes.get(source.name) ?? single;
      if (declared) {
        report.hashChecked += 1;
        if (declared !== digest) {
          report.hashMismatch.push({ case: caseId, file: source.name, declared, computed: digest });
        }
      }
      files.set(`${dir}/${source.name}`, body);
      fileEntries.push({ name: source.name, sha256: digest, declared: declared ?? null, lines: source.lines.length });
    }

    files.set(`${dir}/profile.json`, stableJson(parsed.profileDoc));
    files.set(`${dir}/expected.json`, stableJson(parsed.expected));

    // Which anchor forms occur. v2.1 proposes an expression path (`:16#cond`)
    // that is not yet unified; it is counted here so that the question stands in
    // the report and does not disappear in a regex.
    countAnchorForms(parsed.expected, report);

    manifestCases.push({
      id: caseId,
      title: parsed.expected.title,
      classes: parsed.expected.classes,
      beleggrad: parsed.expected.beleggrad,
      independence: parsed.expected.independence,
      scope: parsed.expected.scope,
      files: fileEntries,
      quellenhash: parsed.singleHash ?? null,
      profileCount: parsed.profileDoc.profiles ? parsed.profileDoc.profiles.length : 1,
      findingCount: parsed.expected.findings.length,
      securityFindingCount: parsed.expected.securityFindings.length,
      objectCount: parsed.expected.objects.length,
      businessStatementCount: parsed.expected.businessStatements.length,
      skeletonNodeCount: parsed.expected.skeleton.nodes.length,
    });
  }

  const manifest = {
    generatedBy: 'scripts/korpus/build-bundle.mjs',
    book: {
      path: bookPath.replace(/\\/g, '/'),
      sha256: sha256(normalised),
      caseCount: manifestCases.length,
    },
    hashCheck: {
      checked: report.hashChecked,
      mismatch: report.hashMismatch.length,
    },
    unknownSectionCount: report.unknownSections.length,
    skippedSectionCount: report.skippedSections.length,
    cases: manifestCases,
  };
  files.set('manifest.json', stableJson(manifest));

  return { files, manifest, report };
}

function countAnchorForms(expected, report) {
  report.anchorForms = report.anchorForms ?? {};
  const note = (anchor) => {
    if (!anchor || anchor.line == null) return;
    const form =
      (anchor.token == null ? '' : '+offset') + (anchor.expressionPath == null ? '' : '#pfad');
    const key = form === '' ? 'datei:zeile' : `datei:zeile${form}`;
    report.anchorForms[key] = (report.anchorForms[key] || 0) + 1;
  };
  for (const finding of [...expected.findings, ...expected.securityFindings]) note(finding.anchor);
  for (const node of expected.skeleton.nodes) note(node.anchor);
  for (const statement of expected.businessStatements) for (const a of statement.anchors) note(a);
  for (const object of expected.objects) note(object.anchor);
}

function listExisting(root) {
  const out = new Map();
  const walk = (dir, prefix) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel);
      else if (/\.(abap|json)$/.test(entry.name)) out.set(rel, normaliseText(fs.readFileSync(abs, 'utf8')));
    }
  };
  walk(path.join(root, 'cases'), 'cases');
  const manifestPath = path.join(root, 'manifest.json');
  if (fs.existsSync(manifestPath)) out.set('manifest.json', normaliseText(fs.readFileSync(manifestPath, 'utf8')));
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const flag = (name, fallback = null) => {
    const i = argv.indexOf(name);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
  };
  const bookRel = flag('--book', DEFAULT_BOOK);
  const outRel = flag('--out', DEFAULT_OUT);
  const importFrom = flag('--import', null);
  const reportPath = flag('--report', null);
  const checkOnly = argv.includes('--check');

  const bookAbs = path.resolve(REPO, bookRel);
  const outAbs = path.resolve(REPO, outRel);

  if (importFrom) {
    const src = fs.readFileSync(path.resolve(REPO, importFrom), 'utf8');
    const { text, replaced } = redactFundstellen(src);
    fs.mkdirSync(path.dirname(bookAbs), { recursive: true });
    fs.writeFileSync(bookAbs, text.replace(/\s*$/, '\n'), 'utf8');
    console.log(`Fallbuch übernommen: ${bookRel} (${replaced} Fundstellenzitat(e) durch Hashzeile ersetzt)`);
  }

  if (!fs.existsSync(bookAbs)) {
    console.error(`Fallbuch nicht gefunden: ${bookAbs}`);
    process.exit(2);
  }

  const bookText = fs.readFileSync(bookAbs, 'utf8');
  const { files, manifest, report } = buildBundle(bookText, bookRel);

  const existing = listExisting(outAbs);
  const changed = [];
  const removed = [];
  for (const [rel, body] of files) if (existing.get(rel) !== body) changed.push(rel);
  for (const rel of existing.keys()) if (!files.has(rel)) removed.push(rel);

  if (!checkOnly) {
    for (const rel of removed) fs.rmSync(path.join(outAbs, rel), { force: true });
    for (const [rel, body] of files) {
      const abs = path.join(outAbs, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body, 'utf8');
    }
  }

  const summary = {
    book: manifest.book,
    cases: manifest.cases.length,
    filesWritten: files.size,
    changed,
    removed,
    hashChecked: report.hashChecked,
    hashMismatch: report.hashMismatch,
    unknownSections: report.unknownSections,
    skippedSections: report.skippedSections,
    extraProfileFields: report.extraProfileFields,
    anchorForms: report.anchorForms ?? {},
    problems: report.problems,
  };
  if (reportPath) {
    const abs = path.resolve(REPO, reportPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, stableJson(summary), 'utf8');
  }

  console.log(`Fälle:            ${manifest.cases.length}`);
  console.log(`Dateien:          ${files.size}${checkOnly ? ' (nur geprüft)' : ''}`);
  console.log(`Quellenhashes:    ${report.hashChecked} geprüft, ${report.hashMismatch.length} abweichend`);
  console.log(`Fallbuch-SHA-256: ${manifest.book.sha256}`);
  if (report.unknownSections.length > 0) {
    console.log(`Unbekannte Abschnitte (übersprungen, nicht verschluckt): ${report.unknownSections.length}`);
    const grouped = new Map();
    for (const entry of report.unknownSections) {
      grouped.set(entry.heading, (grouped.get(entry.heading) || 0) + 1);
    }
    for (const [heading, count] of [...grouped.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(3)}  ${heading}`);
    }
  }
  if (report.skippedSections.length > 0) {
    console.log(`Bekannte Abschnitte ohne Feld im Bündel: ${report.skippedSections.length}`);
  }
  if (report.extraProfileFields.length > 0) {
    const fields = new Set();
    for (const entry of report.extraProfileFields) for (const f of entry.fields) fields.add(f.split('=')[0]);
    console.log(`Profilfelder über die sechs Pflichtfelder hinaus: ${[...fields].sort().join(', ')}`);
  }
  console.log(
    `Ankerformen: ${Object.entries(report.anchorForms ?? {})
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')}`,
  );
  if (report.problems.length > 0) {
    console.log(`Auffälligkeiten: ${report.problems.length}`);
    for (const p of report.problems.slice(0, 20)) console.log(`  ${p.case}: ${p.problem}`);
  }
  if (checkOnly && (changed.length > 0 || removed.length > 0)) {
    console.error(`Bündel weicht vom Fallbuch ab: ${changed.length} geändert, ${removed.length} überzählig`);
    for (const rel of [...changed, ...removed].slice(0, 20)) console.error(`  ${rel}`);
    process.exit(1);
  }
  if (report.hashMismatch.length > 0) {
    for (const m of report.hashMismatch) {
      console.error(`Quellenhash weicht ab: ${m.case}/${m.file} — Fallbuch ${m.declared}, berechnet ${m.computed}`);
    }
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
