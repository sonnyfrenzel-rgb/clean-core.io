# MCP beta (dev only)

Status: private beta since 25.11.2026, owner decision of the same day. One user (Sonny), the `dev` service
(`clean-core-dev`) only. Not on `main`, not listed in any directory, no change to the privacy policy or the terms.
The concept with the later phases (OAuth, public use, listing) is a planning note outside the repository; this
page describes what is built.

## What it is

A remote MCP server inside the Next.js app. An assistant such as Claude calls it with ABAP source and gets back
the same deterministic reading the web app makes before any model step.

- Routes: `app/api/mcp/[key]/route.ts` (key in the URL) and `app/api/mcp/route.ts` (key in the
  `Authorization: Bearer` header). Both call `lib/mcp/http.ts`.
- Protocol: Streamable HTTP, stateless. Each POST sends one JSON-RPC 2.0 message and gets one JSON answer, or
  202 for a notification. Sessions (`Mcp-Session-Id`) and server-to-client streams are not used, so GET and
  DELETE answer 405. Batches are refused. Methods: `initialize`, `notifications/initialized` (and any other notification), `ping`, `tools/list`,
  `tools/call`.
- Protocol versions: 2025-11-25, 2025-06-18 and 2025-03-26, which begin with `initialize`. The current revision
  2026-07-28 replaces `initialize` with per-request metadata and `server/discover`, and this server does not
  support it yet. A request that names 2026-07-28 in `MCP-Protocol-Version` gets HTTP 400 with a plain JSON-RPC
  error, and a client that speaks both revisions then falls back to `initialize`. Support for 2026-07-28 is a
  later step.
- No new dependency: the JSON-RPC handler is `lib/mcp/protocol.ts`, written by hand.

## Tools

Each tool only reads and is deterministic. Each is annotated `readOnlyHint: true`, `destructiveHint: false`,
`idempotentHint: true`, `openWorldHint: false`. Every result includes `origin: "engine"`, `ai_generated: false`,
`signed: false`, the engine version, the edition, the catalog snapshot (key and SHA-256) and the level rule
version.

| Tool | Input | Output |
|---|---|---|
| `analyze_abap` | `source` (required), `edition` (`private` default, or `public`), `include`, `max_items` (1 to 200, default 40) | `input` (SHA-256, bytes, line count, first code line and its number, object type), `summary` (clean core score, route, findings by severity, coverage complete), `findings` (kind, title, severity, lines, SAP object with its level (A–D, or Unknown where the catalog does not grade it), level basis and SAP state, recommendation, code), `process` (steps with line ranges, flows, lanes, what was not drawn), `business_rules` (rule text, lines, parameters), `no_result_states`, `not_determined` (what the engine could not assess, objects with an unknown level), `truncated` |
| `lookup_sap_object_level` | `names` (1 to 50), `use` (`read`, `write`, `reference`), `edition` | per object: level, level basis, SAP state, level of the object alone when the use changes it, no-released-path flag, successor and who names it (SAP's file or Clean-Core.io's curated mapping), catalog page |
| `export_bpmn` | `source`, `edition`, `process_name` | BPMN 2.0 XML of the process map with the engine's plain labels, and its statistics |

The engine is called exactly as `app/api/runs/create/route.ts` calls it: the same pre-checks in the same order
(256 KiB, `looksLikeAbap`, edition `public` or `private`), the catalog snapshot of the edition
(`catalogSnapshotRefFor`), `buildAbapEvidence` and `routeExtensibility` with this release's engine, and
`gradeSapObjectUse` for the level of each finding's object. The source hash is computed the same way as a run's,
so `input.sha256` matches the hash of a run made from the same source in the app. The BPMN file is the plain
file of `buildReadingExports`, with no stored naming, so no element has a name a model wrote.

Differences from the app, on purpose:

- Comment text is not returned (see below). For `export_bpmn` this means the labels are read from the source with
  its comments removed; the map itself, and every line anchor, comes from the source as received.
- The default edition is `private` (owner decision 25.11.2026). A run in the app defaults to `public`.
- The result is not a run: nothing is signed, stored or counted against the five free runs.

## What it returns from the source, and how it is made safe

Anything copied from the source is data that may have been written to steer the assistant that reads the answer.
`lib/mcp/sanitize.ts`:

- removes comment text from every quoted span: a full-line comment (`*` in column 1) and the text after a `"`
  outside a literal;
- cuts a string literal after 60 characters and marks the cut;
- removes control, zero-width and bidi characters from every string of a result;
- breaks up markdown image and link syntax (`![`, `](`) and fetching HTML tags (`<img`, `<iframe`, …), so no host
  renders a picture from a URL out of the source;
- keeps quoted spans to one line of at most 160 characters (400 for a rule text).

Fields copied from the source end in `_quoted`, and the `initialize` instructions say so. The stated
requirements, header rules and author comments the app reads from comments are not part of the answer.

## Limits

- 256 KiB of source per call, checked before anything is computed; 1 MiB request body.
- 60 tool calls an hour in total, across all callers (`assertRateLimit`, key `mcp-beta:tools-call`).
  `initialize`, `tools/list` and `ping` are not counted. The limiter is skipped in the emulator build.
- The assistant has to write the whole source into the tool call. For long programs that is slow and can hit the
  assistant's output limit; `input.lines`, `input.sha256` and `input.first_line` show what actually arrived.
