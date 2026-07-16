/**
 * Shared JSON extraction helper for model output.
 *
 * With web search enabled the model frequently wraps the JSON in conversational
 * prose and/or a ```json fence (e.g. "Con los datos recopilados, genero ahora
 * el brief...") despite the prompt asking for JSON only. Naively stripping the
 * fences leaves the prose and breaks JSON.parse. This helper prefers a fenced
 * block if present, then bounds to the outermost { ... }.
 *
 * This is the single copy: `sample-request`, `generate-content` and
 * `generate-linkedin` all import it. Any new JSON-returning path that enables web
 * search must parse through this helper, never raw JSON.parse.
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
