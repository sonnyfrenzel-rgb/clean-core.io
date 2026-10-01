import JSZip from 'jszip';
import {
  OWN_CODE_ZIP_LIMITS,
  isSourceName,
  readSourceBytes,
  type OwnCodeIssue,
  type OwnCodeSource,
} from './own-code-import';

/**
 * One ZIP of ABAP sources, read in the browser — mockup 2.8 s11.
 *
 * An archive somebody hands the page can expand a few kilobytes into
 * gigabytes, so the size it declares is not trusted: every entry is expanded
 * chunk by chunk and abandoned the moment it passes its own ceiling or the
 * archive's (the same pattern as `lib/audit-pack-verify.ts`). Entries that are
 * not `.abap`/`.txt` are not read at all and are named on the row, so nothing
 * in the archive is passed over in silence.
 */

class ZipLimit extends Error {}

function readEntryBounded(file: JSZip.JSZipObject, budget: { remaining: number }): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    let settled = false;
    const stream = (file as JSZip.JSZipObject & {
      internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array>;
    }).internalStream('uint8array');
    stream
      .on('data', (chunk) => {
        if (settled) return;
        size += chunk.length;
        if (size > OWN_CODE_ZIP_LIMITS.entryBytes || size > budget.remaining) {
          settled = true;
          stream.pause();
          reject(new ZipLimit(file.name));
          return;
        }
        chunks.push(chunk);
      })
      .on('error', (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      })
      .on('end', () => {
        if (settled) return;
        settled = true;
        budget.remaining -= size;
        const out = new Uint8Array(size);
        let at = 0;
        for (const c of chunks) {
          out.set(c, at);
          at += c.length;
        }
        resolve(out);
      })
      .resume();
  });
}

/** Archive housekeeping that is nobody's source: macOS forks, dot files. */
function isHousekeeping(path: string): boolean {
  return path.startsWith('__MACOSX/') || path.split('/').some((part) => part.startsWith('.'));
}

export async function readZipSources(
  bytes: ArrayBuffer | Uint8Array,
): Promise<{ sources: OwnCodeSource[]; issues: OwnCodeIssue[] }> {
  const size = bytes.byteLength;
  if (size > OWN_CODE_ZIP_LIMITS.archiveBytes) {
    return { sources: [], issues: [{ kind: 'too-large', bytes: size, limit: OWN_CODE_ZIP_LIMITS.archiveBytes }] };
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    return { sources: [], issues: [{ kind: 'zip-unreadable' }] };
  }
  const entries = Object.values(zip.files).filter((f) => !f.dir && !isHousekeeping(f.name));
  if (entries.length > OWN_CODE_ZIP_LIMITS.entries) {
    return { sources: [], issues: [{ kind: 'zip-limit' }] };
  }

  const budget = { remaining: OWN_CODE_ZIP_LIMITS.totalBytes };
  const sources: OwnCodeSource[] = [];
  const issues: OwnCodeIssue[] = [];
  const skipped: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (!isSourceName(entry.name)) {
      skipped.push(entry.name);
      continue;
    }
    let entryBytes: Uint8Array;
    try {
      entryBytes = await readEntryBounded(entry, budget);
    } catch (err) {
      return { sources: [], issues: [err instanceof ZipLimit ? { kind: 'zip-limit' } : { kind: 'zip-unreadable' }] };
    }
    const read = readSourceBytes(entry.name, entryBytes);
    if (read.source) sources.push(read.source);
    else skipped.push(entry.name);
    // A refused entry inside an archive is named with the others that were not
    // read; an encoding note is kept for the row.
    for (const issue of read.issues) {
      if (issue.kind === 'encoding' && !issues.some((i) => i.kind === 'encoding')) issues.push(issue);
      if (issue.kind === 'blocked') issues.push(issue);
    }
  }
  if (skipped.length > 0) issues.push({ kind: 'zip-skipped', names: skipped });
  if (sources.length === 0 && !issues.some((i) => i.kind === 'blocked')) issues.unshift({ kind: 'zip-empty' });
  return { sources, issues };
}
