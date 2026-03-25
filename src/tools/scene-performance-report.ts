import { promises as fs } from 'node:fs';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { chromium } from '@playwright/test';

type LighthouseSummary = {
  path: string;
  score: number;
  fcpMs: number;
  lcpMs: number;
  tbtMs: number;
  speedIndexMs: number;
};

type MemorySummary = {
  path: string;
  navigationMs: number;
  heapSamples: number[];
  maxHeapDeltaMb: number;
  leakSuspected: boolean;
};

const currentFile = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(currentFile), '..', '..');
const reportDir = join(rootDir, 'reports', '3d');
const previewPort = 4174;
const baseUrl = `http://127.0.0.1:${previewPort}`;

async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true });
}

async function waitForPreviewReady(process: ChildProcessWithoutNullStreams): Promise<void> {
  await new Promise<void>((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error('预览服务启动超时')), 20000);
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.includes('127.0.0.1') || text.includes('localhost')) {
        clearTimeout(timer);
        process.stdout.off('data', onData);
        resolveReady();
      }
    };
    process.stdout.on('data', onData);
    process.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      if (/error/i.test(text)) {
        clearTimeout(timer);
        reject(new Error(text));
      }
    });
    process.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`预览服务提前退出: ${code ?? 'unknown'}`));
    });
  });
}

function startPreviewServer(): ChildProcessWithoutNullStreams {
  return spawn('npx', ['vite', 'preview', '--config', 'src/web/vite.config.ts', '--host', '127.0.0.1', '--port', String(previewPort)], {
    cwd: rootDir,
    shell: true,
    stdio: 'pipe',
  });
}

function metricValue(result: any, id: string): number {
  const audit = result.lhr.audits[id];
  return Number(audit?.numericValue ?? 0);
}

async function runLighthouse(path: string): Promise<LighthouseSummary> {
  const chrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const result = await lighthouse(`${baseUrl}${path}`, {
      port: chrome.port,
      onlyCategories: ['performance'],
      logLevel: 'error',
      output: 'json',
      disableStorageReset: true,
    });
    if (!result) {
      throw new Error(`Lighthouse 未返回结果: ${path}`);
    }
    return {
      path,
      score: Math.round((result.lhr.categories.performance?.score ?? 0) * 100),
      fcpMs: Math.round(metricValue(result, 'first-contentful-paint')),
      lcpMs: Math.round(metricValue(result, 'largest-contentful-paint')),
      tbtMs: Math.round(metricValue(result, 'total-blocking-time')),
      speedIndexMs: Math.round(metricValue(result, 'speed-index')),
    };
  } finally {
    await chrome.kill();
  }
}

async function runMemoryProfile(path: string): Promise<MemorySummary> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const heapSamples: number[] = [];
    let navigationMs = 0;

    for (let index = 0; index < 3; index += 1) {
      await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
      const metricsSession = await page.context().newCDPSession(page);
      await metricsSession.send('Performance.enable');
      const metrics = await metricsSession.send('Performance.getMetrics');
      const navigationEntry = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        return navigation ? navigation.duration : 0;
      });
      if (index === 0) {
        navigationMs = Math.round(navigationEntry);
      }
      const jsHeapUsedSize = metrics.metrics.find((entry: { name: string; value: number }) => entry.name === 'JSHeapUsedSize')?.value ?? 0;
      heapSamples.push(jsHeapUsedSize);
      await page.reload({ waitUntil: 'networkidle' });
    }

    const maxHeapDeltaMb = Number(((Math.max(...heapSamples) - Math.min(...heapSamples)) / (1024 * 1024)).toFixed(2));
    return {
      path,
      navigationMs,
      heapSamples: heapSamples.map((value) => Number((value / (1024 * 1024)).toFixed(2))),
      maxHeapDeltaMb,
      leakSuspected: maxHeapDeltaMb > 12,
    };
  } finally {
    await browser.close();
  }
}

function toMarkdown(lighthouseRows: LighthouseSummary[], memoryRows: MemorySummary[]): string {
  const lines = [
    '# 严格版性能测试报告',
    '',
    `- 基准时间：${new Date().toISOString()}`,
    `- 基准地址：${baseUrl}`,
    '',
    '## Lighthouse',
    '',
    '| 页面 | Performance | FCP(ms) | LCP(ms) | TBT(ms) | Speed Index(ms) | 结论 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...lighthouseRows.map((row) => `| ${row.path} | ${row.score} | ${row.fcpMs} | ${row.lcpMs} | ${row.tbtMs} | ${row.speedIndexMs} | ${row.score >= 95 ? '通过' : '未达标'} |`),
    '',
    '## 内存与加载',
    '',
    '| 页面 | 首次导航(ms) | Heap Samples(MB) | Max Delta(MB) | 泄漏判断 | 加载结论 |',
    '| --- | ---: | --- | ---: | --- | --- |',
    ...memoryRows.map((row) => `| ${row.path} | ${row.navigationMs} | ${row.heapSamples.join(', ')} | ${row.maxHeapDeltaMb} | ${row.leakSuspected ? '疑似泄漏' : '稳定'} | ${row.navigationMs <= 3000 ? '通过' : '未达标'} |`),
  ];
  return lines.join('\n');
}

async function run(): Promise<void> {
  await ensureDir(reportDir);
  const previewServer = startPreviewServer();
  try {
    await waitForPreviewReady(previewServer);
    const paths = ['/office', '/starmap'];
    const lighthouseRows = await Promise.all(paths.map((path) => runLighthouse(path)));
    const memoryRows = await Promise.all(paths.map((path) => runMemoryProfile(path)));
    const markdown = toMarkdown(lighthouseRows, memoryRows);
    await Promise.all([
      fs.writeFile(join(reportDir, 'performance-lighthouse-report.md'), markdown, 'utf8'),
      fs.writeFile(join(reportDir, 'performance-lighthouse-report.json'), JSON.stringify({ lighthouseRows, memoryRows }, null, 2), 'utf8'),
    ]);
    process.stdout.write(markdown);
  } finally {
    previewServer.kill();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  void run().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
