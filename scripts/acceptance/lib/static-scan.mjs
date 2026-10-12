/**
 * The part of the harness that only reads. It never imports, requires or
 * evaluates anything from the package, so it is safe on any package, including
 * the ones the sandbox refuses to execute.
 *
 * These are acceptance-time signals, labelled with the same pattern IDs as the
 * catalogue, and deliberately few: the product's generation-time lints
 * (`lib/generated-code-lints.ts`) are the place for the full rule set. A static
 * hit is reported as "suspect" evidence next to a pattern; it never turns a
 * probe's verdict, because a regex sees text, not behaviour.
 */
import fs from 'node:fs';
import path from 'node:path';

const SOURCE_EXT = new Set(['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs', '.abap']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
const MAX_FILE = 2_000_000;

function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, base, out);
    } else if (SOURCE_EXT.has(path.extname(entry.name).toLowerCase())) {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function excerpt(text, index) {
  const start = text.lastIndexOf('\n', index) + 1;
  const end = text.indexOf('\n', index);
  const line = text.slice(start, end === -1 ? undefined : end).trim();
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}

function hits(text, regex) {
  const out = [];
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(m.index);
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

const HTTP_CLIENT = /\bfetch\s*\(|\bhttps?\.request\s*\(|\baxios\b|executeHttpRequest|\.send\s*\(\s*\{|cds\.connect/;

/** The checks: `{ id, pattern, files?, test(text, file) -> indexes }`. */
const CHECKS = [
  {
    id: 'listen-without-entry-guard',
    pattern: 'FP-TEST-03',
    note: 'listen() in a module that has no direct-start guard (import.meta.main / import.meta.url / require.main)',
    test: (text) => (/import\.meta\.main|import\.meta\.url\s*===|require\.main\s*===\s*module|process\.argv\[1\]/.test(text) ? [] : hits(text, /\.listen\s*\(/)),
  },
  {
    id: 'clock-run-id',
    pattern: 'FP-RUN-02',
    note: 'an id built from the millisecond clock',
    test: (text) => hits(text, /\$\{\s*Date\.now\(\)\s*\}|['"`][A-Z][A-Z0-9_-]*['"`]\s*\+\s*Date\.now\(\)/),
  },
  {
    id: 'global-latest-result',
    pattern: 'FP-RUN-01',
    note: 'a single latest/last result held by the module',
    test: (text) => hits(text, /\b(latestResult|lastResult|latestRun|lastRun)\b\s*[:=]/),
  },
  {
    id: 'float-rounding',
    pattern: 'FP-PREC-02',
    note: 'Math.round on a binary float scaled by 100',
    test: (text) => hits(text, /Math\.round\([^;\n]*\)\s*\/\s*100\b|\.toFixed\(\s*2\s*\)\s*\)/),
  },
  {
    id: 'lenient-number-parse',
    pattern: 'FP-GUARD-03',
    note: 'parseInt/parseFloat accept trailing garbage',
    test: (text) => hits(text, /\bparse(Int|Float)\s*\(/),
  },
  {
    id: 'naive-csv-quoting',
    pattern: 'FP-GUARD-07',
    note: 'a value wrapped in quotes without doubling embedded quotes, in a file that writes CSV',
    test: (text) => (!/csv/i.test(text) || /replace(All)?\(\s*(\/"\/g|'"'|"\\"")/.test(text) ? [] : hits(text, /"\$\{[^}]+\}"|'"'\s*\+\s*[\w.]+\s*\+\s*'"'/)),
  },
  {
    id: 'claimed-api-call',
    pattern: 'FP-CLAIM-01',
    note: 'a success message naming an SAP API in a file that makes no outbound call',
    test: (text) => (HTTP_CLIENT.test(text) ? [] : hits(text, /['"`][^'"`\n]*\b(success|updated|posted|sent)[^'"`\n]*\b(API_[A-Z0-9_]+|OData|S\/4\s?HANA)[^'"`\n]*['"`]/i)),
  },
  {
    id: 'sap-event-namespace',
    pattern: 'FP-CLAIM-02',
    note: "an event published in SAP's own namespace",
    test: (text) => hits(text, /sap\.s4\.beh\./i),
  },
];

function importedPackages(text) {
  const names = new Set();
  const re = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"./][^'"]*)['"]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const spec = m[1];
    if (spec.startsWith('node:')) continue;
    names.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
  }
  return names;
}

/** Scan a package directory. Returns `[{ check, pattern, file, line, excerpt, note }]`. */
export function staticScan(pkgDir) {
  const findings = [];
  const files = walk(pkgDir);
  const imported = new Set();
  for (const rel of files) {
    const full = path.join(pkgDir, rel);
    if (fs.statSync(full).size > MAX_FILE) continue;
    const text = fs.readFileSync(full, 'utf8');
    if (!rel.endsWith('.abap')) for (const name of importedPackages(text)) imported.add(name);
    for (const check of CHECKS) {
      if (rel.endsWith('.abap') && check.id !== 'sap-event-namespace') continue;
      for (const index of check.test(text, rel)) {
        findings.push({ check: check.id, pattern: check.pattern, file: rel, line: lineOf(text, index), excerpt: excerpt(text, index), note: check.note });
      }
    }
  }
  const pkgJson = path.join(pkgDir, 'package.json');
  if (fs.existsSync(pkgJson)) {
    let pkg = null;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
    } catch {
      findings.push({ check: 'package-json-unreadable', pattern: 'FP-META-04', file: 'package.json', line: 1, excerpt: '', note: 'package.json is not valid JSON' });
    }
    if (pkg && pkg.dependencies && typeof pkg.dependencies === 'object') {
      for (const dep of Object.keys(pkg.dependencies)) {
        if (!imported.has(dep)) {
          findings.push({ check: 'unused-dependency', pattern: 'FP-META-04', file: 'package.json', line: 1, excerpt: dep, note: 'a declared dependency no source file imports' });
        }
      }
    }
  }
  return { files: files.length, findings };
}
