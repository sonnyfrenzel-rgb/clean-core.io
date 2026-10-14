/**
 * The two RAP package names the Design tool shows before a package exists:
 * the short name every object carries and the table name built from it.
 * Its own tiny module so the design page and the markdown formatter do not
 * pull the scaffold (and the unit-plan chain behind it) into the client
 * bundle; `scaffold-rap.ts` re-exports both, so the names stay one source.
 *
 * Pure. No imports beyond the abapGit name limits.
 */
import { NAME_MAX } from './abapgit-files';

/** The short name every object of the package carries: ≤ 12 characters, so every name stays ≤ 30. */
export function rapShortName(program: string | null): string {
  const base = (program ?? 'program').toLowerCase().replace(/^\/[\w]+\//, '').replace(/^[zy]/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return (base || 'program').slice(0, 12).replace(/_+$/, '');
}

/** A transparent table's name has at most 16 characters (abaplint `getAllowedNaming` of TABL): `z<short>_rec`, the short name cut where it would not fit. */
export function rapTableName(short: string): string {
  const room = NAME_MAX.TABL - 'z'.length - '_rec'.length;
  return `z${short.length <= room ? short : short.slice(0, room).replace(/_+$/, '')}_rec`;
}
