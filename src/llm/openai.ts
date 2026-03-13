import type { LlmProvider, LlmConfig } from '../types.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponse {
  choices: Array<{ message: { content: string } }>;
  usage?: { total_tokens: number };
}

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  zhipu: 'glm-4',
};

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
};

/**
 * Create an OpenAI-compatible LLM provider.
 * Works with OpenAI, Zhipu (GLM), and any OpenAI-compatible API.
 */
export function createOpenAIProvider(config: LlmConfig): LlmProvider {
  const provider = config.provider === 'zhipu' ? 'zhipu' : 'openai';
  const baseUrl = config.baseUrl || DEFAULT_BASE_URLS[provider];
  const model = config.model || DEFAULT_MODELS[provider];
  const maxTokens = config.maxTokens || 2048;
  const temperature = config.temperature ?? 0.3;

  if (!config.apiKey) {
    throw new Error(
      `API key is required for ${provider}. Set it in config or via OPENCROC_LLM_API_KEY env variable.`,
    );
  }

  return {
    name: provider,

    async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
      const url = `${baseUrl}/chat/completions`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown error');
        throw new Error(`LLM API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as OpenAIResponse;
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('LLM returned empty response');
      }
      return content;
    },

    estimateTokens(text: string): number {
      // Rough estimate: ~4 chars per token for English, ~2 for CJK
      const cjkChars = (text.match(/[\u4e00-\u9fff\u3000-\u303f]/g) || []).length;
      const otherChars = text.length - cjkChars;
      return Math.ceil(otherChars / 4 + cjkChars / 2);
    },
  };
}
