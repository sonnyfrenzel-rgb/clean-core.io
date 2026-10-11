/**
 * What the program can and cannot do, read from the engine — and the check
 * that holds a model's sentence against it (owner 11.10.2026, external review
 * of the FI Collection Worklist package, F-06).
 *
 * The review found a business SOP that upgraded technical facts into practice:
 * internal arithmetic checks became "cross-checked against company ledger
 * control totals", the current credit context became "full credit exposure
 * analysis", a generic warning became "an audit message with the number of
 * excluded items", and an approval by the AR Lead appeared where the program
 * has no approval at all. Each of these asserts a capability the engine can
 * show to be absent from the whole source — no COMMIT WORK and no table
 * changed means no posting; no general-ledger table read means no ledger
 * reconciliation.
 *
 * `CapabilityFacts` is what the engine read (`lib/documentation-facts.ts`
 * builds it from the source; the stored documentation and the process
 * description carry it). `capabilityPresence` says, per capability, whether
 * the source shows it and, when not, why. `absentClaims` finds the
 * capabilities a sentence asserts that the source does not have: such a
 * sentence is never current practice — it is shown as "Proposal — not in the
 * program", with the reason.
 *
 * Pure and engine-free, so the stage, the exports and the Markdown of the
 * delivery package all read the same answer.
 */

export interface FactObject {
  name: string;
  line: number;
}

export interface FactCall extends FactObject {
  kind: 'bapi' | 'function' | 'transaction' | 'program' | 'method';
  /** The `DESTINATION` as written — a call into another system. */
  destination: string | null;
}

/** Bumped when the shape changes; a reader treats an unknown version as absent. */
export const CAPABILITY_FACTS_VERSION = 1;

export interface CapabilityFacts {
  version: typeof CAPABILITY_FACTS_VERSION;
  /** Database tables the reached and unreached code reads, first line each. */
  reads: FactObject[];
  /** Database tables the code changes (INSERT, UPDATE, MODIFY, DELETE), first line each. */
  writes: FactObject[];
  /** `COMMIT WORK` and `BAPI_TRANSACTION_COMMIT`. */
  commits: FactObject[];
  /** `CALL FUNCTION … IN UPDATE TASK`. */
  updateTask: FactObject[];
  /** Function modules, BAPIs, transactions, programs and class methods called by name. */
  calls: FactCall[];
  /** Authorization objects checked. */
  authority: FactObject[];
  /** Places whose target the code computes at run time (dynamic PERFORM, CALL FUNCTION, SELECT FROM (var)). */
  dynamic: number;
  /**
   * Database changes whose table the code names only at run time
   * (`MODIFY (lv_table) …`), by the expression as written. Absent in facts
   * stored before it was recorded (QA review of 11e3bc7d90e8).
   */
  dynamicWrites?: FactObject[];
  /**
   * Calls whose target the code names only at run time (`CALL FUNCTION lv_fm`,
   * `PERFORM (lv_form)`), by the expression as written — such a call could post.
   * Absent in facts stored before it was recorded (QA review of 35b97d90c6e1).
   */
  dynamicCalls?: FactObject[];
}

export type Capability = 'posting' | 'ledger' | 'credit-exposure' | 'approval' | 'mail' | 'audit-log' | 'remote';

export interface CapabilityAnswer {
  present: boolean;
  /**
   * False when the source does not let the engine say: the capability is not
   * shown, but a change to a table named only at run time could be it. Such a
   * capability is "not determined", never absent.
   */
  determined: boolean;
  /** The lines that show it, when present. */
  evidence: FactObject[];
  /** What the program does not do, in one plain sentence — said when absent. */
  absent: string;
  /** The same in a few words, for beside a sentence: "no posting in the code". */
  short: string;
}

/** General-ledger tables and functions: a read of one is the least a ledger reconciliation needs. */
const LEDGER_TABLES = /^(?:GLT0|GLT3|FAGLFLEXT|FAGLFLEXA|FAGLFLEXP|ACDOCA|ACDOCT|SKC1A|SKC1C|SKB1|BSIS|BSAS|FAGLBSIS|FAGLBSAS|GLPCT|GLPCA|FMGLFLEXT|BSIS_VIEW|BSAS_VIEW)$/;
const LEDGER_CALLS = /^(?:FAGL_|FI_GL_|BAPI_GL_|BAPI_ACC_GL|GL_ACCOUNT_BALANCE|READ_GL|FI_ACCOUNT_BALANCE|BAPI_COMPANYCODE_GET_PERIOD)/;
/** Credit exposure: the credit-management totals, not the credit master record (KNKK). */
const EXPOSURE_TABLES = /^(?:S066|S067|S068|UKMBP_CMS_SGM|UKMBP_CMS|UKM_ITEM|UKM_TOTALS|UKMCRED_SGM0C)$/;
const EXPOSURE_CALLS = /^(?:CREDIT_EXPOSURE|SD_CREDIT_EXPOSURE|UKM_|BAPI_CREDIT_ACCOUNT|CREDIT_CHECK|SD_ORDER_CREDIT_CHECK|FI_CREDIT)/;
const APPROVAL_CALLS = /^(?:SAP_WAPI_|SWW_|SWE_EVENT_CREATE|SWU_|SAP_WAPI|BAPI_\w*RELEASE|BAPI_\w*APPROVE|ME_REL_|CL_SWF_)/;
const MAIL_CALLS = /^(?:SO_NEW_DOCUMENT_|SO_DOCUMENT_SEND|SO_OBJECT_SEND|SX_|EFG_|CL_BCS|BCS_|SO_\w*SEND)/;
const LOG_CALLS = /^(?:BAL_LOG_|BAL_DB_SAVE|BAL_MSG_|APPL_LOG_|CL_BALI_|BAL_DSP_)/;

