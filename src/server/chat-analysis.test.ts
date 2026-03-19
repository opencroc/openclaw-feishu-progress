import { describe, expect, it } from 'vitest';
import { buildProjectChatAnswer } from './chat-analysis.js';

describe('buildProjectChatAnswer', () => {
  it('returns a structured answer with readable sections', () => {
    const answer = buildProjectChatAnswer('这个项目是干啥用的？', {
      packageName: 'openclaw-feishu-progress',
      packageDescription: '把飞书复杂请求转成可追踪任务，并持续回传进度',
      packageKeywords: ['feishu', 'openclaw', 'progress'],
      valueProp: '先 ACK，再持续回进度，最后回结果',
      coreFeatures: [
        'OpenClaw 本机转发桥',
        '单卡片实时进度更新',
        '任务详情页',
      ],
      graphSummary: {
        projectName: 'openclaw-feishu-progress',
        projectType: 'custom',
        frameworks: ['Fastify', 'React'],
        modules: 4,
        apiEndpoints: 8,
        dataModels: 2,
      },
    });

    expect(answer).toContain('项目定位');
    expect(answer).toContain('一句话价值');
    expect(answer).toContain('核心能力');
    expect(answer).toContain('1. OpenClaw 本机转发桥');
    expect(answer).toContain('仓库画像');
  });
});
