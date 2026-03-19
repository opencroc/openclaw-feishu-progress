import type { TaskRecord } from './task-store.js';

export type PlanetEdgeType = 'depends-on' | 'related-to' | 'supersedes';

export interface PlanetEdge {
  fromPlanetId: string;
  toPlanetId: string;
  type: PlanetEdgeType;
  confidence: number;
  source: 'auto' | 'manual';
  reason?: string;
}

interface InferenceSignal {
  type: 'text-reference' | 'shared-module' | 'temporal-sequence' | 'data-dependency' | 'keyword-overlap' | 'supersedes';
  confidence: number;
  reason: string;
}

const REFERENCE_PATTERNS = [
  /基于.*(?:上次|之前|刚才|前面)/i,
  /参考.*(?:上次|之前|刚才|前面)/i,
  /(?:上次|之前|前面).*(?:结果|分析|报告|任务)/i,
  /沿用.*(?:上次|之前)/i,
  /继续.*(?:上次|之前|前面)/i,
  /based on.*(?:previous|last|earlier)/i,
  /refer(?:ring)? to.*(?:previous|last|earlier)/i,
  /continue.*(?:previous|last|earlier)/i,
];

const SUPERSEDES_PATTERNS = [
  /替代.*(?:上次|之前|前面)/i,
  /重做.*(?:上次|之前|前面)/i,
  /重写.*(?:上次|之前|前面)/i,
  /replace.*(?:previous|last|earlier)/i,
  /redo.*(?:previous|last|earlier)/i,
  /rewrite.*(?:previous|last|earlier)/i,
];

const DEPENDENCY_PAIRS: Record<string, string[]> = {
  scan: ['pipeline', 'report', 'analysis', 'chat'],
  pipeline: ['report', 'execute', 'test'],
  execute: ['report'],
  analysis: ['pipeline', 'report', 'chat'],
  chat: ['report'],
};

function getTaskText(task: TaskRecord): string {
  return [task.sourceText, task.title, task.summary]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n');
}

function extractPaths(text: string): string[] {
  const matches = text.match(/(?:src|lib|apps?|packages?)\/[\w\-./]+/g) ?? [];
  return [...new Set(matches)];
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    '的', '和', '在', '是', '了', '把', '给', '帮', '我', '你', '他', '她', '它',
    'the', 'a', 'an', 'is', 'to', 'for', 'and', 'with', 'from', 'this', 'that',
  ]);
  const matches = text.toLowerCase().match(/[\u4e00-\u9fff]{2,}|[a-z0-9/_\-.]{2,}/g) ?? [];
  return [...new Set(matches.filter((word) => !stopWords.has(word)))];
}

function collectSignals(earlier: TaskRecord, later: TaskRecord): InferenceSignal[] {
  const signals: InferenceSignal[] = [];
  const laterText = getTaskText(later);
  const earlierText = getTaskText(earlier);

  if (REFERENCE_PATTERNS.some((pattern) => pattern.test(laterText))) {
    signals.push({
      type: 'text-reference',
      confidence: 0.8,
      reason: 'later task text explicitly references a previous task',
    });
  }

  if (SUPERSEDES_PATTERNS.some((pattern) => pattern.test(laterText))) {
    signals.push({
      type: 'supersedes',
      confidence: 0.92,
      reason: 'later task text indicates replacing or redoing a previous task',
    });
  }

  const earlierPaths = extractPaths(earlierText);
  const laterPaths = extractPaths(laterText);
  const sharedPaths = earlierPaths.filter((path) => laterPaths.some((candidate) => path.startsWith(candidate) || candidate.startsWith(path)));
  if (sharedPaths.length > 0) {
    signals.push({
      type: 'shared-module',
      confidence: Math.min(0.52 + sharedPaths.length * 0.1, 0.78),
      reason: `shared paths: ${sharedPaths.slice(0, 3).join(', ')}`,
    });
  }

  const timeDiffMs = Math.abs(later.createdAt - earlier.createdAt);
  if (timeDiffMs < 60 * 60 * 1000 && later.kind === earlier.kind) {
    signals.push({
      type: 'temporal-sequence',
      confidence: 0.56,
      reason: 'same task kind created within 1 hour',
    });
  } else if (timeDiffMs < 24 * 60 * 60 * 1000 && later.kind === earlier.kind) {
    signals.push({
      type: 'temporal-sequence',
      confidence: 0.32,
      reason: 'same task kind created on the same day',
    });
  }

  if (DEPENDENCY_PAIRS[earlier.kind]?.includes(later.kind)) {
    signals.push({
      type: 'data-dependency',
      confidence: 0.68,
      reason: `${earlier.kind} is a common precursor for ${later.kind}`,
    });
  }

  const earlierKeywords = new Set(extractKeywords(earlierText));
  const laterKeywords = new Set(extractKeywords(laterText));
  const overlap = [...earlierKeywords].filter((keyword) => laterKeywords.has(keyword));
  const overlapRatio = overlap.length / Math.max(earlierKeywords.size, laterKeywords.size, 1);
  if (overlapRatio > 0.16 && overlap.length >= 2) {
    signals.push({
      type: 'keyword-overlap',
      confidence: Math.min(0.32 + overlapRatio, 0.6),
      reason: `keyword overlap: ${overlap.slice(0, 5).join(', ')}`,
    });
  }

  return signals;
}

function aggregateConfidence(signals: InferenceSignal[]): number {
  if (signals.length === 0) return 0;
  const sorted = [...signals].sort((left, right) => right.confidence - left.confidence);
  let total = sorted[0].confidence;
  for (let index = 1; index < sorted.length; index += 1) {
    total += sorted[index].confidence * 0.28;
  }
  return Math.min(total, 0.98);
}

function determineEdgeType(signals: InferenceSignal[]): PlanetEdgeType {
  if (signals.some((signal) => signal.type === 'supersedes')) return 'supersedes';
  if (signals.some((signal) => signal.type === 'data-dependency' || signal.type === 'text-reference')) return 'depends-on';
  return 'related-to';
}

function edgeKey(fromPlanetId: string, toPlanetId: string): string {
  return `${fromPlanetId}::${toPlanetId}`;
}

export function inferPlanetEdges(tasks: TaskRecord[]): PlanetEdge[] {
  const sortedTasks = [...tasks].sort((left, right) => left.createdAt - right.createdAt);
  const edges = new Map<string, PlanetEdge>();

  for (let earlierIndex = 0; earlierIndex < sortedTasks.length; earlierIndex += 1) {
    for (let laterIndex = earlierIndex + 1; laterIndex < sortedTasks.length; laterIndex += 1) {
      const earlier = sortedTasks[earlierIndex];
      const later = sortedTasks[laterIndex];
      const signals = collectSignals(earlier, later);
      const confidence = aggregateConfidence(signals);

      if (confidence < 0.4) continue;

      const edge: PlanetEdge = {
        fromPlanetId: later.id,
        toPlanetId: earlier.id,
        type: determineEdgeType(signals),
        confidence,
        source: 'auto',
        reason: signals.map((signal) => signal.reason).join('; '),
      };
      edges.set(edgeKey(edge.fromPlanetId, edge.toPlanetId), edge);
    }
  }

  return [...edges.values()].sort((left, right) => right.confidence - left.confidence);
}