const names = (list: readonly FactObject[]) => list.map((o) => o.name);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Whether the source shows a capability to be absent — not shown, and nothing left open that could be it. */
export const isAbsent = (answer: CapabilityAnswer): boolean => !answer.present && answer.determined;

/**
 * Places that could change data although no table, commit or update task
 * shows it: a database change whose table is named only at run time, and a
 * call whose target is (a dynamic function module could be a posting BAPI —
 * QA review of 35b97d90c6e1). Facts stored before both were recorded say only
 * how many places are dynamic, so any such place leaves a change open.
 */
const openWrites = (facts: CapabilityFacts): number =>
  facts.dynamicWrites !== undefined && facts.dynamicCalls !== undefined
    ? facts.dynamicWrites.length + facts.dynamicCalls.length
    : facts.dynamic;

/** Per capability: does the source show it, and if not, the sentence that says so. */
export function capabilityPresence(facts: CapabilityFacts): Record<Capability, CapabilityAnswer> {
  const call = (re: RegExp) => facts.calls.filter((c) => re.test(c.name.toUpperCase()));
  const postingCalls = facts.calls.filter((c) =>
    (c.kind === 'bapi' && /(?:CREATE|CHANGE|POST|SAVE|UPDATE|DELETE|CANCEL|REVERSE|CLEAR)/.test(c.name.toUpperCase()))
    || /^(?:POSTING_INTERFACE_|FI_DOCUMENT_POST|AC_DOCUMENT_POST|BAPI_ACC_)/.test(c.name.toUpperCase()));
  const transactions = facts.calls.filter((c) => c.kind === 'transaction');
  const postingEvidence = [...facts.writes, ...facts.commits, ...facts.updateTask, ...postingCalls];
  const ledger = [...facts.reads.filter((r) => LEDGER_TABLES.test(r.name.toUpperCase())), ...call(LEDGER_CALLS)];
  const exposure = [...facts.reads.filter((r) => EXPOSURE_TABLES.test(r.name.toUpperCase())), ...call(EXPOSURE_CALLS)];
  const approval = call(APPROVAL_CALLS);
  const mail = call(MAIL_CALLS);
  const log = call(LOG_CALLS);
  const remote = facts.calls.filter((c) => !!c.destination);
  const writesOpen = openWrites(facts) > 0;
  return {
    posting: {
      short: 'no posting in the code',
      present: postingEvidence.length > 0,
      determined: postingEvidence.length > 0 || !writesOpen,
      evidence: postingEvidence,
      absent: transactions.length
        ? `It changes no table itself, issues no COMMIT WORK and registers no update task; it only opens ${plural(transactions.length, 'transaction')} (${names(transactions).join(', ')}) for the user.`
        : 'It does not post or change data in SAP: no table is changed, no COMMIT WORK is issued and no update task is registered anywhere in the source.',
    },
    ledger: {
      short: 'no ledger reconciliation in the code',
      present: ledger.length > 0,
      determined: true,
      evidence: ledger,
      absent: 'It does not reconcile against the general ledger: no ledger table (GLT0, FAGLFLEXT, ACDOCA, BSIS …) is read and no ledger balance is called. Totals it checks are its own arithmetic.',
    },
    'credit-exposure': {
      short: 'no credit exposure in the code',
      present: exposure.length > 0,
      determined: true,
      evidence: exposure,
      absent: 'It computes no credit exposure: no credit-management total (S066, S067, UKM …) is read and no exposure function is called.',
    },
    approval: {
      short: 'no approval workflow in the code',
      present: approval.length > 0,
      determined: true,
      evidence: approval,
      absent: 'It has no approval, release or override workflow: no workflow or release function is called.',
    },
    mail: {
      short: 'no correspondence in the code',
      present: mail.length > 0,
      determined: true,
      evidence: mail,
      absent: 'It sends no e-mail, letter or other correspondence: no send function is called.',
    },
    'audit-log': {
      short: 'no audit log in the code',
      present: log.length > 0 || facts.writes.length > 0,
      determined: log.length > 0 || facts.writes.length > 0 || !writesOpen,
      evidence: [...log, ...facts.writes],
      absent: 'It keeps no persistent log or audit record: no application log is written and no table is changed.',
    },
    remote: {
      short: 'no other system in the code',
      present: remote.length > 0,
      determined: true,
      evidence: remote,
      absent: 'It calls no other system: no call names a DESTINATION.',
    },
  };
}

