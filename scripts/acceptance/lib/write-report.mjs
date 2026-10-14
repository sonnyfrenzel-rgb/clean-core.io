/**
 * Write the harness's report files into one directory, and only into it.
 *
 * The default directory of `engine-cases.mjs` lies inside the package under
 * test, and a package can carry a link where the report is to go: a directory
 * that is a symbolic link or a junction, or a report file that is a link to a
 * file elsewhere. Writing through either would put the report — or overwrite a
 * file — outside the directory the operator sees. So the directory has to be a
 * real directory (created when missing), and each report file is written anew:
 * an existing symbolic link is refused, and an existing regular file is removed
 * first, so a hard link to a file elsewhere is cut rather than written through.
 */
import fs from 'node:fs';
import path from 'node:path';

function lstatOrNull(p) {
  try {
    return fs.lstatSync(p);
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

/** `files`: `{ [fileName]: content }`, names without a directory part. Returns the absolute paths written. */
export function writeReportFiles(dir, files) {
  const out = path.resolve(dir);
  let st = lstatOrNull(out);
  if (st && st.isSymbolicLink()) throw new Error(`refusing to write the report into ${out}: it is a link, not a directory`);
  if (st && !st.isDirectory()) throw new Error(`refusing to write the report into ${out}: it is not a directory`);
  if (!st) {
    fs.mkdirSync(out, { recursive: true });
    st = lstatOrNull(out);
    if (!st || st.isSymbolicLink() || !st.isDirectory()) throw new Error(`refusing to write the report into ${out}: it is not a directory`);
  }
  const written = [];
  for (const [name, content] of Object.entries(files)) {
    if (path.basename(name) !== name || name === '.' || name === '..') throw new Error(`a report file name must not name a directory: ${name}`);
    const target = path.join(out, name);
    const existing = lstatOrNull(target);
    if (existing) {
      if (existing.isSymbolicLink()) throw new Error(`refusing to write ${target}: it is a link`);
      if (!existing.isFile()) throw new Error(`refusing to write ${target}: it is not a regular file`);
      fs.unlinkSync(target);
    }
    // `wx`: a file that appeared after the removal is not written through either.
    fs.writeFileSync(target, content, { flag: 'wx' });
    written.push(target);
  }
  return written;
}
