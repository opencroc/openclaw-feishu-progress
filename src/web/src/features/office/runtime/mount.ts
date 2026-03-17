import {
  createEngine,
  disposeEngine,
  getCamera,
  getClock,
  getComposer,
  getRenderer,
  getScene,
  resizeEngine,
  updateEngine,
  updateEngineTheme,
} from '@runtime/engine';
import {
  createOffice,
  disposeOffice,
  updateOfficeLighting,
} from '@runtime/office';
import { AgentManager } from '@runtime/agents';
import { ParticleManager } from '@runtime/effects';
import { CameraController } from '@runtime/camera';
import { GraphViz, HologramDisplay } from '@runtime/dataviz';
import { StateManager } from '@runtime/state';
import { UIManager } from '@runtime/ui';
import { navigate } from '@shared/navigation';

type GraphPayload = {
  nodes?: Array<Record<string, unknown>>;
  edges?: Array<Record<string, unknown>>;
};

type AgentPayload = Array<Record<string, any>>;

type StudioSummary = {
  stats?: Record<string, number>;
  risks?: number;
  [key: string]: unknown;
};

const ICONS = {
  croc: '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="4" width="12" height="10" rx="1" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="9" r="2.5" fill="currentColor"/><rect x="5" y="2" width="6" height="2" rx="0.5" fill="currentColor" opacity="0.6"/></svg>',
  parser: '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="9" width="3" height="5" rx="0.5" fill="currentColor" opacity="0.7"/><rect x="6.5" y="5" width="3" height="9" rx="0.5" fill="currentColor" opacity="0.8"/><rect x="11" y="2" width="3" height="12" rx="0.5" fill="currentColor"/></svg>',
  analyzer: '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="8" width="2.5" height="6" rx="0.5" fill="currentColor" opacity="0.5"/><rect x="5.5" y="5" width="2.5" height="9" rx="0.5" fill="currentColor" opacity="0.7"/><rect x="9" y="3" width="2.5" height="11" rx="0.5" fill="currentColor" opacity="0.85"/><rect x="12.5" y="6" width="2.5" height="8" rx="0.5" fill="currentColor"/></svg>',
  tester: '<svg viewBox="0 0 16 16" fill="none"><path d="M6 2h4v4l3 7a1 1 0 01-1 1H4a1 1 0 01-1-1l3-7V2z" stroke="currentColor" stroke-width="1.2"/><line x1="5" y1="2" x2="11" y2="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  healer: '<svg viewBox="0 0 16 16" fill="none"><path d="M8 2L3 9h4l-1 5 6-7H8l1-5z" fill="currentColor" opacity="0.8"/></svg>',
  planner: '<svg viewBox="0 0 16 16" fill="none"><rect x="3" y="1" width="10" height="14" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M6 1V3M10 1V3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="5" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1" opacity="0.4"/><line x1="5" y1="9" x2="11" y2="9" stroke="currentColor" stroke-width="1" opacity="0.4"/><line x1="5" y1="12" x2="9" y2="12" stroke="currentColor" stroke-width="1" opacity="0.4"/></svg>',
  reporter: '<svg viewBox="0 0 16 16" fill="none"><polyline points="2,12 5,6 8,9 11,4 14,7" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const ROLE_ICONS: Record<string, string> = {
  parser: ICONS.parser,
  analyzer: ICONS.analyzer,
  tester: ICONS.tester,
  healer: ICONS.healer,
  planner: ICONS.planner,
  reporter: ICONS.reporter,
};

const DYNAMIC_ROLE_ICONS: Record<string, string> = {
  security: 'shield',
  performance: 'perf',
  architecture: 'arch',
  'data-modeling': 'data',
  devops: 'ops',
  'api-design': 'api',
  refactor: 'ref',
  microservice: 'svc',
  python: 'py',
  go: 'go',
  java: 'java',
  rust: 'rs',
  react: 'react',
  vue: 'vue',
  express: 'express',
  django: 'django',
  springboot: 'spring',
};

const BUBBLE_TEXTS = {
  working: ['Working...', 'Almost there...', 'Processing...', 'On it.'],
  testing: ['Running tests...', 'Checking API...', 'Verifying...'],
  thinking: ['Thinking...', 'Analyzing...', 'Reasoning...'],
  error: ['Something broke.', 'Fixing it...', 'Investigating...'],
  idle: ['Standing by.', 'Waiting for work.', 'Coffee break.'],
  done: ['Done.', 'Completed.', 'Ready for the next task.'],
  passed: ['All green.', 'Checks passed.'],
  failed: ['Needs attention.', 'Requires a fix.'],
};

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mustElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: #${id}`);
  }
  return element as T;
}

