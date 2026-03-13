import type { LlmProvider, LlmConfig } from '../types.js';
import { createOpenAIProvider } from './openai.js';
import { createOllamaProvider } from './ollama.js';

export { createOpenAIProvider } from './openai.js';
export { createOllamaProvider } from './ollama.js';

/**
 * Create an LLM provider from config.
 * Resolves apiKey from config or OPENCROC_LLM_API_KEY env variable.
 */
export function createLlmProvider(config: LlmConfig): LlmProvider {
  const resolved: LlmConfig = {
    ...config,
    apiKey: config.apiKey || process.env.OPENCROC_LLM_API_KEY,
  };

  switch (config.provider) {
    case 'openai':
    case 'zhipu':
      return createOpenAIProvider(resolved);
    case 'ollama':
      return createOllamaProvider(resolved);
    default:
      throw new Error(
        `Unknown LLM provider: "${config.provider}". Available: openai, zhipu, ollama`,
      );
  }
}

/**
 * Token usage tracker — accumulates tokens across multiple LLM calls.
 */
export interface TokenTracker {
  track(text: string): void;
  trackChat(messages: Array<{ role: string; content: string }>, response: string): void;
  total: number;
  reset(): void;
}

export function createTokenTracker(provider: LlmProvider): TokenTracker {
  let total = 0;

  return {
    track(text: string) {
      total += provider.estimateTokens(text);
    },

    trackChat(messages: Array<{ role: string; content: string }>, response: string) {
      for (const msg of messages) {
        total += provider.estimateTokens(msg.content);
      }
      total += provider.estimateTokens(response);
    },

    get total() {
      return total;
    },

    reset() {
      total = 0;
    },
  };
}

/**
 * System prompts for different LLM use cases in OpenCroc.
 */
export const SYSTEM_PROMPTS = {
  failureAnalysis: `You are an expert test failure analyst for an E2E testing framework.
Given a test failure error message and its context, analyze the root cause and suggest a fix.
Respond in JSON format: { "rootCause": string, "category": string, "suggestedFix": string, "confidence": number }
Categories: backend-5xx, timeout, endpoint-not-found, data-constraint, network, frontend-render, test-script, unknown.`,

  chainPlanning: `You are an API test chain planner.
Given a list of API endpoints and their dependencies, generate an optimal test execution order.
Consider data dependencies, authentication requirements, and cleanup steps.
Respond in JSON format: { "chains": [{ "name": string, "steps": [{ "endpoint": string, "method": string, "description": string }] }] }`,
} as const;
