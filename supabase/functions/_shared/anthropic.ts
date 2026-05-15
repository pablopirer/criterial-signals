/**
 * Thin wrapper around the Anthropic Messages API.
 *
 * We deliberately avoid pulling in the official @anthropic-ai/sdk because:
 *   - Edge Functions run on Deno and the SDK's Node-specific imports break
 *     under Deno's ESM resolver in some versions.
 *   - The surface area we need is one POST request to /v1/messages.
 *
 * If the API surface we use grows (tool use, streaming, vision), we should
 * revisit and switch to the SDK. For Day 2, this fetch wrapper is enough.
 *
 * Docs: https://docs.claude.com/en/api/messages
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * The default model. Pinned to a snapshot so behavior does not silently
 * drift if Anthropic moves the `claude-haiku-4-5` alias forward. Override
 * via the ANTHROPIC_MODEL env var when you want to test a newer model.
 */
const DEFAULT_MODEL = "claude-sonnet-4-6";

export interface GenerateBriefInput {
  /** The lead's stated interest_type, used to fill {{interest_type}} in the prompt. */
  interestType: string;
  /** The fully-loaded prompt, with system and user sections separated. */
  prompt: {
    system: string;
    user: string;
  };
  /** Optional model override. Defaults to DEFAULT_MODEL. */
  model?: string;
}

export interface GenerateBriefOutput {
  /** The generated brief as plain text. */
  text: string;
  /** The model that actually produced the response. */
  model: string;
  /** Token usage, useful for cost monitoring. */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Call the Anthropic Messages API to generate a sample brief.
 *
 * Reads ANTHROPIC_API_KEY from the environment. Throws an Error with a
 * descriptive message if the key is missing or the API responds with a
 * non-2xx status. Callers must handle these errors explicitly — we do not
 * want silent fallbacks to "empty brief" because that would let bad rows
 * land in `publications` with status=draft and no content.
 *
 * @param input The interest type and pre-loaded prompt.
 * @returns The generated text plus model and usage metadata.
 */
export async function generateBrief(
  input: GenerateBriefInput,
): Promise<GenerateBriefOutput> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set in the function environment");
  }

  const model = input.model ?? Deno.env.get("ANTHROPIC_MODEL") ?? DEFAULT_MODEL;

  const body = {
    model,
    max_tokens: 2048,
    system: input.prompt.system,
    messages: [
      {
        role: "user",
        content: input.prompt.user.replace(
          /\{\{interest_type\}\}/g,
          input.interestType,
        ),
      },
    ],
  };

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Anthropic API returned ${response.status}: ${errorBody.slice(0, 500)}`,
    );
  }

  const json = await response.json() as {
    content: Array<{ type: string; text?: string }>;
    model: string;
    usage: { input_tokens: number; output_tokens: number };
  };

  // The Messages API returns a content array of typed blocks. For a plain
  // text completion we expect one block of type "text". Concatenate any
  // text blocks defensively in case the model returns more than one.
  const text = json.content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n")
    .trim();

  if (text.length === 0) {
    throw new Error(
      "Anthropic API returned a response with no text content blocks",
    );
  }

  return {
    text,
    model: json.model,
    usage: {
      inputTokens: json.usage.input_tokens,
      outputTokens: json.usage.output_tokens,
    },
  };
}
