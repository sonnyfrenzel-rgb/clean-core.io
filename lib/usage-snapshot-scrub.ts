/**
 * The personal data in stored weekly-report snapshots (`usage_reports`), and
 * how it is taken out again.
 *
 * Until 30.09.2026 the Friday job stored the whole report object, and the
 * report listed people: `newAccounts`, `newlyActivated` and `reachedLimit` held
 * a name and an address per account, `delivery.failures` the recipient address
 * and the provider's reason text (which usually repeats it), and `recipient`
 * the administrator's address. Snapshots written since hold figures only — see
 * `usageReportSnapshot` in `lib/usage-report.ts` — so this module exists for the
 * documents written before that, and it serves two callers:
 *
 *  - the account erasure (`deleteUserDataAndAccount`), which removes *one*
 *    account's entries and leaves everybody else's figures as they were; and
 *  - the one-off clean-up (`scripts/scrub-usage-report-snapshots.ts`), which
 *    turns every old list into the figure the current report carries in its
 *    place.
 *
 * Pure and without imports: the erasure loads it on the server, the script from
 * the command line, and a spec with nothing running.
 */

type Snapshot = Record<string, unknown>;

/** The list fields that held one entry per account. */
const PERSON_LISTS = ['newAccounts', 'newlyActivated', 'reachedLimit'] as const;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const lower = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

function failuresOf(data: Snapshot): unknown[] | null {
  const delivery = data.delivery;
  if (!isObject(delivery) || !Array.isArray(delivery.failures)) return null;
  return delivery.failures;
}

/** An old failure entry names a recipient; a current one is a count per kind. */
const isRecipientFailure = (f: unknown) => isObject(f) && ('to' in f || 'detail' in f);

/**
 * Which fields of a snapshot still carry personal data — names of fields only,
 * never a value, so a dry run can print it into any log.
 */
export function personalDataFields(data: Snapshot): string[] {
  const fields: string[] = [];
  for (const key of PERSON_LISTS) {
    const list = data[key];
    if (Array.isArray(list) && list.some(isObject)) fields.push(key);
  }
  if ((failuresOf(data) ?? []).some(isRecipientFailure)) fields.push('delivery.failures');
  if ('recipient' in data) fields.push('recipient');
  return fields;
}

/**
 * The update that removes one account from an old snapshot, or `null` when the
 * snapshot names none of its addresses. Entries are matched by address —
 * the only identifier the old lists carried — case-insensitively; a failure is
 * the account's when it was sent to one of the addresses or its reason text
 * names one. Every other entry is left exactly as it was.
 *
 * The keys are Firestore field paths (`delivery.failures`); a `recipient` equal
 * to one of the addresses is returned as `deleteRecipient: true`, because the
 * caller owns the `FieldValue.delete()` sentinel.
 */
export function withoutAccount(
  data: Snapshot,
  addresses: readonly string[],
): { update: Record<string, unknown>; deleteRecipient: boolean } | null {
  const wanted = new Set(addresses.map(lower).filter(Boolean));
  if (wanted.size === 0) return null;
  // An address counts only as a whole address: erasing a@x.io must not take
  // the failure of ba@x.io or a@x.io.uk with it (QA 9e198a0085d0).
  const whole = [...wanted].map(
    (a) => new RegExp(`(?<![a-z0-9._%+-])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9._-])`),
  );
  const mentions = (text: unknown) => {
    const t = lower(text);
    return !!t && whole.some((re) => re.test(t));
  };

  const update: Record<string, unknown> = {};
  for (const key of PERSON_LISTS) {
    const list = data[key];
    if (!Array.isArray(list)) continue;
    const kept = list.filter((entry) => !(isObject(entry) && wanted.has(lower(entry.email))));
    if (kept.length !== list.length) update[key] = kept;
  }

  const failures = failuresOf(data);
  if (failures) {
    const kept = failures.filter((f) => !(isObject(f) && (wanted.has(lower(f.to)) || mentions(f.detail))));
    if (kept.length !== failures.length) update['delivery.failures'] = kept;
  }

  const deleteRecipient = wanted.has(lower(data.recipient));
  if (Object.keys(update).length === 0 && !deleteRecipient) return null;
  return { update, deleteRecipient };
}

/**
 * The figures an old snapshot's lists stood for, in the shape the current
 * report stores: a count where there was a list of people, analyses per newly
 * activated account (largest first), failures counted per kind and outcome.
 * `null` when the snapshot carries no personal data. `recipient` is dropped
 * by the caller (`deleteRecipient`), for the same reason as above.
 */
export function figuresOnly(data: Snapshot): { update: Record<string, unknown>; deleteRecipient: boolean } | null {
  if (personalDataFields(data).length === 0) return null;
  const update: Record<string, unknown> = {};

  for (const key of ['newAccounts', 'reachedLimit'] as const) {
    const list = data[key];
    if (Array.isArray(list) && list.some(isObject)) update[key] = list.length;
  }

  const activated = data.newlyActivated;
  if (Array.isArray(activated) && activated.some(isObject)) {
    update.newlyActivated = activated
      .map((e) => (typeof e === 'number' ? e : isObject(e) && typeof e.runs === 'number' ? e.runs : 0))
      .sort((a, b) => b - a);
  }

  const failures = failuresOf(data);
  if (failures && failures.some(isRecipientFailure)) {
    const counts = new Map<string, { kind: string; status: string; count: number }>();
    for (const f of failures) {
      if (!isObject(f)) continue;
      const kind = typeof f.kind === 'string' ? f.kind : 'mail';
      const status = typeof f.status === 'string' ? f.status : 'email.bounced';
      const add = typeof f.count === 'number' && !isRecipientFailure(f) ? f.count : 1;
      const key = `${status} ${kind}`;
      const entry = counts.get(key) ?? { kind, status, count: 0 };
      entry.count += add;
      counts.set(key, entry);
    }
    update['delivery.failures'] = [...counts.values()].sort(
      (a, b) => b.count - a.count || a.status.localeCompare(b.status) || a.kind.localeCompare(b.kind),
    );
  }

  return { update, deleteRecipient: 'recipient' in data };
}
