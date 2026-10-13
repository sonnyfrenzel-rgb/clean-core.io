# ABAP file formats — test fixtures

Copied unchanged from [SAP/abap-file-formats](https://github.com/SAP/abap-file-formats)
at commit `e42c8003d8aa7b7b510b6ff4a8f1ed83a97a835b` (2026-10-09), MIT licence — see
`LICENSE` in this folder (Copyright (c) 2021 SAP SE or an SAP affiliate company).

- `<type>-v1.json` — the JSON schema of the object type, from `file-formats/<type>/<type>-v1.json`.
- `examples/` — SAP's own example metadata files, from `file-formats/<type>/examples/`.

Used only by `tests/transformation-aff-check.spec.ts`, and only while the synced
schemas (`lib/generated/aff-schemas/`) are not in the tree.
