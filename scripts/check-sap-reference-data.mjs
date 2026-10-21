#!/usr/bin/env node
/**
 * The content check of the weekly SAP reference sync (SEC-2026-892): run by the push job of
 * .github/workflows/sync-sap-references.yml on the data folders the sync job handed over, before
 * anything is copied into the checkout. Plain Node, no imports beyond node:fs, node:path, node:url and node:crypto,
 * so the job that holds the write token still installs nothing.
 *
 *   node scripts/check-sap-reference-data.mjs <dir> [--upstream]
 *
 * `--upstream` (the push job uses it) also fetches every copied schema and the LICENSE from SAP's repository at the
 * synced commit and compares the bytes (`upstreamProblems`): the artifact's own hashes are no anchor.
 *
 * `<dir>` holds lib/generated/sap-references/ and lib/generated/aff-schemas/. Each
 * sap-references/<key>.json must be the metadata the sync writes (`SapReferenceData` in
 * scripts/sync-sap-references.ts) for one of the four sources, field by field, with nothing else;
 * every copied AFF schema must be a JSON schema whose bytes hash to what that metadata records for
 * its upstream path; LICENSE must be the MIT text. Exit 0 when everything holds, 1 with the reasons.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The sources, as scripts/sync-sap-references.ts declares them (tests/sap-reference-data-check.spec.ts compares). */
export const SOURCES = {
  'abap-cheat-sheets': { repo: 'SAP-samples/abap-cheat-sheets', branch: 'main', licenceUrl: 'https://www.apache.org/licenses/LICENSE-2.0' },
  'abap-platform-refscen-flight': { repo: 'SAP-samples/abap-platform-refscen-flight', branch: 'ABAP-platform-cloud', licenceUrl: 'https://www.apache.org/licenses/LICENSE-2.0' },
  styleguides: { repo: 'SAP/styleguides', branch: 'main', licenceUrl: 'https://creativecommons.org/licenses/by/3.0/' },
  'abap-file-formats': { repo: 'SAP/abap-file-formats', branch: 'main', licenceUrl: 'https://opensource.org/licenses/MIT' },
};

const MAX_BYTES = 4 * 1024 * 1024;
const HEX64 = /^[0-9a-f]{64}$/;
const SPDX = /^[A-Za-z0-9.+-]{1,64}$/;
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v, max = 500) => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
/** A relative POSIX path inside its repository: no `..`, no leading slash, no backslash. */
const repoPath = (v) => text(v, 400) && !v.startsWith('/') && !v.includes('\\') && !v.split('/').some((p) => p === '' || p === '.' || p === '..');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function sameKeys(o, required, optional = []) {
  const keys = Object.keys(o);
  return required.every((k) => keys.includes(k)) && keys.every((k) => required.includes(k) || optional.includes(k));
}

