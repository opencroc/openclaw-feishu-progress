import type { SelfHealingConfig, SelfHealingResult, FixOutcome, LlmProvider } from '../types.js';
import { SYSTEM_PROMPTS } from '../llm/index.js';

export type { SelfHealingResult, FixOutcome };

export interface SelfHealingLoop {
  run(testResultsDir: string): Promise<SelfHealingResult>;
}

export interface SelfHealingOptions {
  config: SelfHealingConfig;
  llm?: LlmProvider;
}

/**
 * Categorize a test failure by heuristic rules.
 */
export function categorizeFailure(errorMessage: string): {
  category: string;
  confidence: number;
} {
  const msg = errorMessage.toLowerCase();

  if (/5\d{2}|internal server error/.test(msg))
    return { category: 'backend-5xx', confidence: 0.9 };
  if (/timeout|timed?\s*out/.test(msg))
    return { category: 'timeout', confidence: 0.8 };
  if (/404|not found/.test(msg))
    return { category: 'endpoint-not-found', confidence: 0.85 };
  if (/4[0-2]\d|validation|constraint/.test(msg))
    return { category: 'data-constraint', confidence: 0.75 };
  if (/econnrefused|enotfound|network/.test(msg))
    return { category: 'network', confidence: 0.9 };
  if (/selector|locator|element/.test(msg))
    return { category: 'frontend-render', confidence: 0.7 };
  if (/storage\s*state|auth|login/.test(msg))
    return { category: 'test-script', confidence: 0.8 };

  return { category: 'unknown', confidence: 0.5 };
}

/**
 * LLM-enhanced failure analysis with heuristic fallback.
 */
export async function analyzeFailureWithLLM(
  errorMessage: string,
  llm?: LlmProvider,
): Promise<{ rootCause: string; category: string; suggestedFix: string; confidence: number }> {
  // Always get heuristic result as fallback
  const heuristic = categorizeFailure(errorMessage);

  if (!llm) {
    return {
      rootCause: errorMessage,
      category: heuristic.category,
      suggestedFix: '',
      confidence: heuristic.confidence,
    };
  }

  try {
    const response = await llm.chat([
      { role: 'system', content: SYSTEM_PROMPTS.failureAnalysis },
      { role: 'user', content: `Analyze this test failure:\n\n${errorMessage}` },
    ]);

    const parsed = JSON.parse(response) as {
      rootCause?: string;
      category?: string;
      suggestedFix?: string;
      confidence?: number;
    };

    return {
      rootCause: parsed.rootCause || errorMessage,
      category: parsed.category || heuristic.category,
      suggestedFix: parsed.suggestedFix || '',
      confidence: parsed.confidence || heuristic.confidence,
    };
  } catch {
    // LLM failed — fall back to heuristic
    return {
      rootCause: errorMessage,
      category: heuristic.category,
      suggestedFix: '',
      confidence: heuristic.confidence,
    };
  }
}

/**
 * Attempt a config-only fix: validate and write corrected config JSON.
 */
async function attemptConfigFix(
  _testResultsDir: string,
  _mode: SelfHealingConfig['mode'],
  _llm?: LlmProvider,
): Promise<FixOutcome> {
  // TODO: Load module config → run autoFix validation → write corrected JSON
  // For now, return a no-op outcome
  return {
    success: false,
    scope: 'config-only',
    fixedItems: [],
    rolledBack: false,
  };
}

/**
 * Create a self-healing loop. Accepts an optional LLM provider for AI-enhanced analysis.
 */
export function createSelfHealingLoop(config: SelfHealingConfig, llm?: LlmProvider): SelfHealingLoop {
  return {
    async run(testResultsDir: string): Promise<SelfHealingResult> {
      const maxIterations = config.maxIterations || 3;
      const mode = config.mode || 'config-only';
      const fixed: string[] = [];
      const remaining: string[] = [];
      let iterations = 0;
      let totalTokensUsed = 0;

      for (let i = 0; i < maxIterations; i++) {
        iterations = i + 1;

        const outcome = await attemptConfigFix(testResultsDir, mode, llm);
        if (outcome.success) {
          fixed.push(...outcome.fixedItems);
        } else {
          remaining.push(`iteration-${i + 1}: no fix applied`);
        }

        // Track token usage if LLM is available
        if (llm) {
          totalTokensUsed += llm.estimateTokens(`iteration-${i + 1}`);
        }

        // If all fixed, stop early
        if (outcome.success && outcome.fixedItems.length > 0) break;
      }

      return {
        iterations,
        fixed,
        remaining,
        totalTokensUsed,
      };
    },
  };
}
