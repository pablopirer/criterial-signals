/**
 * Shared JSON extraction helper for model output.
 *
 * With web search enabled the model frequently wraps the JSON in conversational
 * prose and/or a ```json fence (e.g. "Con los datos recopilados, genero ahora
 * el brief...") despite the prompt asking for JSON only. Naively stripping the
 * fences leaves the prose and breaks JSON.parse. This helper prefers a fenced
 * block if present, then bounds to the outermost { ... }.
 *
 * Note: `generate-content` and `sample-request` still carry their own local
 * copies of this function — they were left untouched on purpose so this
 * extraction is only introduced where it's newly needed (generate-linkedin).
 */
export function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new SyntaxError("No JSON object found in model output");
  }
  return body.slice(start, end + 1);
}
