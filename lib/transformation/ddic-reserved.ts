/**
 * Field names the ABAP Dictionary refuses (scaffold version 10, 3.0.13). SAP keeps the words a field may not be
 * called in table TRESE: the SQL reserved words, so that a field name never collides with the SQL the database
 * layer writes. The first real activation of an engine-led package (SD example, BTP ABAP trial, 15.10.2026) refused
 * the custom entity with "DEFERRED is a reserved word (choose another field name)" — a component of the original's
 * result list. The list below is the SQL-92 reserved words, the CDS keywords the scaffold already avoided, and the
 * words activation or abaplint have refused before (DAY, HOUR, ZONE, HANDLER, SECTION, PARAMETER). Renaming a name
 * that SAP would have accepted costs a `_value` suffix; activating a name SAP refuses costs the whole package.
 */
const SQL92 =
  'absolute action add all allocate alter and any are as asc assertion at authorization avg begin between bit ' +
  'bit_length both by cascade cascaded case cast catalog char char_length character character_length check close ' +
  'coalesce collate collation column commit connect connection constraint constraints continue convert ' +
  'corresponding count create cross current current_date current_time current_timestamp current_user cursor date ' +
  'day deallocate dec decimal declare default deferrable deferred delete desc describe descriptor diagnostics ' +
  'disconnect distinct domain double drop else end end-exec escape except exception exec execute exists external ' +
  'extract false fetch first float for foreign found from full get global go goto grant group having hour identity ' +
  'immediate in indicator initially inner input insensitive insert int integer intersect interval into is ' +
  'isolation join key language last leading left level like local lower match max min minute module month names ' +
  'national natural nchar next no not null nullif numeric octet_length of on only open option or order outer ' +
  'output overlaps pad partial position precision prepare preserve primary prior privileges procedure public read ' +
  'real references relative restrict revoke right rollback rows schema scroll second section select session ' +
  'session_user set size smallint some space sql sqlcode sqlerror sqlstate substring sum system_user table ' +
  'temporary then time timestamp timezone_hour timezone_minute to trailing transaction translate translation trim ' +
  'true union unique unknown update upper usage user using value values varchar varying view when whenever where ' +
  'with work write year zone';
const CDS = 'association composition define entity exact many number one parameters';
// Names SAP refused in a real import: `resource` as a CDS element of the PM custom entity (BTP trial, 18.10.2026:
// "RESOURCE is a reserved word (choose another field name)").
const REFUSED_BEFORE = 'handler parameter resource';

const RESERVED: ReadonlySet<string> = new Set(`${SQL92} ${CDS} ${REFUSED_BEFORE}`.split(/\s+/));

/** Whether a generated Dictionary field or CDS element may not carry this name. */
export function isDdicReserved(name: string): boolean {
  return RESERVED.has(name.toLowerCase());
}

/** The name a generated field gets: the original's, or with `_value` when the Dictionary refuses it. */
export function ddicFieldName(name: string): string {
  return isDdicReserved(name) ? `${name}_value`.slice(0, 30) : name;
}