/** The reasons one sap-references file is not what the sync writes; empty when it is. */
export function referenceProblems(key, raw) {
  const out = [];
  const src = SOURCES[key];
  if (!src) return [`${key}.json: not one of the synced sources`];
  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    return [`${key}.json: not JSON`];
  }
  if (!isObject(d)) return [`${key}.json: not an object`];
  const copies = key === 'abap-file-formats';
  if (!sameKeys(d, ['key', 'source', 'branch', 'commit', 'syncedAt', 'licence', 'files', 'sections'], copies ? ['copied'] : [])) out.push(`${key}.json: other fields than the sync writes`);
  if (d.key !== key) out.push(`${key}.json: key is not ${key}`);
  if (d.source !== `https://github.com/${src.repo}`) out.push(`${key}.json: source is not ${src.repo}`);
  if (d.branch !== src.branch) out.push(`${key}.json: branch is not ${src.branch}`);
  if (typeof d.commit !== 'string' || !/^[0-9a-f]{40}$/.test(d.commit)) out.push(`${key}.json: commit is no commit id`);
  if (typeof d.syncedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.syncedAt)) out.push(`${key}.json: syncedAt is no date`);
  const l = d.licence;
  if (
    !isObject(l) ||
    !sameKeys(l, ['spdx', 'github', 'reuse', 'file', 'url']) ||
    !SPDX.test(String(l.spdx)) ||
    !SPDX.test(String(l.github)) ||
    !Array.isArray(l.reuse) ||
    !l.reuse.every((r) => SPDX.test(String(r))) ||
    !(l.file === '' || repoPath(l.file)) ||
    l.url !== src.licenceUrl
  ) {
    out.push(`${key}.json: licence is not what the sync records`);
  }
  const files = Array.isArray(d.files) ? d.files : null;
  if (!files || files.length > 20000) out.push(`${key}.json: files is no list`);
  else if (!files.every((f) => isObject(f) && sameKeys(f, ['path', 'sha256', 'size']) && repoPath(f.path) && HEX64.test(String(f.sha256)) && Number.isInteger(f.size) && f.size >= 0)) {
    out.push(`${key}.json: a file entry is not path, sha256 and size`);
  }
  const sections = Array.isArray(d.sections) ? d.sections : null;
  if (!sections || sections.length > 50000) out.push(`${key}.json: sections is no list`);
  else if (
    !sections.every(
      (s) => isObject(s) && sameKeys(s, ['file', 'heading', 'level', 'anchor', 'hash']) && repoPath(s.file) && text(s.heading) && Number.isInteger(s.level) && s.level >= 1 && s.level <= 6 && typeof s.anchor === 'string' && s.anchor.length <= 500 && /^[\p{L}\p{N}_-]*$/u.test(s.anchor) && HEX64.test(String(s.hash)),
    )
  ) {
    out.push(`${key}.json: a section entry is not file, heading, level, anchor and hash`);
  }
  if (copies && 'copied' in d) {
    if (!Array.isArray(d.copied) || !d.copied.every((c) => isObject(c) && sameKeys(c, ['path', 'to']) && /^file-formats\/[a-z0-9]+\/[a-z0-9]+-v\d+\.json$/.test(String(c.path)) && c.to === `lib/generated/aff-schemas/${path.posix.basename(String(c.path))}`)) {
      out.push(`${key}.json: a copied entry is not an AFF schema path and its place`);
    }
  }
  return out;
}

