---
name: frontend-screen
description: Build or change GhostLedger's Streamlit frontend — scan/upload screen, editable receipt table with warning highlights, ledger list, dashboard, mode toggle, insights with payload preview — using only the REST API. Use when asked to build a screen, show some data, handle an API error in the UI, or work on the frontend without a running backend.
---

# Frontend screen

Code lives in `frontend/`. The frontend knows the backend **only** through `docs/openapi.yaml` and `frontend/api_client.py`.

## Rules
- **All HTTP goes through `api_client.py`**, with one function per `operationId` (`get_health()`, `extract_receipt(image, mode)`, `create_receipt(data)`, ...). Screens never call `requests` directly.
- The base URL comes from `API_BASE_URL`:
  - mock: `http://localhost:4010`
  - real backend: `http://localhost:8000/api/v1`
- Timeouts: 120 s for `extract_receipt` and `create_insights`, 10 s for everything else.
- Errors: `api_client` raises `ApiError(status, code, message)` from the `{"error": {...}}` body. Screens show `message` with `st.error`, and never a raw traceback.
- If `/health` says `password_required`, ask for the password once, keep it in `st.session_state`, and send `Authorization: Bearer <password>`.

## Steps
1. Read the operations you need in `docs/openapi.yaml`, including their examples and error responses.
2. Start the mock: `npx @stoplight/prism-cli mock docs/openapi.yaml -p 4010` (skill `dev-setup`).
3. Add any missing functions to `api_client.py`.
4. Build the screen and test every state on the mock:
   ```bash
   curl -H "Prefer: example=totalMismatch" ...     # warnings path
   curl -H "Prefer: code=422" ...                   # error path
   ```
   To force these from the UI, add an optional `extra_headers` argument to `api_client` that is only used in development.
5. If you need data the API doesn't provide, **don't fake it in the frontend**. Use `api-contract` to change the spec.

## Screen behaviour
- **Mode toggle:**
  - Call `/health` on load.
  - Disable a mode whose `available` is false, and show its `reason` as help text.
  - Default to `default_mode`.
- **Scan:**
  - Use `st.camera_input` and `st.file_uploader` (jpg, png, webp).
  - Show a spinner with "Reading receipt with Gemma 4 (offline can take ~20 s)…".
  - After the result, show `meta.mode_used`, `meta.model` and `meta.elapsed_ms`.
  - If `meta.fallback` is true, show `st.warning` saying the other mode was used.
- **Review:**
  - Show the items in `st.data_editor`.
  - Highlight each `validation.warnings[]` entry using `item_index` + `field` (receipt-level when `item_index` is null).
  - Recompute the items sum live as the user edits.
  - Save calls `create_receipt` with `source_mode = meta.mode_used`.
- **Ledger:**
  - Call `list_receipts` with date filters.
  - The "Download CSV" button uses `export.csv` with `st.download_button`.
- **Dashboard:** `get_summary(month)` → a chart by category, and totals per currency. Never add amounts in different currencies together.
- **Insights:**
  1. Choose the privacy level (default `aggregates`).
  2. `preview_insights` → show `destination` and the exact `payload` in `st.json`.
  3. Only after the user clicks "Send" → `create_insights` with `payload_hash`.
  4. On `409 PREVIEW_MISMATCH`, re-run the preview automatically and ask again.
