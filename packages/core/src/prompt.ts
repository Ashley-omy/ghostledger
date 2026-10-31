/**
 * The one extraction prompt shared by every provider (skill: llm-extraction).
 * Change it only together with a before/after eval table.
 */
import { CATEGORIES } from './schemas';

export const EXTRACTION_PROMPT = `You read a photo of a shopping receipt and return ONLY a JSON object, with no other text.

JSON shape:
{
  "store": string,
  "date": "YYYY-MM-DD" or null,
  "currency": ISO 4217 code such as "HUF", "JPY", "EUR",
  "payment_method": "cash" | "card" | "mobile" | "other" | null,
  "items": [
    {
      "name": item name exactly as printed,
      "name_en": English translation of the item name,
      "qty": number or null,
      "unit_price": number or null,
      "price": line total as a number,
      "category": one of ${CATEGORIES.map((c) => `"${c}"`).join(', ')}
    }
  ],
  "tax_amount": tax AMOUNT (not the rate) as a number, or null,
  "total": receipt total as a number
}

Rules:
- Numbers are plain JSON numbers without currency symbols or thousands separators.
- "price" is the amount on the item's line, after any line discount.
- Numbers inside an item name (for example "2,8%" or "1l") are not the quantity.
- If a value is unreadable, use null. Do not guess.`;

export function retryPrompt(validationError: string): string {
  return `${EXTRACTION_PROMPT}

Your previous answer was invalid: ${validationError}
Return a corrected JSON object only.`;
}

export function insightPrompt(language: string): string {
  return `You are a careful personal-finance assistant. You receive a JSON summary of one month of household spending.
Write a short report in ${language} using Markdown: a 2–3 sentence overview, then up to 3 observations
(overspending, unusual categories, trends) and up to 3 concrete saving suggestions.
Only use numbers that appear in the data. Do not invent transactions.`;
}