/** Every reason the data folders under `dir` are not what the sync writes; empty when they are. */
export function dataProblems(dir) {
  const out = [];
  const refs = path.join(dir, 'lib', 'generated', 'sap-references');
  const aff = path.join(dir, 'lib', 'generated', 'aff-schemas');
  if (!existsSync(refs) || !existsSync(aff)) return ['the data folders are missing'];
  const read = (file) => {
    const size = statSync(file).size;
    if (size > MAX_BYTES) {
      out.push(`${path.basename(file)}: larger than ${MAX_BYTES} bytes`);
      return null;
    }
    return readFileSync(file);
  };
  const data = {};
  for (const name of readdirSync(refs).sort()) {
    const key = name.replace(/\.json$/, '');
    const buf = read(path.join(refs, name));
    if (!buf) continue;
    const problems = referenceProblems(key, buf.toString('utf8'));
    out.push(...problems);
    if (problems.length === 0) data[key] = JSON.parse(buf.toString('utf8'));
  }
  for (const key of Object.keys(SOURCES)) if (!existsSync(path.join(refs, `${key}.json`))) out.push(`${key}.json: missing`);

  // The schemas: each one the metadata lists as copied, byte for byte what it recorded upstream.
  const formats = data['abap-file-formats'];
  const recorded = new Map((formats?.files ?? []).map((f) => [f.path, f.sha256]));
  const copied = new Map((formats?.copied ?? []).map((c) => [path.posix.basename(c.path), c.path]));
  const schemas = readdirSync(aff).filter((n) => n !== 'LICENSE').sort();
  for (const name of schemas) {
    const buf = read(path.join(aff, name));
    if (!buf) continue;
    const upstream = copied.get(name);
    if (!upstream) {
      out.push(`aff-schemas/${name}: not listed as copied in abap-file-formats.json`);
      continue;
    }
    if (sha256(buf) !== recorded.get(upstream)) out.push(`aff-schemas/${name}: its bytes are not what abap-file-formats.json records for ${upstream}`);
    let schema;
    try {
      schema = JSON.parse(buf.toString('utf8'));
    } catch {
      out.push(`aff-schemas/${name}: not JSON`);
      continue;
    }
    if (!isObject(schema) || typeof schema.$schema !== 'string' || !/^https:\/\/json-schema\.org\//.test(schema.$schema)) out.push(`aff-schemas/${name}: not a JSON schema`);
  }
  for (const name of copied.keys()) if (!schemas.includes(name)) out.push(`aff-schemas/${name}: listed as copied but missing`);
  const licence = path.join(aff, 'LICENSE');
  const lic = existsSync(licence) ? read(licence) : null;
  if (!lic) out.push('aff-schemas/LICENSE: missing');
  else {
    const t = lic.toString('utf8');
    if (!/^MIT License\b/.test(t) || !t.includes('Permission is hereby granted, free of charge, to any person obtaining a copy') || !t.includes('THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND')) {
      out.push('aff-schemas/LICENSE: not the MIT licence text');
    }
  }
  return out;
}

/**
 * The copied files against SAP's own repository (QA review of a20d2cb7bd39, cf02a5de56a3): the hashes in
 * abap-file-formats.json come from the same artifact as the schemas, so they bind nothing on their own. Every copied
 * schema and the LICENSE are fetched from SAP/abap-file-formats at the commit the metadata names — a commit only SAP
 * can create — and must match byte for byte. `fetchBytes(url)` returns the bytes or null; injected by the tests.
 */
export async function upstreamProblems(dir, fetchBytes = defaultFetch) {
  const out = [];
  const aff = path.join(dir, 'lib', 'generated', 'aff-schemas');
  let formats;
  try {
    formats = JSON.parse(readFileSync(path.join(dir, 'lib', 'generated', 'sap-references', 'abap-file-formats.json'), 'utf8'));
  } catch {
    return ['abap-file-formats.json: not readable'];
  }
  if (referenceProblems('abap-file-formats', JSON.stringify(formats)).length > 0) return ['abap-file-formats.json: not what the sync writes'];
  const base = `https://raw.githubusercontent.com/${SOURCES['abap-file-formats'].repo}/${formats.commit}/`;
  const pairs = (formats.copied ?? []).map((c) => [c.path, path.join(aff, path.posix.basename(c.path))]);
  if (formats.licence.file) pairs.push([formats.licence.file, path.join(aff, 'LICENSE')]);
  for (const [upstream, local] of pairs) {
    if (!existsSync(local)) {
      out.push(`${path.basename(local)}: missing`);
      continue;
    }
    const theirs = await fetchBytes(base + upstream);
    if (!theirs) out.push(`${upstream}: not found at ${formats.commit} in ${SOURCES['abap-file-formats'].repo}`);
    else if (sha256(theirs) !== sha256(readFileSync(local))) out.push(`aff-schemas/${path.basename(local)}: not the bytes of ${upstream} at ${formats.commit}`);
  }
  return out;
}

async function defaultFetch(url) {
  const res = await fetch(url, { redirect: 'error' });
  return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
}

const invoked = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node scripts/check-sap-reference-data.mjs <dir> [--upstream]');
    process.exit(2);
  }
  const problems = dataProblems(path.resolve(dir));
  if (problems.length === 0 && process.argv.includes('--upstream')) problems.push(...(await upstreamProblems(path.resolve(dir))));
  if (problems.length > 0) {
    for (const p of problems.slice(0, 50)) console.error(`::error::${p}`);
    process.exit(1);
  }
  console.log('The SAP reference data holds what the sync writes.');
}
