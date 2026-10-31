---
name: demo-ready
description: Pre-demo and pre-submission checklist for GhostLedger at Hacktoberfest Hack Day Budapest — clean-clone run, both modes working, sample receipts, offline proof, public repo and license, README accuracy, backup video. Use when someone says "are we ready", "prepare the demo", "check before submission", "freeze", or after 16:00 on hack day.
---

# Demo and submission readiness

The live demo is at **17:30** and is required for prizes. No slide-only pitches. Run this checklist from about 16:15 (feature freeze), and report each item as ✅ or ❌, with the fix for each ❌.

## 1. Clean-clone run (what judges and users will do)
```bash
cd "$(mktemp -d)" && git clone https://github.com/Ashley-omy/ghostledger.git && cd ghostledger
cp <your>/.env .env
docker compose up -d --build
curl -s localhost:8000/api/v1/health
```
- [ ] Builds with no errors, and `/health` shows both modes `available: true`.
- [ ] Every command in the README Quick Start works exactly as written. Fix the README, not the commands, if they differ.

## 2. Demo flow (rehearse it twice, with a timer — 2 minutes)
- [ ] **Offline proof:** turn the laptop's Wi-Fi off, then `/health` → offline available.
- [ ] Scan the prepared Hungarian receipt (`samples/`) → draft appears in under 30 s → warnings (if any) are highlighted → save → CSV downloads and opens correctly in Excel (accents intact).
- [ ] Wi-Fi back on → online mode → insights preview shows "aggregates only" → send → insights render.
- [ ] Mode fallback: with the API key removed, online requests fall back to offline with a visible warning.
- [ ] Pick receipts that you **know** extract well, and keep one spare.
- [ ] The Ollama model is warm: run one extraction right before going on stage, so the first one isn't slow.

## 3. Repo and submission
- [ ] The repo is **public**, and `LICENSE` (Apache-2.0) is present.
- [ ] No secrets in the code or the history:
  ```bash
  git log -p | grep -nE 'AIza[0-9A-Za-z_-]{20,}|AQ\.[A-Za-z0-9_-]{20,}'
  ```
  This must print nothing.
- [ ] No personal data in `samples/`.
- [ ] README: the features listed actually exist (move unfinished ones to "Stretch goals"), the limitations are honest, and measured numbers (speed, accuracy) are filled in.
- [ ] `docs/openapi.yaml` matches what the backend really returns.
- [ ] Tag a release: `git tag v0.1.0 && git push --tags && gh release create v0.1.0 --generate-notes`.

## 4. Backups
- [ ] Record a screen capture of the full demo flow and keep it on the laptop, so the demo doesn't depend on Wi-Fi.
- [ ] Have an HDMI / USB-C adapter for the projector, and confirm the projector setup with the organizers early.
- [ ] Have a second laptop that can run the stack (or at least play the video).

## 5. Pitch points (say these out loud)
- Same Gemma 4 family, two places to run it, and the user chooses.
- Offline E2B on a laptop CPU at ~19 s per receipt; online 26B/31B for accuracy and insights.
- Privacy preview: you see exactly what leaves your device.
- Open source, `docker compose up`, and an API spec so anyone can build another frontend.
