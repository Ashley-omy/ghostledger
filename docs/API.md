# GhostLedger API Guide

The single source of truth is **[`openapi.yaml`](openapi.yaml)** (OpenAPI 3.1). This page explains the main flows and how frontend and backend can work in parallel.

- **Backend:** FastAPI at `http://localhost:8000/api/v1`. Interactive docs at `http://localhost:8000/docs`.
- **Frontend:** any HTTP client (the Streamlit app in `frontend/`). It talks to the backend only through this API and never imports backend code.

---

## Working in parallel

### Frontend: develop against a mock server
```bash
npx @stoplight/prism-cli mock docs/openapi.yaml -p 4010
```
- Base URL: `http://localhost:4010` (Prism serves the paths **without** the `/api/v1` prefix).
- Returns the examples written in the spec. Pick a specific example or status code with the `Prefer` header:
  ```bash
  curl -H "Prefer: example=totalMismatch" -F image=@receipt.jpg localhost:4010/receipts/extract
  curl -H "Prefer: code=404" localhost:4010/receipts/42
  ```
- Invalid requests return `400`, so the mock also checks your request bodies.
- Make the base URL configurable: `API_BASE_URL=http://localhost:4010` for the mock, `http://localhost:8000/api/v1` for the real backend.

### Backend: implement to the spec
- Pydantic models should match `components/schemas` field-for-field.
- Compare FastAPI's generated spec (`/openapi.json`) with `docs/openapi.yaml` before merging.
- Lint the spec after every change:
  ```bash
  npx @redocly/cli lint docs/openapi.yaml
  ```

### Changing the contract
1. Edit `docs/openapi.yaml` first, in its own PR.
2. Tell the other side.
3. Then update the code.

Add new fields as optional so that old clients keep working.

---

## Endpoints at a glance

| Method | Path | Purpose | Calls a model? |
|---|---|---|---|
| GET | `/health` | Status, available modes, whether a password is needed | No |
| POST | `/receipts/extract` | Image → draft receipt + validation (**not saved**) | Yes |
| GET | `/receipts` | List saved receipts (`from`, `to`, `category`, `limit`, `offset`) | No |
| POST | `/receipts` | Save a reviewed receipt | No |
| GET / PUT / DELETE | `/receipts/{id}` | Read / replace / delete one receipt | No |
| GET | `/export.csv` | CSV download (one row per item) | No |
| GET | `/summary?month=YYYY-MM` | Monthly aggregates for the dashboard | No |
| POST | `/insights/preview` | Exactly what would be sent to the model | No |
| POST | `/insights` | Generate monthly insights | Yes |

---

## Main flows

### 1. Startup
```
GET /health
  → enable/disable the Online and Offline toggles using modes.*.available
  → show the reason when a mode is unavailable (e.g. "GEMINI_API_KEY is not set")
  → if password_required, ask for the password and send it as "Authorization: Bearer <password>"
```

### 2. Scan → review → save
```
POST /receipts/extract   (multipart: image, mode)
  → show draft in an editable table
  → highlight validation.warnings (use item_index + field to find the cell)
  → show meta.mode_used / meta.elapsed_ms; if meta.fallback, tell the user the other mode was used
POST /receipts           (body: edited draft + source_mode = meta.mode_used)
  → 201 + saved Receipt
```
- Extraction takes about 20 s offline on CPU, so **use a client timeout of at least 120 s** and show a spinner.
- The draft is not stored anywhere. If the user leaves the page, it is lost.
- The frontend may recompute `validation` while the user edits, but the backend validates again on save.

### 3. Insights (with privacy preview)
```
POST /insights/preview   { month, mode, privacy }
  → show `destination` and the exact `payload` to the user
POST /insights           { month, mode, privacy, payload_hash }
  → render `text` (Markdown) and `highlights`
```
- In Online mode, `payload_hash` is **required** and must come from the preview. If the data changed in between, the backend returns `409 PREVIEW_MISMATCH`, and you should preview again.
- `privacy=aggregates` sends only what `GET /summary` returns; `privacy=full` also sends the items, but never images.

---

## Data rules

| Rule | Detail |
|---|---|
| Amounts | Decimal numbers in the receipt's currency (`3960` HUF, `12.5` EUR) |
| Sums | Always computed from `items[].price` (the line total). `qty` and `unit_price` are informational |
| Currency | ISO 4217 (`HUF`). The backend normalizes symbols like `Ft` or `¥` |
| Tax | `tax_amount` is an amount, never a rate. The backend converts rates and adds a `TAX_LOOKS_LIKE_RATE` warning |
| Dates | `YYYY-MM-DD`; timestamps in UTC ISO 8601 |
| Categories | `groceries`, `dining`, `transport`, `household`, `health`, `entertainment`, `other` |

## Errors

Every error has the same shape:

```json
{ "error": { "code": "EXTRACTION_FAILED", "message": "Could not read a receipt from this image. Try a sharper photo." } }
```

`message` is safe to show in the UI as-is.

| HTTP | `code` | When |
|---|---|---|
| 400 | `BAD_REQUEST`, `INVALID_IMAGE` | Invalid body or query, or the file is not an image |
| 401 | `UNAUTHORIZED` | Password missing or wrong |
| 404 | `NOT_FOUND` | Unknown receipt id |
| 409 | `PREVIEW_MISMATCH` | Data changed since the insights preview |
| 413 | `PAYLOAD_TOO_LARGE` | Image larger than 10 MB |
| 422 | `EXTRACTION_FAILED` | Not a receipt, or the model output failed validation twice |
| 503 | `MODE_UNAVAILABLE` | Neither mode can be used |
| 500 | `INTERNAL` | Bug (check the backend logs) |

## CORS
The backend allows the origins in `CORS_ORIGINS` (default `http://localhost:8501`). Streamlit calls the API server-side, so CORS only matters if you later build a browser-only (JavaScript) frontend.