/**
 * The sentence patterns that assert a capability. A sentence matching one,
 * where the source does not show that capability, asserts something the
 * program does not do. Word families, not keywords: "posting date" is not a
 * posting, "review" is not an approval.
 */
const CLAIMS: Record<Capability, RegExp> = {
  posting: /\b(?:posts?|posted|posting(?! (?:date|period|key|keys))|books?\b(?! of)|booked|journal entr\w*|offsets?\b|offsetting|clears? (?:the |all )?(?:open )?items?|creates? (?:an? )?(?:accounting |FI |financial )?documents?|updates? the (?:ledger|account|balance|master)|writes? back|settles?\b|reverses? (?:the )?(?:document|posting))\b/i,
  ledger: /\b(?:reconcil\w*|ledger control|control totals?|general ledger|G\/L balances?|against the ledger|ledger balances?|tie[sd]? out)\b/i,
  'credit-exposure': /\b(?:credit exposure|exposure analysis|full exposure|total exposure|credit[- ]limit (?:breach\w*|violation\w*|exceed\w*|overrun\w*)|credit risk (?:analysis|assessment|scor\w*)|exposure (?:calculation|check))\b/i,
  approval: /\b(?:approv\w*|overrid\w*|sign[- ]?off|signs? off|dual (?:approval|control)|four[- ]eyes|release (?:strategy|workflow|step)|authori[sz]es? (?:the )?(?:proposal|exception|override))\b/i,
  mail: /\b(?:e-?mails?|sends? (?:a |an |the )?(?:letter|reminder|notice|notification|correspondence|message to)|dunning letters?|notif(?:y|ies|ied|ication)s? (?:the )?(?:customer|manager|lead|team))\b/i,
  'audit-log': /\b(?:audit (?:log|trail|record|message|entry|entries|evidence)|logged for (?:audit|compliance)|logs? (?:the )?(?:number|count|exclusion)|persistent log|compliance log)\b/i,
  remote: /\b(?:external system|remote system|third[- ]party system|calls? (?:an?|the) (?:external|remote) (?:service|system))\b/i,
};

export interface AbsentClaim {
  capability: Capability;
  /** The words of the sentence that assert it. */
  words: string;
  /** Why it is not in the program — the absent sentence of `capabilityPresence`. */
  reason: string;
  /** The same in a few words. */
  short: string;
}

/** The capabilities a sentence asserts that the source shows to be absent. Empty: nothing contradicts the code. */
export function absentClaims(text: string, facts: CapabilityFacts | null): AbsentClaim[] {
  if (!facts) return [];
  const presence = capabilityPresence(facts);
  const out: AbsentClaim[] = [];
  for (const capability of Object.keys(CLAIMS) as Capability[]) {
    const m = CLAIMS[capability].exec(text);
    if (!m || !isAbsent(presence[capability])) continue;
    out.push({ capability, words: m[0], reason: presence[capability].absent, short: presence[capability].short });
  }
  return out;
}

/** Whether a sentence names a capability at all — used when the facts are not known. */
export function assertsCapability(text: string): boolean {
  return (Object.keys(CLAIMS) as Capability[]).some((c) => CLAIMS[c].test(text));
}

/**
 * Organisation the code cannot hold: people and job titles, escalation,
 * approval and sign-off, dual control, policies. A sentence that speaks of
 * these is an organisational proposal, never a fact of the program.
 */
const ORGANISATIONAL = /\b(?:escalat\w*|approv\w*|sign[- ]?off|dual (?:approval|control)|four[- ]eyes|segregation of duties|dispensation|company policy|policy|manager|lead\b|supervisor|steward|specialist|controller|officer|analyst|auditor|internal audit|compliance team|process owner|accountable|responsible role|consult\w*)\b/i;

export function isOrganisational(text: string, roles: readonly string[] = []): boolean {
  if (ORGANISATIONAL.test(text)) return true;
  const lower = text.toLowerCase();
  return roles.some((r) => r.trim().length > 2 && lower.includes(r.trim().toLowerCase()));
}

/** Validate a stored value read back from JSON: the shape this build understands, or null. */
export function readCapabilityFacts(value: unknown): CapabilityFacts | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.version !== CAPABILITY_FACTS_VERSION) return null;
  const objs = (x: unknown) => Array.isArray(x) && x.every((o) => !!o && typeof o === 'object' && typeof (o as FactObject).name === 'string' && Number.isInteger((o as FactObject).line));
  if (!objs(v.reads) || !objs(v.writes) || !objs(v.commits) || !objs(v.updateTask) || !objs(v.calls) || !objs(v.authority)) return null;
  if (typeof v.dynamic !== 'number') return null;
  if (v.dynamicWrites !== undefined && !objs(v.dynamicWrites)) return null;
  if (v.dynamicCalls !== undefined && !objs(v.dynamicCalls)) return null;
  return value as CapabilityFacts;
}
