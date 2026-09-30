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
 */
export const normalisedPackagePath = (path: string): string =>
  path.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '').toLowerCase();

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