- `export_bpmn` answers can be large: about 200 KB of XML for the 552-line purchase order example.
- The tools read only the source in the call. They take no file upload or URL and cannot open projects.

## What is stored and logged

Nothing about the source. No Firestore write except the rate-limit counter (a pseudonymised document id and
timestamps, deleted by its TTL). One log line per request: `message: "mcp-beta"`, the JSON-RPC method, the tool,
the outcome (`ok`, `tool-error:not-abap`, …), the size bucket of the source (`<4KB`, `4-32KB`, `32-128KB`,
`128-256KB`, `>256KB`), HTTP status and duration. Never the source, a file name, the key or an error's text.

Cloud Run writes its own request log, which includes the request URL. With the key in the URL, the key is in
that log (inside the GCP project only). Rotate the key when the beta ends or if the log is shared.

## Who can reach it

`lib/mcp/access.ts`. The route answers 404 to everybody unless both hold:

1. `MCP_BETA_KEY` is set and at least 32 characters long;
2. the deployment is not production. Production is recognised by one of `K_SERVICE=clean-core`,
   `NEXT_PUBLIC_FIRESTORE_DB_ID=clean-core-eu` or `NEXT_PUBLIC_APP_URL=https://clean-core.io`, so the key
   reaching the production service by mistake does not open the route.

Then the caller has to present the key, as the last path segment or as `Authorization: Bearer <key>`. A wrong
key is also 404. A request with a browser `Origin` other than the server's own is 403. No CORS headers, no
cookies.

## Switching it on (dev)

The deploy workflow merges environment variables into the service (it does not overwrite them), so a value set
once on `clean-core-dev` survives later deploys. Keep the key in Secret Manager, so it never appears in a command
line or in `gcloud run services describe`:

```bash
# 1. Create the secret and add a random key (32 random bytes, URL-safe, 43 characters). Nothing is printed.
gcloud secrets create mcp-beta-key --replication-policy=automatic --project=cleancore-491216
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" \
  | gcloud secrets versions add mcp-beta-key --data-file=- --project=cleancore-491216

# 2. Let the app's service account read it.
gcloud secrets add-iam-policy-binding mcp-beta-key --project=cleancore-491216 \
  --member=serviceAccount:clean-core-run@cleancore-491216.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor

# 3. Expose it to the dev service as MCP_BETA_KEY (this starts a new revision).
gcloud run services update clean-core-dev --region=europe-west1 --project=cleancore-491216 \
  --update-secrets=MCP_BETA_KEY=mcp-beta-key:latest
```

To read the key for the connector URL, on your own machine only:
`gcloud secrets versions access latest --secret=mcp-beta-key --project=cleancore-491216`.

## Connecting it in Claude

The dev service is reached at `https://clean-core-dev-qcevuoi3uq-ew.a.run.app` (`dev.clean-core.io` has no DNS
record). The connector URL is

```
https://clean-core-dev-qcevuoi3uq-ew.a.run.app/api/mcp/<KEY>
```

Claude (web or desktop app):

1. Open **Settings → Connectors** and choose **Add custom connector**.
2. Name: `Clean-Core.io beta`. Remote MCP server URL: the URL above with your key.
3. Leave the OAuth fields under **Advanced settings** empty and add the connector.
4. In a chat, enable the connector in the tools menu, paste an ABAP program and ask something like "Analyze this
   ABAP with Clean-Core.io and list the clean core findings with their lines."
5. Claude asks for permission the first time it calls each tool. The tools only read.

Claude Code, with the key in a header instead of the URL:

```bash
claude mcp add --transport http clean-core-beta \
  https://clean-core-dev-qcevuoi3uq-ew.a.run.app/api/mcp \
  --header "Authorization: Bearer <KEY>"
```

To check the server by hand: `curl -s -X POST <URL> -H "content-type: application/json" -d
'{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`.

## Switching it off

Either of these turns the route back into a 404 at once:

```bash
# Remove the variable from the dev service (new revision).
gcloud run services update clean-core-dev --region=europe-west1 --project=cleancore-491216 \
  --remove-secrets=MCP_BETA_KEY

# Or rotate the key: add a new version and disable the old one; the old connector URL stops working
# with the next revision (redeploy or `gcloud run services update ... --update-secrets=MCP_BETA_KEY=mcp-beta-key:latest`).
gcloud secrets versions add mcp-beta-key --data-file=- --project=cleancore-491216
gcloud secrets versions disable <OLD_VERSION> --secret=mcp-beta-key --project=cleancore-491216
```

Removing the connector in Claude only stops Claude from calling it; the key keeps working until it is removed or
rotated.

## Tests

- `tests/mcp-beta.spec.ts` (server-free): the JSON-RPC handler (initialize, notifications, ping, tools/list,
  tools/call), error codes, the three tools on the purchase order starter example, a non-ABAP input, the size cap,
  the edition check, determinism, that no comment of the example appears in any output, an injection corpus
  (comments, bidi and zero-width characters, markdown images, long literals), the access gate including
  production, the HTTP half (404, 405, 202, 400, 403, 413, 415, headers), the log line, and two source guards
  (no model client in the import graph; no fetch, store access or console output in the MCP files).
- `tests/mcp-beta-route.spec.ts` (against a running build): with `MCP_BETA_KEY` unset, as in CI, every form is
  404; with it set, the whole connector exchange over the real routes.
