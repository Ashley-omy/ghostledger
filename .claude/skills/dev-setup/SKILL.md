---
name: dev-setup
description: Start, run or troubleshoot the GhostLedger dev stack — Prism mock server, FastAPI backend, Streamlit frontend, Ollama and Docker Compose. Use when someone asks to "run the app", "start the mock", "set up my environment", "pull the model", or when a service won't start or can't reach another.
---

# Dev setup

## 1. First-time setup
1. `cp .env.example .env`. Add `GEMINI_API_KEY` only if you need online mode. **Never paste the key into chat, code or commits.**
2. Offline model: `ollama pull gemma4:e2b` (~4.6 GB). Check it with `ollama list`.
3. Python 3.12+ virtual env:
   ```bash
   python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r backend/requirements.txt -r frontend/requirements.txt
   ```

## 2. Pick what to run

| You are working on | Run |
|---|---|
| Frontend only | Prism mock + frontend |
| Backend only | Backend (+ Ollama for offline extraction) |
| Integration / demo | `docker compose up -d --build` |

**Mock server** (no backend needed):
```bash
npx @stoplight/prism-cli mock docs/openapi.yaml -p 4010
```
The mock serves paths **without** `/api/v1`, so use `API_BASE_URL=http://localhost:4010`.

**Backend:**
```bash
OLLAMA_HOST=http://localhost:11434 uvicorn app.main:app --app-dir backend --port 8000 --reload
```
Swagger UI: http://localhost:8000/docs

**Frontend:**
```bash
API_BASE_URL=http://localhost:8000/api/v1 streamlit run frontend/main.py
```

**Full stack:**
```bash
docker compose up -d --build
docker compose exec ollama ollama pull gemma4:e2b   # first run only
```
If Ollama is already installed natively, skip its container: `docker compose up -d --build backend frontend`, with `OLLAMA_HOST=http://host.docker.internal:11434` in `.env`.

## 3. Smoke test
```bash
curl -s localhost:8000/api/v1/health
```
Both `modes.online.available` and `modes.offline.available` should be `true`. If one is `false`, `reason` says why.

## 4. Troubleshooting

| Symptom | Fix |
|---|---|
| Offline mode unavailable | `curl localhost:11434/api/version`. Is Ollama running? Is the model pulled? Is `OLLAMA_HOST` right *from where the backend runs* (`ollama:11434` in compose, `localhost:11434` natively)? |
| Online mode unavailable | `GEMINI_API_KEY` is missing in `.env`, or the container was started before you set it (`docker compose up -d --force-recreate backend`) |
| Extraction times out | Offline on CPU takes ~20 s. Make the client timeout ≥120 s and check that `think: false` is set |
| Frontend 404s against the mock | `API_BASE_URL` still includes `/api/v1` |
| Windows: `UnicodeEncodeError: cp932` | Run Python with `-X utf8`, or set `PYTHONUTF8=1` |
| Port already in use | `docker compose down`, or change the published port in `compose.yaml` |
