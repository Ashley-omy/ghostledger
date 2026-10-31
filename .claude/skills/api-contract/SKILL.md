---
name: api-contract
description: Add or change GhostLedger's REST API contract in docs/openapi.yaml — new endpoints, fields, enums, error codes or examples. Use whenever a feature needs data the API doesn't provide yet, when frontend and backend disagree about a request or response shape, or before touching backend/app/schemas.py or frontend/api_client.py for a shape change.
---

# API contract changes

`docs/openapi.yaml` is the **only** agreement between frontend and backend. Change it first, then the code.

## Steps
1. **Read** the relevant part of `docs/openapi.yaml` and the data rules in `docs/API.md`.
2. **Edit the spec**, following its conventions:
   - Paths are relative to `/api/v1`, and every operation has a unique `operationId` in camelCase.
   - Reuse `components/schemas` and `components/responses` instead of inlining.
   - Nullable fields use `type: [X, "null"]` (OpenAPI 3.1).
   - **New fields are optional** unless both sides agree to a breaking change.
   - Quote any YAML string that contains `, ` inside `{ ... }` flow mappings, or it breaks parsing.
   - Every new response gets at least one realistic `example` (Hungarian receipt data, HUF), so the mock is useful.
   - New error cases reuse `Error`, and any new `code` is added to its enum.
3. **Lint** — this must show no errors (the localhost-server warnings are expected):
   ```bash
   npx @redocly/cli lint docs/openapi.yaml
   ```
4. **Try it on the mock:**
   ```bash
   npx @stoplight/prism-cli mock docs/openapi.yaml -p 4010
   curl -s localhost:4010/<path>                       # no /api/v1 prefix on the mock
   curl -s -H "Prefer: example=<name>" localhost:4010/<path>
   ```
5. **Update `docs/API.md`** if a flow, data rule or error code changed.
6. **Open a contract-only PR** (skill `team-git`) titled `api: <change>`. It needs a 👍 from both the frontend (B) and the backend owner (C/A) before merge.
7. After merge, implement it: backend via `backend-endpoint`, frontend via `frontend-screen`.

## Breaking changes
These are breaking: renaming or removing a field, making a field required, changing a type, or removing an enum value. Avoid them during the hackathon. If one is unavoidable, say so in the PR title (`api!: ...`) and update both sides in the same hour.
