/**
 * The paths a generated package names more than once.
 *
 * The model's file list was filtered for usable entries but never for repeats:
 * two files at `srv/service.ts` with different contents were both stored, the
 * file tree keyed its buttons by path, and choosing that path showed whichever
 * came first — the conflict was stored and hidden (QA full review of fc78767,
 * 6d411bca538c). A package with two answers for one file is not a package, so
 * the stage reports it like any other incomplete answer and stores nothing.
 *
 * Compared after trimming, with `\` read as `/`, a leading `./` dropped and
 * case folded: abapGit object names are case-insensitive, and two spellings of
 * one path land in one file on most checkouts.
 *
 * Every `.` and empty segment goes, and a `..` takes back the segment before
 * it: `src/../shared.ts` and `a/./b.ts` are `shared.ts` and `a/b.ts` on disk,
 * and only a leading `./` used to be dropped (QA slice review of ad155b478e36,
 * 6dc1260fefb2). A `..` with nothing before it stays, so a path that leaves the
 * package is never folded into one inside it.
 */
export const normalisedPackagePath = (path: string): string => {
  const out: string[] = [];
  for (const segment of path.trim().replace(/\\/g, '/').split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..' && out.length > 0 && out[out.length - 1] !== '..') {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join('/').toLowerCase();
};

export const duplicatePaths = (files: ReadonlyArray<{ path: string }>): string[] => {
  const seen = new Set<string>();
  const repeated: string[] = [];
  for (const file of files) {
    const key = normalisedPackagePath(file.path);
    if (seen.has(key)) {
      if (!repeated.includes(file.path.trim())) repeated.push(file.path.trim());
    } else {
      seen.add(key);
    }
  }
  return repeated;
};