class OfficeRuntime {
  private readonly state = new StateManager();
  private readonly ui = new UIManager(this.state, {
    ICONS,
    ROLE_ICONS,
    DYNAMIC_ROLE_ICONS,
    resolveRoleIcon: (name: string) => ROLE_ICONS[name] || DYNAMIC_ROLE_ICONS[name] || 'bot',
    BUBBLE_TEXTS,
    esc,
  });

  private agentMgr: any;
  private particleMgr: any;
  private camCtrl: any;
  private graphViz: any;
  private hologram: any;
  private ws: WebSocket | null = null;
  private rafId = 0;
  private reconnectTimer = 0;
  private shortcutTimer = 0;
  private disposed = false;
  private listeners: Array<() => void> = [];

  async mount(): Promise<void> {
    this.ui.setLoading(5, 'Creating runtime state...');
    this.state.set({
      project: null,
      graph: { nodes: [], edges: [] },
      agents: [],
      ws: null,
      running: false,
      generatedFiles: [],
      testMetrics: null,
      testQuality: null,
      reports: [],
      runMode: 'auto',
      currentView: '3d',
      theme: localStorage.getItem('opencroc-theme') || 'light',
      modMeta: new Map(),
      nodePos: new Map(),
    });

    const theme = this.state.get('theme') as string;
    document.documentElement.setAttribute('data-theme', theme);
    mustElement<HTMLElement>('theme-icon-dark').style.display = theme === 'dark' ? '' : 'none';
    mustElement<HTMLElement>('theme-icon-light').style.display = theme === 'light' ? '' : 'none';

    this.ui.setLoading(10, 'Initializing 3D engine...');
    const canvas = mustElement<HTMLCanvasElement>('three-canvas');
    await createEngine(canvas, theme);

    this.ui.setLoading(25, 'Building office...');
    await createOffice(theme);

    this.ui.setLoading(40, 'Preparing camera...');
    this.camCtrl = new CameraController(canvas, getCamera(), getScene());

    this.ui.setLoading(50, 'Creating agents...');
    this.agentMgr = new AgentManager(getScene());

    this.ui.setLoading(60, 'Creating effects...');
    this.particleMgr = new ParticleManager(getScene());

    this.ui.setLoading(70, 'Preparing data visualization...');
    this.graphViz = new GraphViz(getScene());
    this.hologram = new HologramDisplay(getScene());

    this.ui.setLoading(80, 'Binding controls...');
    this.ui.init({
      doScan: () => void this.doScan(),
      doPipeline: () => void this.doPipeline(),
      doReset: () => void this.doReset(),
      doRunTests: () => void this.doRunTests(),
      doReports: () => void this.doReports(),
      toggleTheme: () => this.toggleTheme(),
      setView: (view: string) => this.setView(view),
      openFile: (value: string | number) => void this.openFilePreview(value),
      openReport: (value: string) => void this.openReportPreview(value),
      openFilePreview: (value: string | number) => void this.openFilePreview(value),
      openReportPreview: (value: string) => void this.openReportPreview(value),
    });
    this.bindEvents();

    await this.fetchProject();
    try {
      const summaryResponse = await fetch('/api/studio/summary');
      if (summaryResponse.ok) {
        const summary = (await summaryResponse.json()) as StudioSummary;
        this.state.set({ studioScan: summary });
        this.updateStudioStats(summary);
      }
    } catch {
      // Best effort only.
    }

    this.ui.setLoading(90, 'Connecting...');
    this.connectWS();

    this.ui.setLoading(100, 'Ready.');
    window.setTimeout(() => {
      mustElement<HTMLElement>('loading-overlay').classList.add('hidden');
    }, 400);

    this.rafId = window.requestAnimationFrame(this.renderLoop);
    this.ui.addLog('OpenCroc Studio 3D is ready. Press ? for shortcuts.', 'info', true);
  }

  dispose(): void {
    this.disposed = true;
    window.cancelAnimationFrame(this.rafId);
    window.clearTimeout(this.reconnectTimer);
    window.clearTimeout(this.shortcutTimer);

    this.listeners.forEach((cleanup) => cleanup());
    this.listeners = [];

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }

