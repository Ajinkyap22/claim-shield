import OpenAI from "openai";
import type { LLMCallUsage } from "@compliance-shield/shared";
import { config } from "./config.js";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: config.openrouterApiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://compliance-shield.dev",
        "X-Title": "Compliance Shield",
      },
    });
  }
  return client;
}

export interface LLMCompletionOptions {
  systemPrompt: string;
  userMessage: string;
  responseFormat?: OpenAI.ChatCompletionCreateParams["response_format"];
  temperature?: number;
}

export interface LLMCompletionResult {
  content: string;
  usage: LLMCallUsage | null;
}

/**
 * Calls an LLM via OpenRouter using the OpenAI-compatible API.
 */
export async function completeChat(opts: LLMCompletionOptions): Promise<LLMCompletionResult> {
  const openai = getClient();

  const response = await openai.chat.completions.create({
    model: config.openrouterModel,
    temperature: opts.temperature ?? 0,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userMessage },
    ],
    ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from OpenRouter LLM");
  }

  const usage: LLMCallUsage | null = response.usage
    ? {
        model: response.model ?? config.openrouterModel,
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens,
      }
    : null;

  return { content: stripCodeFences(content), usage };
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fencePattern = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const match = trimmed.match(fencePattern);
  return match ? match[1].trim() : trimmed;
}
