---
name: llm-extraction
description: Work on GhostLedger's Gemma 4 receipt extraction and insights — prompts, OllamaProvider (gemma4:e2b), GeminiProvider (gemma-4-26b-a4b-it / gemma-4-31b-it), JSON validation, retry, post-processing and accuracy evaluation. Use when extraction is wrong or slow, when adding a field the model must read, when changing prompts or models, or when measuring accuracy.
---

# LLM extraction and insights

Code: `backend/app/providers.py` (model calls) and `backend/app/extractor.py` (prompt, validation, post-processing).

## Design (keep it this way)
- `LLMProvider` has two methods, `extract(image: bytes) -> ReceiptInput` and `analyze(payload: dict) -> InsightResult`. Routes never call a model SDK directly.
- **Both modes use the same prompt and the same JSON schema.** Only the provider differs.
- **Never trust the model for arithmetic.** Post-processing in code:
  1. `items_sum = sum(item.price)`. Line prices win over `qty × unit_price`.
  2. Map currency symbols to ISO codes (`Ft`→`HUF`, `¥`/`円`→`JPY`, `€`→`EUR`). Unknown → `UNKNOWN_CURRENCY` warning.
  3. If `0 < tax_amount < 1`, it's a rate: convert it with `total * rate / (1 + rate)` and add `TAX_LOOKS_LIKE_RATE`.
  4. A missing `qty` becomes `1`, and an unreadable `unit_price` becomes `null`.
  5. Build `validation.warnings`: `TOTAL_MISMATCH` (|difference| ≥ 1), `ZERO_PRICE`, `QTY_PRICE_MISMATCH`, `MISSING_DATE`, `FUTURE_DATE`.
- If Pydantic validation fails, retry **once** with the error appended to the prompt. If it fails again, return `422 EXTRACTION_FAILED`.
- If the requested mode is unavailable but the other one is, use it and set `meta.fallback = true`.

## Offline: Ollama (`gemma4:e2b`)
```python
client = ollama.Client(host=os.environ["OLLAMA_HOST"])
resp = client.chat(
    model=os.getenv("LOCAL_MODEL", "gemma4:e2b"),
    messages=[{"role": "user", "content": PROMPT, "images": [image_bytes]}],
    format=ReceiptInput.model_json_schema(),
    options={"temperature": 0},
    think=False,   # ~3x faster (52 s → 19 s on a Ryzen 5 7530U) with no accuracy loss in our test
)
draft = ReceiptInput.model_validate_json(resp.message.content)
```
- Put the image **before** the text in the message.
- Measured E2B weaknesses: confuses `qty` with numbers in the item name (e.g. `2,8%`, `1l`), mistranslates some item names, returns `Ft` instead of `HUF`, returns the tax rate instead of the amount, and varies between runs even at temperature 0. Post-processing and the edit screen cover these, so don't try to fix them with prompt tricks alone.

## Online: Gemini API
```python
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
resp = client.models.generate_content(
    model=os.getenv("EXTRACT_MODEL", "gemma-4-26b-a4b-it"),
    contents=[types.Part.from_bytes(data=image_bytes, mime_type=mime), PROMPT],
    config=types.GenerateContentConfig(response_mime_type="application/json"),
)
```
- First try `response_schema=ReceiptInput`. If the API rejects it for Gemma, fall back to parsing JSON out of the text and validating it.
- Insights use `INSIGHT_MODEL` (`gemma-4-31b-it`) with `thinking_config=types.ThinkingConfig(thinking_level="high")`.
- **Privacy:** `analyze()` receives only the payload built by `insights.py`, which is the same one the user saw in the preview. Never send images or extra fields from inside the provider.

## Prompt rules
- Ask for: ISO date, ISO currency, item names **as printed** in `name` and English in `name_en`, the line total in `price`, and one category from the enum.
- Say "If a value is unreadable, use null. Do not guess."
- Keep the prompt in one constant in `extractor.py` so both providers share it.

## Measuring accuracy (do this before and after every prompt or model change)
- `samples/` holds receipt images and ground truth with the same name: `spar_01.jpg` + `spar_01.json` in `ReceiptInput` shape. Remove personal info before committing anything.
- Run `python -X utf8 backend/scripts/eval_extract.py --mode offline` (create the script if it's missing). It should report, per sample:
  - total correct (yes/no)
  - item count correct (yes/no)
  - price-level item match %
  - currency/date correct (yes/no)
  - elapsed seconds
- Paste the before/after table into the PR description.