    this.camCtrl?.dispose?.();
    this.agentMgr?.dispose?.();
    this.particleMgr?.dispose?.();
    this.graphViz?.dispose?.();
    this.hologram?.dispose?.();
    disposeOffice();
    disposeEngine();
  }

  private readonly renderLoop = () => {
    if (this.disposed) {
      return;
    }

    this.rafId = window.requestAnimationFrame(this.renderLoop);
    const clock = getClock();
    if (!clock) {
      return;
    }

    const dt = clock.getDelta();
    if (dt > 0.1) {
      return;
    }

    updateEngine(dt);
    this.camCtrl?.update?.(dt);
    this.particleMgr?.update?.(dt);
    this.agentMgr?.update?.(dt);
    this.hologram?.update?.(dt, this.state.get('graph'));

    const composer = getComposer();
    if (composer) {
      composer.render(dt);
      return;
    }

    const renderer = getRenderer();
    const scene = getScene();
    const camera = getCamera();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  };

  private bindEvents(): void {
    this.listen(mustElement('btn-scan'), 'click', () => void this.doScan());
    this.listen(mustElement('btn-pipeline'), 'click', () => void this.doPipeline());
    this.listen(mustElement('btn-reset'), 'click', () => void this.doReset());
    this.listen(mustElement('btn-run-tests'), 'click', () => void this.doRunTests());
    this.listen(mustElement('btn-reports'), 'click', () => void this.doReports());
    this.listen(mustElement('view-3d'), 'click', () => this.setView('3d'));
    this.listen(mustElement('view-graph'), 'click', () => this.setView('graph'));
    this.listen(mustElement('theme-toggle'), 'click', () => this.toggleTheme());
    this.listen(mustElement('sidebar-toggle'), 'click', () => {
      mustElement('sidebar').classList.toggle('collapsed');
    });
    this.listen(mustElement('fp-close'), 'click', () => {
      mustElement('file-preview').classList.remove('visible');
    });
    this.listen(mustElement('fp-backdrop'), 'click', () => {
      mustElement('file-preview').classList.remove('visible');
    });

    const runMode = mustElement<HTMLSelectElement>('run-mode');
    this.listen(runMode, 'change', (event) => {
      const target = event.target as HTMLSelectElement;
      this.state.set({ runMode: target.value });
    });

    document.querySelectorAll<HTMLElement>('.panel-tabs .tab').forEach((tab) => {
      this.listen(tab, 'click', () => {
        document.querySelectorAll('.panel-tabs .tab').forEach((node) => node.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        mustElement('log-list').classList.toggle('hidden', target !== 'log');
        mustElement('file-list').classList.toggle('hidden', target !== 'files');
        mustElement('results-panel').classList.toggle('hidden', target !== 'results');
        mustElement('reports-panel').classList.toggle('hidden', target !== 'reports');
      });
    });

    this.listen(window, 'resize', () => resizeEngine());
    this.listen(document, 'keydown', (event) => this.handleShortcuts(event as KeyboardEvent));
  }

  private handleShortcuts(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      return;
    }

    const key = event.key.toLowerCase();
    if (event.key === 'Escape') {
      mustElement('file-preview').classList.remove('visible');
      mustElement('shortcut-legend').classList.remove('visible');
      return;
    }

    if (key === '?' || (event.key === '/' && event.shiftKey)) {
      event.preventDefault();
      const legend = mustElement('shortcut-legend');
      legend.classList.add('visible');
      window.clearTimeout(this.shortcutTimer);
      this.shortcutTimer = window.setTimeout(() => legend.classList.remove('visible'), 4000);
      return;
    }

    if (key === '1') {
      event.preventDefault();
      this.setView('3d');
      return;
    }
    if (key === '2') {
      event.preventDefault();
      this.setView('graph');
      return;
    }
    if (key === 's' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      void this.doScan();
      return;
    }
    if (key === 'p' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      void this.doPipeline();
      return;
    }
    if (key === 't' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      void this.doRunTests();
      return;
    }
    if (key === 'r' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      void this.doReports();
      return;
    }
    if (key === 'x' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      void this.doReset();
      return;
    }
    if (key === 'd' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      this.toggleTheme();
    }
  }

  private listen(
    target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
    eventName: string,
    handler: EventListenerOrEventListenerObject,
  ): void {
    target.addEventListener(eventName, handler);
    this.listeners.push(() => target.removeEventListener(eventName, handler));
  }

  private async fetchProject(): Promise<void> {
    try {
      const response = await fetch('/api/project');
      const project = await response.json();
      this.state.set({
        project,
        graph: project.graph || this.state.get('graph'),
        agents: project.agents || this.state.get('agents'),
      });
      this.updateAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.ui.addLog(`Failed to fetch project: ${message}`, 'error');
    }
  }

  private async doScan(): Promise<void> {
    if (this.state.get('running')) {
      return;
    }

    this.state.set({ running: true });
    this.updateButtons();
    this.ui.addLog('Starting codebase scan...', 'info', true);

    try {
      await fetch('/api/scan', { method: 'POST' });

      try {
        const cwd = this.state.get('project')?.backendRoot || '.';
        const summaryResponse = await fetch('/api/studio/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: cwd }),
        });

        if (summaryResponse.ok) {
          const summary = (await summaryResponse.json()) as StudioSummary;
          this.state.set({ studioScan: summary });
          this.updateStudioStats(summary);
          this.ui.addLog(
            `Knowledge graph ready: ${summary.stats?.totalNodes || 0} nodes, ${summary.stats?.totalEdges || 0} edges, ${summary.risks || 0} risks.`,
            'success',
            true,
          );
          this.ui.showToast('Knowledge graph updated.', 'success');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.ui.addLog(`Studio scan skipped: ${message}`, 'warning');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.ui.addLog(`Scan error: ${message}`, 'error');
      this.state.set({ running: false });
      this.updateButtons();
    }
  }

  private async doPipeline(): Promise<void> {
    if (this.state.get('running')) {
      return;
    }
    this.state.set({ running: true });
    this.updateButtons();
    this.ui.addLog('Pipeline started...', 'info', true);
    try {
      await fetch('/api/pipeline', { method: 'POST' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.ui.addLog(`Pipeline error: ${message}`, 'error');
      this.state.set({ running: false });
      this.updateButtons();
    }
  }

  private async doReset(): Promise<void> {
    try {
      await fetch('/api/reset', { method: 'POST' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.ui.addLog(`Reset error: ${message}`, 'error');
    }
    this.state.set({ running: false });
    this.updateButtons();
    this.ui.addLog('Agents reset.', 'info', true);
  }

  private async doRunTests(): Promise<void> {
    if (this.state.get('running')) {
      return;
    }
    this.state.set({ running: true });
    this.updateButtons();
    this.ui.addLog(`Running tests (mode: ${this.state.get('runMode')})...`, 'info', true);
    try {
      const response = await fetch('/api/run-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: this.state.get('runMode') }),
      });
      const payload = await response.json();
      if (payload.error) {
        this.ui.addLog(`Test error: ${payload.error}`, 'error');
        this.state.set({ running: false });
        this.updateButtons();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.ui.addLog(`Test error: ${message}`, 'error');
      this.state.set({ running: false });
      this.updateButtons();
    }
  }

  private async doReports(): Promise<void> {
    if (this.state.get('running')) {
      return;
    }
    this.state.set({ running: true });
    this.updateButtons();
    this.ui.addLog('Generating reports...', 'info', true);

    try {
      const perspectives = ['developer', 'architect', 'tester', 'product', 'student', 'executive'];
      const studioReports: Array<{ perspective: string; title: string; content: string }> = [];

      for (const perspective of perspectives) {
        try {
          const response = await fetch(`/api/studio/report/${perspective}`);
          if (!response.ok) {
            continue;
          }
          const report = await response.json();
          if (report.content) {
            studioReports.push({
              perspective,
              title: report.title || perspective,
              content: report.content,
            });
          }
        } catch {
          // Skip single perspective failures.
        }
      }

      if (studioReports.length > 0) {
        this.state.set({ running: false, studioReports });
        this.updateButtons();
        this.renderStudioReports(studioReports);
        this.ui.addLog(`${studioReports.length} perspective reports generated.`, 'success', true);
        this.ui.showToast(`${studioReports.length} reports ready.`, 'success');
        return;
      }

      await fetch('/api/reports/generate', { method: 'POST' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.ui.addLog(`Report error: ${message}`, 'error');
      this.state.set({ running: false });
      this.updateButtons();
    }
  }

  private connectWS(): void {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      if (this.disposed) {
        return;
      }
      this.ui.setConnected(true);
      this.state.set({ ws });
    };

    ws.onclose = () => {
      if (this.disposed) {
        return;
      }
      this.ui.setConnected(false);
      this.reconnectTimer = window.setTimeout(() => this.connectWS(), 3000);
    };

    ws.onmessage = (event) => {
      try {
        this.handleWS(JSON.parse(event.data) as Record<string, any>);
      } catch {
        // Ignore malformed messages.
      }
    };
  }

  private handleWS(message: Record<string, any>): void {
    switch (message.type) {
      case 'agent:update':
        this.state.set({ agents: message.payload });
        this.agentMgr?.sync?.(message.payload);
        this.ui.updateSidebar(null, message.payload);
        break;
      case 'agent:assigned': {
        const transfer = this.agentMgr?.applyAssignmentEvent?.(message.payload);
        if (transfer && this.particleMgr) {
          this.particleMgr.triggerAgentTransfer(transfer.from, transfer.to, transfer.kind);
        }
        if (message.payload?.name) {
          this.ui.addLog(
            `${esc(message.payload.name)} was assigned${message.payload.currentTask ? `: ${esc(message.payload.currentTask)}` : '.'}`,
            'info',
          );
        }
        break;
      }
      case 'agent:released': {
        const transfer = this.agentMgr?.applyReleaseEvent?.(message.payload);
        if (transfer && this.particleMgr) {
          this.particleMgr.triggerAgentTransfer(transfer.from, transfer.to, transfer.kind);
        }
        if (message.payload?.name) {
          this.ui.addLog(`${esc(message.payload.name)} returned to the pond.`, 'info');
        }
        break;
      }
      case 'graph:update':
        this.state.set({ graph: message.payload });
        this.graphViz?.update?.(message.payload);
        this.ui.updateSidebar(message.payload, null);
        this.ui.updateStats(message.payload);
        break;
      case 'log':
        this.ui.addLog(message.payload.message, message.payload.level);
        break;
      case 'files:generated':
        this.state.set({ generatedFiles: message.payload });
        this.ui.updateFileList(message.payload);
        break;
      case 'pipeline:complete':
        this.state.set({ running: false });
        this.updateButtons();
        if (message.payload.error) {
          this.ui.addLog(`Pipeline failed: ${message.payload.error}`, 'error');
        } else {
          this.ui.addLog('Pipeline complete.', 'success', true);
          this.ui.showToast('Pipeline completed.', 'success');
          this.particleMgr?.triggerCelebration?.();
        }
        void this.fetchProject();
        break;
      case 'test:complete':
        this.state.set({
          running: false,
          testMetrics: message.payload.metrics,
          testQuality: message.payload.quality,
        });
        this.updateButtons();
        this.ui.updateResults(message.payload);
        this.ui.addLog(
          `Tests: ${message.payload.metrics?.passed || 0} passed, ${message.payload.metrics?.failed || 0} failed.`,
          'info',
          true,
        );
        this.ui.showToast(
          `Tests: ${message.payload.metrics?.passed || 0} passed, ${message.payload.metrics?.failed || 0} failed.`,
          message.payload.metrics?.failed ? 'warning' : 'success',
        );
        break;
      case 'reports:generated':
        this.state.set({ running: false, reports: message.payload });
        this.updateButtons();
        this.ui.updateReports(message.payload);
        this.ui.addLog(`${message.payload.length} reports generated.`, 'success', true);
        break;
      case 'scan:complete':
        this.state.set({ running: false });
        this.updateButtons();
        this.ui.addLog('Scan complete.', 'success', true);
        this.ui.showToast('Scan completed.', 'success');
        void this.fetchProject();
        break;
      default:
        break;
    }
  }

  private updateAll(): void {
    const graph = this.state.get('graph') as GraphPayload;
    const agents = this.state.get('agents') as AgentPayload;
    this.ui.updateSidebar(graph, agents);
    this.ui.updateStats(graph);
    if (agents) {
      this.agentMgr?.sync?.(agents);
    }
    if (graph) {
      this.graphViz?.update?.(graph);
    }
  }

  private updateButtons(): void {
    const running = Boolean(this.state.get('running'));
    ['btn-scan', 'btn-pipeline', 'btn-reset', 'btn-run-tests', 'btn-reports'].forEach((id) => {
      mustElement<HTMLButtonElement>(id).disabled = running;
    });
  }

  private async openFilePreview(indexOrPath: string | number): Promise<void> {
    try {
      const response = await fetch(`/api/files/${indexOrPath}`);
      const payload = await response.json();
      mustElement('fp-title').textContent = payload.filePath || 'File';
      mustElement('fp-code').textContent = payload.content || '';
      mustElement('file-preview').classList.add('visible');
    } catch {
      this.ui.showToast('Failed to load file.', 'error');
    }
  }

  private async openReportPreview(format: string): Promise<void> {
    try {
      const response = await fetch(`/api/reports/${format}`);
      const content = await response.text();
      if (format === 'html') {
        const nextWindow = window.open('', '_blank');
        if (nextWindow) {
          nextWindow.document.write(content);
          nextWindow.document.close();
        }
        return;
      }

      mustElement('fp-title').textContent = `Report: ${format}`;
      mustElement('fp-code').textContent = content;
      mustElement('file-preview').classList.add('visible');
    } catch {
      this.ui.showToast('Failed to load report.', 'error');
    }
  }

  private toggleTheme(): void {
    const current = this.state.get('theme') as string;
    const next = current === 'dark' ? 'light' : 'dark';
    this.state.set({ theme: next });
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('opencroc-theme', next);
    mustElement<HTMLElement>('theme-icon-dark').style.display = next === 'dark' ? '' : 'none';
    mustElement<HTMLElement>('theme-icon-light').style.display = next === 'light' ? '' : 'none';
    updateEngineTheme(next);
    updateOfficeLighting(next);
  }

  private setView(view: string): void {
    this.state.set({ currentView: view });
    mustElement('view-3d').classList.toggle('active', view === '3d');
    mustElement('view-graph').classList.toggle('active', view === 'graph');
    if (view === '3d') {
      this.camCtrl?.flyTo?.('office');
      return;
    }
    navigate('/studio');
  }

  private updateStudioStats(summary: StudioSummary): void {
    if (!summary?.stats) {
      return;
    }

    const stats = summary.stats;
    mustElement('s-mod').textContent = String(stats.moduleCount || 0);
    mustElement('s-mdl').textContent = String(stats.classCount || 0);
    mustElement('s-api').textContent = String(stats.functionCount || 0);
    mustElement('s-files').textContent = String(stats.fileCount || 0);
    mustElement('s-nodes').textContent = String(stats.totalNodes || 0);
    const risks = mustElement('s-risks');
    risks.textContent = String(summary.risks || 0);
    risks.style.color = summary.risks ? 'var(--orange)' : '';
  }

  private renderStudioReports(reports: Array<{ perspective: string; title: string; content: string }>): void {
    const panel = mustElement('reports-panel');
    const icons: Record<string, string> = {
      developer: 'DEV',
      architect: 'ARC',
      tester: 'TST',
      product: 'PM',
      student: 'EDU',
      executive: 'BIZ',
    };

    panel.innerHTML = reports
      .map(
        (report) => `
        <div class="report-card" style="padding:12px;margin:8px 0;background:var(--bg-card);border-radius:var(--radius-md);border:1px solid var(--border);cursor:pointer">
          <div style="display:flex;align-items:center;gap:8px;font-weight:600;color:var(--text);font-size:13px">
            <span>${icons[report.perspective] || 'RPT'}</span>
            <span>${esc(report.title || report.perspective)}</span>
            <span style="margin-left:auto;font-size:10px;color:var(--text-subtle)">click to expand</span>
          </div>
          <div class="report-body hidden" style="margin-top:10px;font-size:12px;color:var(--text-dim);white-space:pre-wrap;max-height:400px;overflow:auto;line-height:1.6">${esc(report.content)}</div>
        </div>`,
      )
      .join('');

    panel.querySelectorAll<HTMLElement>('.report-card').forEach((card) => {
      this.listen(card, 'click', () => {
        card.querySelector('.report-body')?.classList.toggle('hidden');
      });
    });

    document.querySelectorAll('.panel-tabs .tab').forEach((node) => node.classList.remove('active'));
    document.querySelector<HTMLElement>('.tab[data-tab="reports"]')?.classList.add('active');
    mustElement('log-list').classList.add('hidden');
    mustElement('file-list').classList.add('hidden');
    mustElement('results-panel').classList.add('hidden');
    panel.classList.remove('hidden');
  }
}

export async function mountOfficeRuntime(): Promise<() => void> {
  const runtime = new OfficeRuntime();
  await runtime.mount();
  return () => runtime.dispose();
}
