import type { CrocOffice } from './croc-office.js';

export interface ChatTaskDispatchPlan {
  intent: 'pipeline' | 'scan' | 'report' | 'analysis';
  confidence: number;
  reason: string;
}

export interface ChatTaskDispatchResult {
  ok: boolean;
  taskId: string;
  plan: ChatTaskDispatchPlan;
  action: 'started' | 'waiting';
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

export function classifyChatTaskIntent(text: string): ChatTaskDispatchPlan {
  const value = normalize(text);

  if (/(run tests|playwright|执行测试|跑测试|test execution|测试执行)/i.test(value)) {
    return { intent: 'pipeline', confidence: 0.63, reason: 'Testing-related request should usually run through pipeline context first.' };
  }

  if (/(pipeline|生成测试|测试链路|测试用例|codegen|api chain)/i.test(value)) {
    return { intent: 'pipeline', confidence: 0.88, reason: 'Request mentions pipeline/code generation workflow.' };
  }

  if (/(scan|扫描|仓库结构|项目结构|知识图谱|graph)/i.test(value)) {
    return { intent: 'scan', confidence: 0.86, reason: 'Request is about repository scanning or graph/context gathering.' };
  }

  if (/(report|报告|总结报告|生成报告|汇总)/i.test(value)) {
    return { intent: 'report', confidence: 0.82, reason: 'Request explicitly asks for reports or summaries.' };
  }

  return { intent: 'analysis', confidence: 0.58, reason: 'Fallback to general analysis flow for complex chat task.' };
}

export async function dispatchChatTask(office: CrocOffice, taskId: string, text: string): Promise<ChatTaskDispatchResult> {
  const task = office.getTask(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const plan = classifyChatTaskIntent(text);

  office.activateTask(taskId);
  office.markTaskRunning('understand', `Classified request as ${plan.intent}`, 18);

  if (plan.intent === 'analysis') {
    office.markTaskRunning('gather', 'Collecting context and waiting for analysis executor binding', 30);
    office.waitOnTask('analysis-executor', 'Chat task classified as analysis; waiting for analysis executor or agent binding', 42, {
      prompt: '当前请求更像分析任务。请选择下一步：',
      options: [
        { id: '1', label: '继续作为通用分析任务' },
        { id: '2', label: '改走 scan' },
        { id: '3', label: '改走 pipeline' },
      ],
      allowFreeText: true,
    });
    office.activateTask(null);
    return { ok: true, taskId, plan, action: 'waiting' };
  }

  office.completeTaskStage('understand', `Intent classified: ${plan.intent}`, 25);
  office.activateTask(null);

  const startResult = await (plan.intent === 'scan'
    ? office.runScan()
    : plan.intent === 'report'
      ? office.generateReport()
      : office.runPipeline());

  return {
    ok: startResult.ok,
    taskId,
    plan,
    action: 'started',
  };
}
