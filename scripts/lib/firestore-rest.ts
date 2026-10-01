/**
 * The Firestore the weekly usage report needs, over plain REST — and nothing
 * else.
 *
 * Why this exists rather than `firebase-admin`: the report runs in the one job
 * that holds `id-token: write` (`.github/workflows/usage-report.yml`). That
 * permission puts `ACTIONS_ID_TOKEN_REQUEST_URL` and `…_TOKEN` into the
 * environment of every step of the job, and the Workload Identity provider
 * accepts the token it mints on the repository alone. `--ignore-scripts` kept
 * install scripts out; it did nothing about *runtime* code — every package the
 * report loaded ran beside that permission and could mint its own token (QA
 * review, fa0aaea6cc47). The job now installs no package at all: the report is
 * first-party TypeScript run by Node's own type stripping, and this module is
 * the part `firebase-admin` used to be. `tests/no-fabricated-figures.spec.ts`
 * walks the report's import graph and fails on any import that is not
 * relative or `node:`.
 *
 * It implements exactly the surface the job calls — `collection(x).get()`,
 * `collectionGroup(x).get()`, `collection(x).add(data)` — with the same shapes
 * the Admin SDK returns, so `buildUsageReport` takes either.
 */

export interface RestDoc {
  id: string;
  data(): Record<string, unknown>;
}

export interface RestSnapshot {
  docs: RestDoc[];
}

/** Stands in for `FieldValue.serverTimestamp()`: written as a REQUEST_TIME transform. */
export const SERVER_TIMESTAMP: unique symbol = Symbol('serverTimestamp');

type FirestoreValue = Record<string, unknown>;

/** A REST `Value` as the Admin SDK would hand it back: timestamps as objects with `toDate()`. */
export function decodeValue(v: FirestoreValue): unknown {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue as boolean;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue as string;
  if ('timestampValue' in v) {
    const at = new Date(v.timestampValue as string);
    return { toDate: () => at };
  }
  if ('referenceValue' in v) return v.referenceValue as string;
  if ('bytesValue' in v) return v.bytesValue as string;
  if ('geoPointValue' in v) return v.geoPointValue;
  if ('arrayValue' in v) {
    const values = ((v.arrayValue as { values?: FirestoreValue[] }).values) ?? [];
    return values.map(decodeValue);
  }
  if ('mapValue' in v) return decodeFields((v.mapValue as { fields?: Record<string, FirestoreValue> }).fields);
  return undefined;
}

export function decodeFields(fields: Record<string, FirestoreValue> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields ?? {})) out[k] = decodeValue(v);
  return out;
}

export function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) fields[k] = encodeValue(v);
    }
    return { mapValue: { fields } };
  }
  throw new Error(`cannot write a ${typeof value} to Firestore`);
}

function randomId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function firestoreRest(opts: {
  projectId: string;
  databaseId: string;
  accessToken: string;
  /** `http://127.0.0.1:8080` for the emulator; production otherwise. */
  origin?: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const database = `projects/${opts.projectId}/databases/${opts.databaseId}`;
  const base = `${opts.origin ?? 'https://firestore.googleapis.com'}/v1/${database}`;
  const headers = { Authorization: `Bearer ${opts.accessToken}`, 'Content-Type': 'application/json' };

  async function call(url: string, body: unknown): Promise<unknown> {
    const res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body) });
    // Status only: the body of a failed read can quote document contents.
    if (!res.ok) throw new Error(`Firestore REST ${url.slice(base.length)} failed: ${res.status}`);
    return res.json();
  }

  async function query(collectionId: string, allDescendants: boolean): Promise<RestSnapshot> {
    const rows = (await call(`${base}/documents:runQuery`, {
      structuredQuery: { from: [{ collectionId, allDescendants }] },
    })) as { document?: { name: string; fields?: Record<string, FirestoreValue> } }[];
    const docs = rows
      .filter((r) => r.document)
      .map((r) => {
        const fields = decodeFields(r.document!.fields);
        return { id: r.document!.name.split('/').pop() as string, data: () => fields };
      });
    return { docs };
  }

  return {
    collection(collectionId: string) {
      return {
        get: () => query(collectionId, false),
        async add(data: Record<string, unknown>): Promise<{ id: string }> {
          const id = randomId();
          const fields: Record<string, FirestoreValue> = {};
          const transforms: { fieldPath: string; setToServerValue: 'REQUEST_TIME' }[] = [];
          for (const [k, v] of Object.entries(data)) {
            if (v === SERVER_TIMESTAMP) transforms.push({ fieldPath: k, setToServerValue: 'REQUEST_TIME' });
            else if (v !== undefined) fields[k] = encodeValue(v);
          }
          await call(`${base}/documents:commit`, {
            writes: [{
              update: { name: `${database}/documents/${collectionId}/${id}`, fields },
              updateTransforms: transforms,
              currentDocument: { exists: false },
            }],
          });
          return { id };
        },
      };
    },
    collectionGroup(collectionId: string) {
      return { get: () => query(collectionId, true) };
    },
  };
}
