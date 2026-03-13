import type { LlmProvider, LlmConfig } from '../types.js';

interface OllamaResponse {
  message: { content: string };
}

/**
 * Create an Ollama LLM provider for local model inference.
 */
export function createOllamaProvider(config: LlmConfig): LlmProvider {
  const baseUrl = config.baseUrl || 'http://localhost:11434';
  const model = config.model || 'llama3';

  return {
    name: 'ollama',

    async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
      const url = `${baseUrl}/api/chat`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown error');
        throw new Error(`Ollama API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as OllamaResponse;
      const content = data.message?.content;
      if (!content) {
        throw new Error('Ollama returned empty response');
      }
      return content;
    },

    estimateTokens(text: string): number {
      // Same rough estimate as OpenAI provider
      const cjkChars = (text.match(/[\u4e00-\u9fff\u3000-\u303f]/g) || []).length;
      const otherChars = text.length - cjkChars;
      return Math.ceil(otherChars / 4 + cjkChars / 2);
    },
  };
}
