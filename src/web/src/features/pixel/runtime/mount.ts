type ProjectPayload = {
  graph?: { nodes?: Array<Record<string, any>>; edges?: Array<Record<string, any>> };
  agents?: Array<Record<string, any>>;
  stats?: Record<string, number>;
  backendRoot?: string;
};

function must<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }
  return element as T;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function mountPixelRuntime(): Promise<() => void> {
  const listeners: Array<() => void> = [];
  const nodePos = new Map<string, { x: number; y: number; node: Record<string, any> }>();
  const bubbleTimers = new Map<string, number>();
  const state = {
    project: null as ProjectPayload | null,
    graph: { nodes: [], edges: [] } as { nodes: Array<Record<string, any>>; edges: Array<Record<string, any>> },
    agents: [] as Array<Record<string, any>>,
    generatedFiles: [] as Array<Record<string, any>>,
    testMetrics: null as Record<string, any> | null,
    testQuality: null as Record<string, any> | null,
    reports: [] as Array<Record<string, any>>,
    runMode: 'auto',
    currentView: 'dashboard',
    theme: localStorage.getItem('opencroc-pixel-theme') || 'dark',
    ws: null as WebSocket | null,
    reconnectTimer: 0,
    shortcutTimer: 0,
    logs: [] as Array<{ ts: string; level: string; message: string }>,
    running: false,
  };

  const tooltip = must('tooltip');
  const canvas = must<HTMLCanvasElement>('graph-canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Graph canvas is not available.');
  }

  function listen(
    target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
    eventName: string,
    handler: EventListenerOrEventListenerObject,
  ) {
    target.addEventListener(eventName, handler);
    listeners.push(() => target.removeEventListener(eventName, handler));
  }

  function setTheme(theme: string) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('opencroc-pixel-theme', theme);
  }

  function addLog(message: string, level = 'info') {
    state.logs.push({
      ts: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      level,
      message,
    });
    if (state.logs.length > 80) {
      state.logs = state.logs.slice(-80);
    }
    renderLogs();
  }

  function updateButtons() {
    const disabled = state.running;
    ['btn-scan', 'btn-pipeline', 'btn-reset', 'btn-run-tests', 'btn-reports'].forEach((id) => {
      must<HTMLButtonElement>(id).disabled = disabled;
    });
  }

  function updateStats() {
    const graph = state.graph;
    const stats = state.project?.stats || {};
    must('s-mod').textContent = String(stats.modules ?? graph.nodes.filter((node) => node.type === 'module').length);
    must('s-mdl').textContent = String(stats.models ?? graph.nodes.filter((node) => node.type === 'model').length);
    must('s-api').textContent = String(stats.endpoints ?? graph.nodes.filter((node) => node.type === 'api').length);
    must('s-files').textContent = String(state.generatedFiles.length || 0);
    if (state.testMetrics) {
      const wrap = must('s-results-wrap');
      wrap.style.display = '';
      must('s-results').textContent = `${state.testMetrics.passed || 0}/${state.testMetrics.failed || 0}`;
    }
  }

  function renderModules() {
    const container = must('mod-list');
    const modules = state.graph.nodes.filter((node) => node.type === 'module');
    if (!modules.length) {
      container.innerHTML = '<div class="pixel-list-item">No modules yet. Run Scan first.</div>';
      return;
    }

    container.innerHTML = modules
      .map((moduleNode) => `<button class="pixel-list-item" type="button" data-module-id="${esc(moduleNode.id)}"><strong>${esc(moduleNode.label || moduleNode.id)}</strong><div style="margin-top:6px;color:var(--pixel-dim);font-size:12px">${esc(moduleNode.path || '')}</div></button>`)
      .join('');
  }

  function renderAgentSidebar() {
    const container = must('agent-sidebar');
    if (!state.agents.length) {
      container.innerHTML = '<div class="pixel-list-item">No agents connected.</div>';
      return;
    }
    container.innerHTML = state.agents
      .map((agent) => `
        <div class="pixel-list-item">
          <strong>${esc(agent.name || agent.id)}</strong>
          <div style="margin-top:6px;color:var(--pixel-dim);font-size:12px">${esc(agent.role || 'agent')}</div>
          <div style="margin-top:4px;color:var(--pixel-dim);font-size:12px">${esc(agent.status || 'idle')}</div>
        </div>
      `)
      .join('');
  }

  function layoutGraph() {
    nodePos.clear();
    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 960;
    const height = canvas.clientHeight || canvas.parentElement?.clientHeight || 640;
    const modules = state.graph.nodes.filter((node) => node.type === 'module');
    const others = state.graph.nodes.filter((node) => node.type !== 'module');

    modules.forEach((node, index) => {
      const angle = (index / Math.max(modules.length, 1)) * Math.PI * 2;
      const x = width / 2 + Math.cos(angle) * Math.min(width, height) * 0.28;
      const y = height / 2 + Math.sin(angle) * Math.min(width, height) * 0.22;
      nodePos.set(String(node.id), { x, y, node });
    });

    others.forEach((node, index) => {
      const moduleNode = modules.find((entry) => entry.label === node.module || entry.id === node.module);
      const anchor = moduleNode ? nodePos.get(String(moduleNode.id)) : undefined;
      const angle = (index / Math.max(others.length, 1)) * Math.PI * 2;
      const radius = anchor ? 90 + (index % 6) * 18 : Math.min(width, height) * 0.18;
      nodePos.set(String(node.id), {
        x: (anchor?.x || width / 2) + Math.cos(angle) * radius,
        y: (anchor?.y || height / 2) + Math.sin(angle) * radius,
        node,
      });
    });
  }

  function renderCanvas() {
    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 960;
    const height = canvas.clientHeight || canvas.parentElement?.clientHeight || 640;
    canvas.width = width * Math.max(window.devicePixelRatio, 1);
    canvas.height = height * Math.max(window.devicePixelRatio, 1);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(Math.max(window.devicePixelRatio, 1), 0, 0, Math.max(window.devicePixelRatio, 1), 0, 0);
    ctx.clearRect(0, 0, width, height);
    layoutGraph();

    ctx.strokeStyle = state.theme === 'dark' ? 'rgba(148,163,184,0.28)' : 'rgba(100,116,139,0.26)';
    ctx.lineWidth = 1.4;
    for (const edge of state.graph.edges) {
      const source = nodePos.get(String(edge.source));
      const target = nodePos.get(String(edge.target));
      if (!source || !target) {
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
    }

    for (const { x, y, node } of nodePos.values()) {
      const fill = node.type === 'module'
        ? '#a78bfa'
        : node.type === 'api'
          ? '#fbbf24'
          : node.type === 'model'
            ? '#34d399'
            : '#60a5fa';
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(x, y, node.type === 'module' ? 16 : 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = state.theme === 'dark' ? '#e2e8f0' : '#0f172a';
      ctx.font = node.type === 'module' ? '12px sans-serif' : '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(node.label || node.id), x, y + (node.type === 'module' ? 32 : 24));
    }
  }

  function renderLogs() {
    const container = must('log-list');
    container.innerHTML = state.logs
      .slice()
      .reverse()
      .map((entry) => `<div class="pixel-log-entry"><span class="ts">${esc(entry.ts)}</span><strong>${esc(entry.level)}</strong><div style="margin-top:4px">${esc(entry.message)}</div></div>`)
      .join('');
  }

  function renderOfficeCards() {
    const container = must('croc-office');
    if (!state.agents.length) {
      container.innerHTML = '<div class="pixel-agent-card">No active agents yet.</div>';
      return;
    }

    container.innerHTML = state.agents
      .map((agent) => {
        const progress = typeof agent.progress === 'number' ? Math.max(0, Math.min(100, agent.progress)) : 0;
        return `
          <div class="pixel-agent-card">
            <strong>${esc(agent.name || agent.id)}</strong>
            <span class="role">${esc(agent.role || 'agent')}</span>
            <span class="task">${esc(agent.currentTask || 'Awaiting task')}</span>
            <div class="pixel-progress"><span style="width:${progress}%"></span></div>
          </div>
        `;
      })
      .join('');
  }

  function clearBubbles() {
    for (const timer of bubbleTimers.values()) {
      window.clearInterval(timer);
    }
    bubbleTimers.clear();
  }

  function scheduleBubbles() {
    clearBubbles();
    const layer = must('pixel-agent-layer');
    for (const agent of state.agents) {
      const timer = window.setInterval(() => {
        const agentElement = layer.querySelector<HTMLElement>(`[data-agent-name="${CSS.escape(String(agent.name || agent.id))}"]`);
        if (!agentElement || state.currentView !== 'office') {
          return;
        }
        const bubble = document.createElement('div');
        bubble.className = 'pixel-bubble';
        bubble.textContent = String(agent.status || 'idle');
        bubble.style.left = `${agentElement.offsetLeft + 50}px`;
        bubble.style.top = `${agentElement.offsetTop - 10}px`;
        layer.appendChild(bubble);
        window.setTimeout(() => bubble.remove(), 3000);
      }, 7000 + Math.round(Math.random() * 4000));
      bubbleTimers.set(String(agent.name || agent.id), timer);
    }
  }

  function renderPixelOffice() {
    const layer = must('pixel-agent-layer');
    const view = must('pixel-view');
    const width = view.clientWidth || 900;
    const height = view.clientHeight || 540;
    const presets = [
      { x: 0.18, y: 0.64 }, { x: 0.3, y: 0.66 }, { x: 0.42, y: 0.62 }, { x: 0.56, y: 0.6 }, { x: 0.72, y: 0.63 },
      { x: 0.82, y: 0.52 }, { x: 0.22, y: 0.45 }, { x: 0.48, y: 0.42 }, { x: 0.66, y: 0.4 }, { x: 0.78, y: 0.72 },
    ];
    const working = state.agents.filter((agent) => agent.status === 'working' || agent.status === 'testing').length;
    const errors = state.agents.filter((agent) => agent.status === 'error' || agent.status === 'failed').length;
    const done = state.agents.filter((agent) => agent.status === 'done' || agent.status === 'passed').length;
    must('kpi-working').textContent = String(working);
    must('kpi-errors').textContent = String(errors);
    must('kpi-done').textContent = String(done);

    layer.innerHTML = state.agents
      .map((agent, index) => {
        const preset = presets[index % presets.length];
        const left = Math.round(width * preset.x);
        const top = Math.round(height * preset.y);
        return `
          <div class="pixel-avatar ${esc(agent.status || 'idle')}" data-agent-name="${esc(agent.name || agent.id)}" style="left:${left}px;top:${top}px">🐊</div>
          <div class="pixel-label" style="left:${left + 24}px;top:${top - 18}px">
            <strong>${esc(agent.name || agent.id)}</strong>
            <span class="role">${esc(agent.role || 'agent')}</span>
            <span class="task">${esc(agent.currentTask || agent.status || 'idle')}</span>
          </div>
        `;
      })
      .join('');

    scheduleBubbles();
  }

  function renderFiles() {
    const container = must('file-list');
    if (!state.generatedFiles.length) {
      container.innerHTML = '<div class="pixel-file-item">No generated tests yet.</div>';
      return;
    }
    container.innerHTML = state.generatedFiles
      .map((file, index) => `
        <button class="pixel-file-item" data-file-index="${index}" type="button">
          <strong>${esc(file.filePath || `Generated file ${index + 1}`)}</strong>
          <span class="pixel-file-meta">${esc(file.module || '')} ${file.lines ? `| ${file.lines} lines` : ''}</span>
        </button>
      `)
      .join('');
  }

  function renderResults() {
    const container = must('results-panel');
    if (!state.testMetrics && !state.testQuality) {
      container.innerHTML = '<div class="pixel-file-item">No test results yet.</div>';
      return;
    }
    const metrics = state.testMetrics;
    const quality = state.testQuality;
    const total = metrics ? (metrics.passed || 0) + (metrics.failed || 0) + (metrics.skipped || 0) + (metrics.timedOut || 0) : 0;
    const passRate = total ? Math.round(((metrics?.passed || 0) / total) * 100) : 0;
    container.innerHTML = `
      <div class="pixel-file-item">
        <strong>Test Results</strong>
        <div style="margin-top:10px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
          <div class="pixel-agent-card"><strong>${metrics?.passed || 0}</strong><span class="role">Passed</span></div>
          <div class="pixel-agent-card"><strong>${metrics?.failed || 0}</strong><span class="role">Failed</span></div>
          <div class="pixel-agent-card"><strong>${metrics?.skipped || 0}</strong><span class="role">Skipped</span></div>
          <div class="pixel-agent-card"><strong>${metrics?.timedOut || 0}</strong><span class="role">Timed Out</span></div>
        </div>
        <div class="pixel-progress" style="margin-top:14px"><span style="width:${passRate}%"></span></div>
        <span class="pixel-file-meta">Pass rate ${passRate}%</span>
      </div>
      ${quality ? `<div class="pixel-file-item" style="margin-top:10px"><strong>Execution Quality</strong><pre style="white-space:pre-wrap;color:var(--pixel-dim);font-size:12px">${esc(JSON.stringify(quality, null, 2))}</pre></div>` : ''}
    `;
  }

  function renderReports() {
    const container = must('reports-panel');
    if (!state.reports.length) {
      container.innerHTML = '<div class="pixel-file-item">No reports available.</div>';
      return;
    }
    container.innerHTML = state.reports
      .map((report) => `
        <button class="pixel-file-item" data-report-format="${esc(report.format || '')}" type="button">
          <strong>${esc(report.filename || `report.${report.format || 'txt'}`)}</strong>
          <span class="pixel-file-meta">${esc(report.format || 'report')}</span>
        </button>
      `)
      .join('');
  }

  function updateAll() {
    updateStats();
    renderModules();
    renderAgentSidebar();
    renderCanvas();
    renderPixelOffice();
    renderOfficeCards();
    renderFiles();
    renderResults();
    renderReports();
  }

  async function fetchProject() {
    const project = (await fetchJson('/api/project')) as ProjectPayload;
    state.project = project;
    state.graph = {
      nodes: project.graph?.nodes || [],
      edges: project.graph?.edges || [],
    };
    state.agents = project.agents || [];
    updateAll();
  }

  async function doScan() {
    state.running = true;
    updateButtons();
    addLog('Starting project scan...');
    try {
      await fetchJson('/api/scan', { method: 'POST' });
    } catch (error) {
      addLog(`Scan failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
      state.running = false;
      updateButtons();
    }
  }

  async function doPipeline() {
    state.running = true;
    updateButtons();
    addLog('Pipeline started...');
    try {
      await fetchJson('/api/pipeline', { method: 'POST' });
    } catch (error) {
      addLog(`Pipeline failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
      state.running = false;
      updateButtons();
    }
  }

  async function doReset() {
    try {
      await fetchJson('/api/reset', { method: 'POST' });
      addLog('Agents reset.');
    } catch (error) {
      addLog(`Reset failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
    state.running = false;
    updateButtons();
  }

  async function doRunTests() {
    state.running = true;
    updateButtons();
    addLog(`Running tests (${state.runMode})...`);
    try {
      const payload = await fetchJson('/api/run-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: state.runMode }),
      });
      if (payload.error) {
        addLog(`Test run failed: ${payload.error}`, 'error');
      }
    } catch (error) {
      addLog(`Tests failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
      state.running = false;
      updateButtons();
    }
  }

  async function doReports() {
    state.running = true;
    updateButtons();
    addLog('Generating reports...');
    try {
      await fetchJson('/api/reports/generate', { method: 'POST' });
    } catch (error) {
      addLog(`Report generation failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
      state.running = false;
      updateButtons();
    }
  }

  function connectWs() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/ws`);
    state.ws = socket;

    socket.onopen = () => {
      must('conn-dot').classList.add('connected');
      addLog('WebSocket connected.');
    };

    socket.onclose = () => {
      must('conn-dot').classList.remove('connected');
      addLog('WebSocket disconnected. Retrying...', 'warn');
      state.reconnectTimer = window.setTimeout(connectWs, 3000);
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'agent:update') {
          state.agents = message.payload || [];
          updateAll();
          return;
        }
        if (message.type === 'graph:update') {
          state.graph = {
            nodes: message.payload?.nodes || [],
            edges: message.payload?.edges || [],
          };
          renderCanvas();
          renderModules();
          return;
        }
        if (message.type === 'log') {
          addLog(String(message.payload?.message || ''), String(message.payload?.level || 'info'));
          return;
        }
        if (message.type === 'files:generated') {
          state.generatedFiles = message.payload || [];
          renderFiles();
          updateStats();
          return;
        }
        if (message.type === 'pipeline:complete') {
          state.running = false;
          updateButtons();
          addLog(message.payload?.error ? `Pipeline failed: ${message.payload.error}` : 'Pipeline completed.', message.payload?.error ? 'error' : 'info');
          void fetchProject();
          return;
        }
        if (message.type === 'test:complete') {
          state.running = false;
          state.testMetrics = message.payload?.metrics || null;
          state.testQuality = message.payload?.quality || null;
          updateButtons();
          renderResults();
          updateStats();
          return;
        }
        if (message.type === 'reports:generated') {
          state.running = false;
          state.reports = message.payload || [];
          updateButtons();
          renderReports();
          return;
        }
        if (message.type === 'scan:complete') {
          state.running = false;
          updateButtons();
          addLog('Scan completed.');
          void fetchProject();
        }
      } catch {
        // Ignore malformed message.
      }
    };
  }

  function setView(view: 'dashboard' | 'office') {
    state.currentView = view;
    must('graph-view').classList.toggle('hidden', view !== 'dashboard');
    must('pixel-view').classList.toggle('hidden', view !== 'office');
    must('view-dashboard').classList.toggle('active', view === 'dashboard');
    must('view-office').classList.toggle('active', view === 'office');
    tooltip.classList.remove('visible');
    if (view === 'dashboard') {
      renderCanvas();
      return;
    }
    renderPixelOffice();
  }

  async function openFilePreview(index: number) {
    const payload = await fetchJson(`/api/files/${index}`);
    must('fp-title').textContent = payload.filePath || 'file.ts';
    must('fp-code').textContent = payload.content || '';
    must('file-preview').classList.add('visible');
  }

  async function openReportPreview(format: string) {
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
    must('fp-title').textContent = `report.${format}`;
    must('fp-code').textContent = content;
    must('file-preview').classList.add('visible');
  }

  function showShortcutLegend() {
    const legend = must('shortcut-legend');
    legend.classList.add('visible');
    window.clearTimeout(state.shortcutTimer);
    state.shortcutTimer = window.setTimeout(() => legend.classList.remove('visible'), 4000);
  }

  listen(must('btn-scan'), 'click', () => void doScan());
  listen(must('btn-pipeline'), 'click', () => void doPipeline());
  listen(must('btn-reset'), 'click', () => void doReset());
  listen(must('btn-run-tests'), 'click', () => void doRunTests());
  listen(must('btn-reports'), 'click', () => void doReports());
  listen(must('run-mode'), 'change', (event) => {
    state.runMode = (event.target as HTMLSelectElement).value;
  });
  listen(must('view-dashboard'), 'click', () => setView('dashboard'));
  listen(must('view-office'), 'click', () => setView('office'));
  listen(must('theme-toggle'), 'click', () => {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
    renderCanvas();
  });
  listen(must('fp-close'), 'click', () => must('file-preview').classList.remove('visible'));
  listen(must('file-preview'), 'click', (event) => {
    if (event.target === must('file-preview')) {
      must('file-preview').classList.remove('visible');
    }
  });
  listen(document.querySelectorAll('.pixel-tab').item(0).parentElement as HTMLElement, 'click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('.pixel-tab');
    if (!target) {
      return;
    }
    const tab = target.dataset.tab;
    document.querySelectorAll<HTMLElement>('.pixel-tab').forEach((button) => {
      button.classList.toggle('active', button === target);
    });
    must('log-list').style.display = tab === 'log' ? '' : 'none';
    must('file-list').style.display = tab === 'files' ? '' : 'none';
    must('results-panel').style.display = tab === 'results' ? '' : 'none';
    must('reports-panel').style.display = tab === 'reports' ? '' : 'none';
  });
  listen(must('file-list'), 'click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-file-index]');
    if (!target) {
      return;
    }
    void openFilePreview(Number(target.dataset.fileIndex));
  });
  listen(must('reports-panel'), 'click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-report-format]');
    if (!target) {
      return;
    }
    void openReportPreview(target.dataset.reportFormat || 'txt');
  });
  listen(canvas, 'mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let hit: { node: Record<string, any> } | undefined;
    for (const item of nodePos.values()) {
      const radius = item.node.type === 'module' ? 18 : 12;
      if (Math.abs(item.x - x) <= radius && Math.abs(item.y - y) <= radius) {
        hit = item;
      }
    }
    if (!hit) {
      tooltip.classList.remove('visible');
      return;
    }
    tooltip.classList.add('visible');
    tooltip.innerHTML = `<strong>${esc(hit.node.label || hit.node.id)}</strong><div>${esc(hit.node.type || 'unknown')}</div>`;
    tooltip.style.left = `${event.clientX + 12}px`;
    tooltip.style.top = `${event.clientY + 12}px`;
  });
  listen(canvas, 'mouseleave', () => tooltip.classList.remove('visible'));
  listen(window, 'resize', () => {
    renderCanvas();
    renderPixelOffice();
  });
  listen(document, 'keydown', (event) => {
    const keyboardEvent = event as KeyboardEvent;
    const target = keyboardEvent.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      return;
    }
    if (keyboardEvent.key === 'Escape') {
      must('file-preview').classList.remove('visible');
      must('shortcut-legend').classList.remove('visible');
      return;
    }
    const key = keyboardEvent.key.toLowerCase();
    if (key === '?' || (keyboardEvent.key === '/' && keyboardEvent.shiftKey)) {
      keyboardEvent.preventDefault();
      showShortcutLegend();
      return;
    }
    if (key === '1') {
      keyboardEvent.preventDefault();
      setView('dashboard');
      return;
    }
    if (key === '2') {
      keyboardEvent.preventDefault();
      setView('office');
      return;
    }
    if (key === 's') {
      keyboardEvent.preventDefault();
      void doScan();
      return;
    }
    if (key === 'p') {
      keyboardEvent.preventDefault();
      void doPipeline();
      return;
    }
    if (key === 't') {
      keyboardEvent.preventDefault();
      void doRunTests();
      return;
    }
    if (key === 'r') {
      keyboardEvent.preventDefault();
      void doReports();
      return;
    }
    if (key === 'x') {
      keyboardEvent.preventDefault();
      void doReset();
      return;
    }
    if (key === 'd') {
      keyboardEvent.preventDefault();
      setTheme(state.theme === 'dark' ? 'light' : 'dark');
      renderCanvas();
    }
  });

  setTheme(state.theme);
  updateButtons();
  addLog('OpenCroc Studio pixel dashboard ready. Press ? for shortcuts.');
  await fetchProject();
  connectWs();
  updateAll();

  return () => {
    listeners.forEach((cleanup) => cleanup());
    listeners.length = 0;
    if (state.ws) {
      state.ws.close();
    }
    clearBubbles();
    window.clearTimeout(state.reconnectTimer);
    window.clearTimeout(state.shortcutTimer);
  };
}
