/**
 * Small models often wrap JSON in ```json fences, add a sentence before or after it,
 * or leave a trailing comma. Ollama's `format=<schema>` prevented that; in the browser we
 * have no constrained decoding, so we repair the text before validating it.
 */
export function repairJson(text: string): unknown {
  let s = text.trim();

  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) s = fence[1].trim();

  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end <= start) throw new SyntaxError('No JSON object found in model output');
  s = s.slice(start, end + 1);

  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, '$1');

  return JSON.parse(s);
}
