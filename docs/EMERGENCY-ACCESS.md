# Emergency access — runbook

What the operator may do when a project or a stored secret has to be opened outside the product, and how that is
recorded. Privacy policy section 8 and the Additional Agreement (ZV 10) promise that the operator opens a project or
decrypts a stored key or S/4HANA password **only** as a logged emergency act. This file is how that promise is kept.
Open value: `emergencyAccessLogging` (`lib/legal/open-values.ts`).

## 1. What counts as an emergency

Only one of these, and only when the product itself cannot do it:

| Case | Example |
|---|---|
| **A request from the account holder** | The owner of a project asks in writing (e-mail to info@clean-core.io) for help with their own project, and the help needs a look at its data. |
| **A legal obligation** | An order or request from a court or an authority. Reported illegal content follows the content-hold procedure (Terms 7, `lib/content-hold.ts`): **held content is never opened.** |
| **Security or integrity of the platform** | A suspected compromise, data corruption or a fault that can only be investigated on the stored data. |
| **Restoring service** | A defect that blocks the account holder and can only be repaired on the stored record. |

Not an emergency: curiosity, product research, quality checks, support that the product can give, model evaluation.
Stored code is never used for anything but the case at hand.

## 2. What exists, and what does not

- No application path lets the operator open a project or decrypt a secret: `firestore.rules` gives a project only to
  its owner and invited readers; every reader of a stored key or S/4HANA password (`loadOwnModelKey`,
  `loadS4ConfigForUser`) reads with the caller's own uid.
- An emergency act therefore always happens **outside the product**: in the Google Cloud console or with the Admin SDK
  from the operator's machine. That is exactly what has to be logged.

## 3. Logging — two layers

1. **Google Cloud Data Access audit logs (automatic, cannot be skipped).** Enabled for Cloud Firestore and for Cloud
   KMS / Secret Manager in project `cleancore-491216` (owner step, section 6). Every read through the console or the
   Admin SDK is then recorded by Google with time, principal and resource, independent of the operator's discipline.
   Retention: the `_Default` bucket (30 days) or longer if a dedicated bucket is configured.
2. **The emergency record (by the operator, every time).** Before the act, the operator writes one entry to
   `audit_events` with `kind: 'emergency-access'`, through the Admin SDK only (no rules change), containing:
   - date and time (UTC), operator, the case from section 1 and its reference (e-mail, order number, incident);
   - the account (keyed hash, never the plain address) and the project id or the secret's kind (model key / S/4HANA);
   - what exactly will be read or decrypted, and why nothing less suffices.

   After the act a second entry closes it: what was read, whether anything was copied (it should not be), when access
   ended. Both entries follow the security log's retention (24 months, privacy section 6).

## 4. Procedure

1. Check that the case is one of section 1 and that the product cannot do it. If in doubt, do not proceed.
2. Write the opening record (section 3.2).
3. Do the minimum: read only what the case needs; decrypt a secret only if the case is impossible without it; never
   export, copy to another system, or paste stored code or secrets into a chat, ticket or model.
4. Write the closing record.
5. Tell the account holder, unless an authority asks for restraint: what was opened, when and why — by e-mail within
   7 days.
6. Keep any working copy only as long as the case needs it, then delete it and note the deletion in the closing record.

## 5. What is never done

- Held content (content holds) is never opened, copied or exported — not even in an emergency; the authority decides.
- A decrypted key or password is never stored, logged or reused, and never used to call a provider or an SAP system.
- No bulk access: one account, one project or one secret per record.

## 6. Owner steps (one-time)

Enable Data Access audit logs for Firestore, KMS and Secret Manager (the script `scratch/enable-data-access-logs.ps1`
does this; it changes only the project's audit configuration):

- Cloud Firestore API (`datastore.googleapis.com`): DATA_READ, DATA_WRITE
- Cloud KMS (`cloudkms.googleapis.com`) and Secret Manager (`secretmanager.googleapis.com`): DATA_READ

Then confirm the open value `emergencyAccessLogging` with the date.
