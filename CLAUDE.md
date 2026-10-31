# GhostLedger — team guide for Claude Code

Gemma 4 expense tracker: receipt image → structured ledger. Two modes: **offline** (Ollama, `gemma4:e2b`) and **online** (Gemini API, `gemma-4-26b-a4b-it` / `gemma-4-31b-it`). See `README.md` for the product and `docs/API.md` for the API.

## Layout and ownership
| Path | Owner | Notes |
|---|---|---|
| `docs/openapi.yaml` | C (API) | **The only contract** between frontend and backend |
| `backend/app/providers.py`, `extractor.py` | A (AI) | Prompts, model calls, validation, post-processing |
| `backend/app/main.py`, `schemas.py`, `ledger.py`, `insights.py` | C (API/Data) | Routes, Pydantic models, SQLite, aggregation |
| `frontend/` | B (Frontend) | Streamlit; talks to the backend **only** through `frontend/api_client.py` |
| `compose.yaml`, `*/Dockerfile` | C (Infra) | |

## Rules
- The frontend never imports backend code; the backend never assumes a specific frontend.
- Change `docs/openapi.yaml` first, in its own PR, then the code (skill: `api-contract`).
- Never commit `.env`, API keys, `data/`, or real receipts with personal info (card numbers, names).
- All money sums use `items[].price`. Currency is ISO 4217. `tax_amount` is an amount, never a rate.
- Errors always use `{"error": {"code", "message"}}`, with the codes listed in the spec.
- Keep PRs small and merge often. Branches: `feat/<area>-<topic>`, `fix/<area>-<topic>`.

## Skills in this repo
| Skill | Use it when |
|---|---|
| `dev-setup` | Starting or running the stack (mock, backend, frontend, Ollama) |
| `api-contract` | Adding or changing anything in the API |
| `backend-endpoint` | Implementing an endpoint from the spec |
| `llm-extraction` | Working on prompts, providers or extraction accuracy |
| `frontend-screen` | Building Streamlit screens against the API |
| `team-git` | Branching, committing, opening and reviewing PRs |
| `demo-ready` | Pre-demo and pre-submission checks |
