import { describe, it, expect, vi } from 'vitest';
import { createOpenAIProvider } from './openai.js';
import { createOllamaProvider } from './ollama.js';
import { createLlmProvider, createTokenTracker, SYSTEM_PROMPTS } from './index.js';
import { analyzeFailureWithLLM } from '../self-healing/index.js';
import type { LlmProvider } from '../types.js';

// ===== OpenAI Provider =====
describe('createOpenAIProvider', () => {
  it('creates provider with name "openai"', () => {
    const provider = createOpenAIProvider({ provider: 'openai', apiKey: 'test-key' });
    expect(provider.name).toBe('openai');
  });

  it('creates provider with name "zhipu" for zhipu config', () => {
    const provider = createOpenAIProvider({ provider: 'zhipu', apiKey: 'test-key' });
    expect(provider.name).toBe('zhipu');
  });

  it('throws without apiKey', () => {
    expect(() => createOpenAIProvider({ provider: 'openai' })).toThrow('API key is required');
  });

  it('estimates tokens for English text', () => {
    const provider = createOpenAIProvider({ provider: 'openai', apiKey: 'k' });
    const tokens = provider.estimateTokens('Hello world, this is a test.');
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(20);
  });

  it('estimates tokens for CJK text', () => {
    const provider = createOpenAIProvider({ provider: 'openai', apiKey: 'k' });
    const tokens = provider.estimateTokens('你好世界测试');
    expect(tokens).toBeGreaterThan(0);
  });

  it('calls fetch with correct URL and headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'test response' } }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = createOpenAIProvider({ provider: 'openai', apiKey: 'sk-test' });
    const result = await provider.chat([{ role: 'user', content: 'hello' }]);

    expect(result).toBe('test response');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer sk-test',
        }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('rate limited'),
    }));

    const provider = createOpenAIProvider({ provider: 'openai', apiKey: 'sk-test' });
    await expect(provider.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('LLM API error (429)');

    vi.unstubAllGlobals();
  });
});

// ===== Ollama Provider =====
describe('createOllamaProvider', () => {
  it('creates provider with name "ollama"', () => {
    const provider = createOllamaProvider({ provider: 'ollama' });
    expect(provider.name).toBe('ollama');
  });

  it('calls Ollama API with correct endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: { content: 'ollama response' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = createOllamaProvider({ provider: 'ollama', model: 'mistral' });
    const result = await provider.chat([{ role: 'user', content: 'hello' }]);

    expect(result).toBe('ollama response');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({ method: 'POST' }),
    );

    vi.unstubAllGlobals();
  });
});

// ===== LLM Factory =====
describe('createLlmProvider', () => {
  it('creates openai provider', () => {
    const provider = createLlmProvider({ provider: 'openai', apiKey: 'k' });
    expect(provider.name).toBe('openai');
  });

  it('creates zhipu provider', () => {
    const provider = createLlmProvider({ provider: 'zhipu', apiKey: 'k' });
    expect(provider.name).toBe('zhipu');
  });

  it('creates ollama provider', () => {
    const provider = createLlmProvider({ provider: 'ollama' });
    expect(provider.name).toBe('ollama');
  });

  it('resolves apiKey from env variable', () => {
    const original = process.env.OPENCROC_LLM_API_KEY;
    process.env.OPENCROC_LLM_API_KEY = 'env-key';
    try {
      const provider = createLlmProvider({ provider: 'openai' });
      expect(provider.name).toBe('openai');
    } finally {
      if (original === undefined) delete process.env.OPENCROC_LLM_API_KEY;
      else process.env.OPENCROC_LLM_API_KEY = original;
    }
  });

  it('throws for unknown provider', () => {
    expect(() => createLlmProvider({ provider: 'unknown' as 'openai' })).toThrow('Unknown LLM provider');
  });
});

// ===== Token Tracker =====
describe('createTokenTracker', () => {
  it('tracks token estimates', () => {
    const mockProvider: LlmProvider = {
      name: 'test',
      chat: async () => '',
      estimateTokens: (text) => text.length,
    };
    const tracker = createTokenTracker(mockProvider);

    tracker.track('hello');
    expect(tracker.total).toBe(5);

    tracker.track('world');
    expect(tracker.total).toBe(10);
  });

  it('tracks chat messages and response', () => {
    const mockProvider: LlmProvider = {
      name: 'test',
      chat: async () => '',
      estimateTokens: (text) => text.length,
    };
    const tracker = createTokenTracker(mockProvider);

    tracker.trackChat(
      [{ role: 'user', content: 'hi' }],
      'hello there',
    );
    // "hi" (2) + "hello there" (11) = 13
    expect(tracker.total).toBe(13);
  });

  it('resets total', () => {
    const mockProvider: LlmProvider = {
      name: 'test',
      chat: async () => '',
      estimateTokens: (text) => text.length,
    };
    const tracker = createTokenTracker(mockProvider);
    tracker.track('test');
    tracker.reset();
    expect(tracker.total).toBe(0);
  });
});

// ===== System Prompts =====
describe('SYSTEM_PROMPTS', () => {
  it('has failureAnalysis prompt', () => {
    expect(SYSTEM_PROMPTS.failureAnalysis).toContain('root cause');
  });

  it('has chainPlanning prompt', () => {
    expect(SYSTEM_PROMPTS.chainPlanning).toContain('API');
  });
});

// ===== LLM-enhanced failure analysis =====
describe('analyzeFailureWithLLM', () => {
  it('falls back to heuristic when no LLM provided', async () => {
    const result = await analyzeFailureWithLLM('500 Internal Server Error');
    expect(result.category).toBe('backend-5xx');
    expect(result.confidence).toBe(0.9);
    expect(result.suggestedFix).toBe('');
  });

  it('uses LLM when available', async () => {
    const mockLlm: LlmProvider = {
      name: 'test',
      chat: vi.fn().mockResolvedValue(JSON.stringify({
        rootCause: 'Database connection pool exhausted',
        category: 'backend-5xx',
        suggestedFix: 'Increase connection pool size',
        confidence: 0.95,
      })),
      estimateTokens: () => 10,
    };

    const result = await analyzeFailureWithLLM('500 error on /api/users', mockLlm);
    expect(result.rootCause).toBe('Database connection pool exhausted');
    expect(result.suggestedFix).toBe('Increase connection pool size');
    expect(result.confidence).toBe(0.95);
  });

  it('falls back to heuristic when LLM fails', async () => {
    const mockLlm: LlmProvider = {
      name: 'test',
      chat: vi.fn().mockRejectedValue(new Error('network error')),
      estimateTokens: () => 10,
    };

    const result = await analyzeFailureWithLLM('ECONNREFUSED', mockLlm);
    expect(result.category).toBe('network');
    expect(result.confidence).toBe(0.9);
  });
});
