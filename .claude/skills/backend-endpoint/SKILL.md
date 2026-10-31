---
name: backend-endpoint
description: Implement or fix a GhostLedger FastAPI endpoint so it matches docs/openapi.yaml — routes, Pydantic models, SQLite access, error responses and auth. Use when asked to "implement /receipts", "add the summary endpoint", "make the backend match the spec", or when the backend returns a shape the frontend doesn't expect.
---

# Backend endpoint

Code lives in `backend/app/`. The spec in `docs/openapi.yaml` wins over any existing code. If the spec itself is wrong, stop and use `api-contract`.

## Steps
1. **Read the operation** in `docs/openapi.yaml`: path, parameters, body, every response code, and the examples.
2. **Models** in `backend/app/schemas.py`:
   - Field names, types, required-ness and enums must match the spec exactly.
   - Use `Literal[...]` or `Enum` for enums, and `X | None` for nullable fields.
   - Reuse existing models (`Item`, `ReceiptInput`, `Receipt`, `Validation`, `ModelMeta`, `Error`). Don't duplicate them.
3. **Route** in `backend/app/main.py`, under the `/api/v1` router:
   - Set `response_model`, `status_code` (201 on create, 204 on delete) and `operation_id` equal to the spec's `operationId`.
   - Keep business logic out of the route. Call `ledger.py`, `insights.py` or `extractor.py`.
4. **Errors:** every error is `{"error": {"code": ..., "message": ...}}`.
   - Raise the app's error type (e.g. `ApiError(status, code, message)`) and let the exception handler format it. Also map FastAPI's `RequestValidationError` to `400 BAD_REQUEST`.
   - `message` must be safe to show in the UI. Never put stack traces or API keys in it.
5. **Auth:** if `APP_PASSWORD` is set, every route except `/health` requires `Authorization: Bearer <APP_PASSWORD>`. Otherwise return `401 UNAUTHORIZED`.
6. **Data rules** (see `docs/API.md`):
   - Sums come from `items[].price`. Store money as `REAL`, but round to 2 decimals in responses.
   - Timestamps are UTC ISO 8601 with a `Z` suffix.
   - Use parameterized SQL only (`?` placeholders). Never build SQL with f-strings.
7. **Verify it against the spec:**
   ```bash
   uvicorn app.main:app --app-dir backend --port 8000 --reload
   curl -s localhost:8000/api/v1/<path> | python -m json.tool
   ```
   - Check the happy path, a 400 (bad input) and a 404 (where relevant).
   - Open http://localhost:8000/docs and compare the generated schema with `docs/openapi.yaml`.
   - Tests use pytest with FastAPI's `TestClient`, and a temporary `DATA_DIR` per test, never the real `data/`.

## Endpoint notes
- **`POST /receipts/extract`**
  - Reject non-images with `400 INVALID_IMAGE`, and files over 10 MB with `413`.
  - It never writes to the DB. Delegate to `extractor.extract(image_bytes, mode)` (skill `llm-extraction`).
- **`GET /export.csv`**
  - One row per item, with columns in the order the spec lists.
  - Encode as UTF-8 with BOM and send `Content-Disposition: attachment`.
- **`POST /insights/preview`**
  - `payload_hash` = SHA-256 of the payload serialized as `json.dumps(payload, sort_keys=True, ensure_ascii=False)`.
- **`POST /insights`**
  - Rebuild the payload and compare its hash. If it differs, return `409 PREVIEW_MISMATCH` (online mode only).
