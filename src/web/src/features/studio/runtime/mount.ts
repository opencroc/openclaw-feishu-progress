type StudioGraph = {
  nodes?: Array<Record<string, any>>;
  edges?: Array<Record<string, any>>;
};

import { navigate } from '@shared/navigation';

type StudioSummary = {
  stats?: Record<string, number>;
  risks?: number;
};

type StudioSnapshot = {
  id: string;
  name?: string;
  createdAt?: string;
  pinned?: boolean;
  tags?: string[];
  source?: string;
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

export async function mountStudioRuntime(): Promise<() => void> {
  const listeners: Array<() => void> = [];
  const graphPositions = new Map<string, { x: number; y: number; node: Record<string, any> }>();
  let graphData: StudioGraph = { nodes: [], edges: [] };
  let summaryData: StudioSummary | null = null;
  let riskData: Array<Record<string, any>> = [];
  let snapshotData: StudioSnapshot[] = [];
  let snapshotFilter = '';
  let snapshotQuery = '';
  let selectedNode: Record<string, any> | null = null;
  let activeTypeFilter = '';
  let ws: WebSocket | null = null;
  let reconnectTimer = 0;
  let currentReport: any = null;
  let currentReportMode = 'markdown';
  let currentPerspective = '';
  const reportCache = new Map<string, any>();

  const svg = must<SVGSVGElement>('graph-canvas');
  const panel = must('panel');
  const tooltip = must('tooltip');

  function listen(
    target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
    eventName: string,
    handler: EventListenerOrEventListenerObject,
  ) {
    target.addEventListener(eventName, handler);
    listeners.push(() => target.removeEventListener(eventName, handler));
  }

  function setTheme(theme: string) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('opencroc-studio-theme', theme);
  }

  function showLoading(message: string, detail = '') {
    must('loading').classList.remove('hidden');
    must('loading-text').textContent = message;
    must('loading-detail').textContent = detail;
  }

  function hideLoading() {
    must('loading').classList.add('hidden');
  }

  function showGraphView() {
    must('report-view').classList.add('hidden');
    svg.style.display = '';
    must('graph-empty').classList.toggle('hidden', Boolean(graphData.nodes?.length));
    document.querySelectorAll<HTMLElement>('.studio-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.view === 'graph');
    });
  }

  function showReportView() {
    must('report-view').classList.remove('hidden');
    svg.style.display = 'none';
    must('graph-empty').classList.add('hidden');
  }

  function updateSummary() {
    const stats = summaryData?.stats || {};
    must('stat-modules').textContent = String(stats.moduleCount || 0);
    must('stat-apis').textContent = String(stats.functionCount || 0);
    must('stat-models').textContent = String(stats.classCount || 0);
    must('stat-risks').textContent = String(summaryData?.risks || 0);
  }

  function renderNodeTypes() {
    const container = must('node-type-list');
    const counts = new Map<string, number>();
    for (const node of graphData.nodes || []) {
      const type = String(node.type || 'unknown');
      counts.set(type, (counts.get(type) || 0) + 1);
    }

    container.innerHTML = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => {
        const active = activeTypeFilter === type ? ' active' : '';
        return `<button class="studio-list-item${active}" data-type="${esc(type)}" type="button"><strong>${esc(type)}</strong><div style="margin-top:6px;color:var(--studio-dim);font-size:12px">${count} nodes</div></button>`;
      })
      .join('');
  }

  function renderRisks() {
    const container = must('risk-list');
    if (!riskData.length) {
      container.innerHTML = '<div class="studio-list-item">No risks detected yet.</div>';
      return;
    }

    container.innerHTML = riskData
      .map((risk, index) => {
        const severity = String(risk.severity || 'info');
        const color = severity === 'critical' || severity === 'high'
          ? 'var(--studio-red)'
          : severity === 'medium'
            ? 'var(--studio-orange)'
            : 'var(--studio-blue)';
        return `<button class="studio-list-item" data-risk-index="${index}" type="button"><strong style="color:${color}">${esc(risk.title || risk.message || `Risk ${index + 1}`)}</strong><div style="margin-top:6px;color:var(--studio-dim);font-size:12px">${esc(risk.filePath || risk.module || severity)}</div></button>`;
      })
      .join('');
  }

  function filteredSnapshots() {
    return snapshotData.filter((snapshot) => {
      const matchesTag = !snapshotFilter || snapshot.tags?.includes(snapshotFilter);
      const haystack = `${snapshot.name || ''} ${snapshot.source || ''}`.toLowerCase();
      const matchesText = !snapshotQuery || haystack.includes(snapshotQuery.toLowerCase());
      return matchesTag && matchesText;
    });
  }

  function renderSnapshotTags() {
    const container = must('snapshot-tag-filters');
    const tags = Array.from(new Set(snapshotData.flatMap((snapshot) => snapshot.tags || []))).sort();
    const chips = ['all', ...tags];
    container.innerHTML = chips
      .map((tag) => {
        const active = (!snapshotFilter && tag === 'all') || snapshotFilter === tag;
        return `<button class="studio-chip${active ? ' active' : ''}" data-snapshot-filter="${esc(tag)}" type="button">${tag === 'all' ? 'All' : esc(tag)}</button>`;
      })
      .join('');
  }

  function renderSnapshots() {
    const container = must('snapshot-list');
    const snapshots = filteredSnapshots();
    if (!snapshots.length) {
      container.innerHTML = '<div class="snapshot-item">No snapshots found.</div>';
      return;
    }

    container.innerHTML = snapshots
      .map((snapshot) => {
        const tags = snapshot.tags || [];
        return `
          <div class="snapshot-item">
            <strong>${esc(snapshot.name || snapshot.id)}</strong>
            <div style="margin-top:6px;color:var(--studio-dim);font-size:12px">${esc(snapshot.createdAt || '')}</div>
            <div style="margin-top:4px;color:var(--studio-dim);font-size:12px">${esc(snapshot.source || '')}</div>
            <div class="snapshot-tags">${tags.map((tag) => `<span class="snapshot-tag">${esc(tag)}</span>`).join('')}</div>
            <div class="snapshot-actions">
              <button class="snapshot-action" data-snapshot-action="restore" data-snapshot-id="${esc(snapshot.id)}" type="button">Restore</button>
              <button class="snapshot-action" data-snapshot-action="pin" data-snapshot-id="${esc(snapshot.id)}" data-pinned="${snapshot.pinned ? '1' : '0'}" type="button">${snapshot.pinned ? 'Unpin' : 'Pin'}</button>
              <button class="snapshot-action" data-snapshot-action="rename" data-snapshot-id="${esc(snapshot.id)}" type="button">Rename</button>
              <button class="snapshot-action" data-snapshot-action="delete" data-snapshot-id="${esc(snapshot.id)}" type="button">Delete</button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderPanel(title: string, html: string) {
    must('panel-title').textContent = title;
    must('panel-body').innerHTML = html;
    panel.style.display = '';
  }

  async function showNodeDetail(node: Record<string, any>) {
    selectedNode = node;
    let payload = node;
    try {
      payload = await fetchJson(`/api/studio/node/${encodeURIComponent(String(node.id))}`);
    } catch {
      // Use fallback payload.
    }

    renderPanel(
      String(payload.label || payload.id || 'Node Detail'),
      `
        <h3>${esc(payload.label || payload.id || 'Node')}</h3>
        <p><strong>Type:</strong> ${esc(payload.type || 'unknown')}</p>
        <p><strong>Module:</strong> ${esc(payload.module || '-')}</p>
        <p><strong>Status:</strong> ${esc(payload.status || '-')}</p>
        <div class="studio-report-block"><pre>${esc(JSON.stringify(payload, null, 2))}</pre></div>
      `,
    );
  }

  function showRiskDetail(index: number) {
    const risk = riskData[index];
    if (!risk) {
      return;
    }

    renderPanel(
      String(risk.title || `Risk ${index + 1}`),
      `
        <p><strong>Severity:</strong> ${esc(risk.severity || 'unknown')}</p>
        <p><strong>Location:</strong> ${esc(risk.filePath || risk.module || '-')}</p>
        <div class="studio-report-block"><pre>${esc(JSON.stringify(risk, null, 2))}</pre></div>
      `,
    );
  }

  function showTooltip(event: MouseEvent, node: Record<string, any>) {
    tooltip.innerHTML = `<strong>${esc(node.label || node.id)}</strong><div style="margin-top:4px">${esc(node.type || 'unknown')}</div>`;
    tooltip.classList.add('visible');
    tooltip.style.left = `${event.clientX + 12}px`;
    tooltip.style.top = `${event.clientY + 12}px`;
  }

  function hideTooltip() {
    tooltip.classList.remove('visible');
  }

  function layoutGraph() {
    graphPositions.clear();
    const bounds = svg.getBoundingClientRect();
    const width = bounds.width || 960;
    const height = bounds.height || 720;
    const nodes = (graphData.nodes || []).filter((node) => !activeTypeFilter || node.type === activeTypeFilter);
    const modules = nodes.filter((node) => node.type === 'module');
    const others = nodes.filter((node) => node.type !== 'module');

    modules.forEach((node, index) => {
      const angle = (index / Math.max(modules.length, 1)) * Math.PI * 2;
      const x = width / 2 + Math.cos(angle) * Math.min(width, height) * 0.28;
      const y = height / 2 + Math.sin(angle) * Math.min(width, height) * 0.28;
      graphPositions.set(String(node.id), { x, y, node });
    });

    others.forEach((node, index) => {
      const parent = modules.find((moduleNode) => moduleNode.label === node.module || moduleNode.id === node.module);
      const parentPos = parent ? graphPositions.get(String(parent.id)) : undefined;
      const baseAngle = (index / Math.max(others.length, 1)) * Math.PI * 2;
      const radius = parentPos ? 84 + (index % 5) * 16 : Math.min(width, height) * 0.16;
      const x = (parentPos?.x || width / 2) + Math.cos(baseAngle) * radius;
      const y = (parentPos?.y || height / 2) + Math.sin(baseAngle) * radius;
      graphPositions.set(String(node.id), { x, y, node });
    });
  }

  function renderGraph() {
    layoutGraph();
    const edges = (graphData.edges || []).filter((edge) => graphPositions.has(String(edge.source)) && graphPositions.has(String(edge.target)));

    svg.setAttribute('viewBox', `0 0 ${svg.clientWidth || 960} ${svg.clientHeight || 720}`);
    svg.innerHTML = `
      <defs>
        <linearGradient id="studio-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="rgba(96,165,250,0.45)" />
          <stop offset="100%" stop-color="rgba(52,211,153,0.22)" />
        </linearGradient>
      </defs>
      ${edges
        .map((edge) => {
          const source = graphPositions.get(String(edge.source));
          const target = graphPositions.get(String(edge.target));
          return `<line x1="${source?.x}" y1="${source?.y}" x2="${target?.x}" y2="${target?.y}" stroke="url(#studio-edge)" stroke-width="1.4" opacity="0.8" />`;
        })
        .join('')}
      ${Array.from(graphPositions.entries())
        .map(([id, position]) => {
          const node = position.node;
          const color = node.type === 'module'
            ? 'var(--studio-purple)'
            : node.type === 'api'
              ? 'var(--studio-orange)'
              : node.type === 'model'
                ? 'var(--studio-accent)'
                : 'var(--studio-blue)';
          const radius = node.type === 'module' ? 16 : 10;
          const stroke = selectedNode?.id === node.id ? 'var(--studio-accent)' : 'rgba(255,255,255,0.16)';
          return `
            <g class="studio-node" data-node-id="${esc(id)}" style="cursor:pointer">
              <circle cx="${position.x}" cy="${position.y}" r="${radius}" fill="${color}" stroke="${stroke}" stroke-width="2" opacity="0.92" />
              <text x="${position.x}" y="${position.y + radius + 16}" text-anchor="middle" font-size="${node.type === 'module' ? 12 : 10}" fill="var(--studio-text)">${esc(node.label || node.id)}</text>
            </g>
          `;
        })
        .join('')}
    `;

    must('graph-empty').classList.toggle('hidden', graphPositions.size > 0);
    must('welcome').classList.toggle('hidden', graphPositions.size > 0);

    svg.querySelectorAll<SVGGElement>('.studio-node').forEach((group) => {
      const id = group.dataset.nodeId || '';
      const position = graphPositions.get(id);
      if (!position) {
        return;
      }
      listen(group, 'click', () => void showNodeDetail(position.node));
      listen(group, 'mouseenter', (event) => showTooltip(event as MouseEvent, position.node));
      listen(group, 'mouseleave', hideTooltip);
    });
  }

  async function loadGraph() {
    graphData = await fetchJson('/api/studio/graph');
    renderNodeTypes();
    renderGraph();
  }

  async function loadRisks() {
    riskData = await fetchJson('/api/studio/risks');
    renderRisks();
  }

  async function loadSummary() {
    summaryData = await fetchJson('/api/studio/summary');
    updateSummary();
  }

  async function loadSnapshots() {
    snapshotData = await fetchJson('/api/studio/snapshots');
    renderSnapshotTags();
    renderSnapshots();
  }

  async function refreshAll() {
    await Promise.all([loadGraph(), loadRisks(), loadSummary(), loadSnapshots()]);
  }

  async function doScan(target: string) {
    showLoading('Scanning project...', target);
    try {
      await fetchJson('/api/studio/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      await refreshAll();
    } finally {
      hideLoading();
    }
  }

  async function fetchPerspectiveReport(perspective: string) {
    const cached = reportCache.get(perspective);
    if (cached) {
      return cached;
    }
    const report = await fetchJson(`/api/studio/report/${perspective}`);
    reportCache.set(perspective, report);
    return report;
  }

  async function ensureMermaidReady() {
    const w = window as any;
    if (w.mermaid) {
      return w.mermaid;
    }
    if (w.__mermaidPromise) {
      return w.__mermaidPromise;
    }
    w.__mermaidPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
      script.onload = () => resolve((window as any).mermaid);
      script.onerror = () => reject(new Error('Failed to load Mermaid'));
      document.head.appendChild(script);
    });
    return w.__mermaidPromise;
  }

  async function hydrateMermaid() {
    if (!must('report-content').querySelector('.mermaid')) {
      return;
    }
    const mermaid = await ensureMermaidReady();
    mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'default' });
    await mermaid.run({ querySelector: '.mermaid' });
  }

  function markdownToHtml(markdown: string) {
    return esc(markdown || '')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
      .replace(/\n/g, '<br />');
  }

  async function renderCurrentReport() {
    if (!currentReport) {
      return;
    }

    const content = must('report-content');
    if (currentReportMode === 'raw') {
      content.innerHTML = `<div class="studio-report-block"><pre>${esc(JSON.stringify(currentReport, null, 2))}</pre></div>`;
      return;
    }

    if (currentReportMode === 'mermaid') {
      const blocks = (currentReport.sections || [])
        .filter((section: any) => section.visualization?.type === 'mermaid' && section.visualization?.data)
        .map((section: any) => `<h3>${esc(section.heading)}</h3><div class="studio-report-block"><pre class="mermaid">${esc(section.visualization.data)}</pre></div>`)
        .join('');
      content.innerHTML = blocks || '<p>No Mermaid sections available for this perspective.</p>';
      await hydrateMermaid();
      return;
    }

    content.innerHTML = `
      <h1>${esc(currentReport.title || currentPerspective)}</h1>
      <p>${esc(currentReport.summary || '')}</p>
      ${(currentReport.sections || [])
        .map((section: any) => {
          const visualization = section.visualization?.data
            ? `<div class="studio-report-block"><pre>${esc(section.visualization.data)}</pre></div>`
            : '';
          return `<section style="margin-top:24px"><h2>${esc(section.heading)}</h2><div>${markdownToHtml(section.content || '')}</div>${visualization}</section>`;
        })
        .join('')}
    `;
  }

  function connectWs() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/ws`);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'graph:update') {
          graphData = message.payload;
          renderNodeTypes();
          renderGraph();
        }
        if (message.type === 'agent:update') {
          const ids: Record<string, string> = {
            'parser-croc': 'agent-parser',
            'analyzer-croc': 'agent-analyzer',
            'planner-croc': 'agent-planner',
            'tester-croc': 'agent-tester',
            'healer-croc': 'agent-healer',
            'reporter-croc': 'agent-reporter',
          };
          for (const agent of message.payload || []) {
            const dot = ids[agent.id] ? document.getElementById(ids[agent.id]) : null;
            if (dot) {
              dot.className = `agent-status-dot ${agent.status || 'idle'}`;
            }
          }
        }
        if (message.type === 'scan:progress') {
          showLoading(message.payload?.phase || 'Scanning...', message.payload?.detail || '');
        }
      } catch {
        // Ignore malformed message.
      }
    };

    ws.onclose = () => {
      reconnectTimer = window.setTimeout(connectWs, 3000);
    };
  }

  async function handleSnapshotAction(action: string, snapshotId: string, pinned: boolean) {
    if (action === 'restore') {
      await fetchJson(`/api/studio/snapshots/${encodeURIComponent(snapshotId)}/load`, { method: 'POST' });
    }
    if (action === 'pin') {
      await fetchJson(`/api/studio/snapshots/${encodeURIComponent(snapshotId)}/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !pinned }),
      });
    }
    if (action === 'rename') {
      const nextName = window.prompt('Snapshot name');
      if (!nextName) {
        return;
      }
      await fetchJson(`/api/studio/snapshots/${encodeURIComponent(snapshotId)}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nextName }),
      });
    }
    if (action === 'delete') {
      await fetchJson(`/api/studio/snapshots/${encodeURIComponent(snapshotId)}/delete`, { method: 'POST' });
    }
    await loadSnapshots();
  }

  listen(must('scan-btn'), 'click', () => {
    const value = must<HTMLInputElement>('scan-input').value.trim();
    if (value) {
      void doScan(value);
    }
  });
  listen(must('welcome-scan-btn'), 'click', () => {
    const value = must<HTMLInputElement>('welcome-input').value.trim();
    if (value) {
      void doScan(value);
    }
  });
  listen(must('theme-btn'), 'click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    setTheme(next);
  });
  listen(must('panel-btn'), 'click', () => {
    panel.style.display = panel.style.display === 'none' ? '' : 'none';
  });
  listen(must('panel-close-btn'), 'click', () => {
    panel.style.display = 'none';
  });
  listen(must('focus-btn'), 'click', () => {
    if (selectedNode) {
      void showNodeDetail(selectedNode);
    }
  });
  listen(must('snapshot-search'), 'input', (event) => {
    snapshotQuery = (event.target as HTMLInputElement).value;
    renderSnapshots();
  });
  listen(must('snapshot-tag-filters'), 'click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-snapshot-filter]');
    if (!target) {
      return;
    }
    const tag = target.dataset.snapshotFilter || '';
    snapshotFilter = tag === 'all' ? '' : tag;
    renderSnapshotTags();
    renderSnapshots();
  });
  listen(must('snapshot-list'), 'click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-snapshot-action]');
    if (!target) {
      return;
    }
    void handleSnapshotAction(
      target.dataset.snapshotAction || '',
      target.dataset.snapshotId || '',
      target.dataset.pinned === '1',
    );
  });
  listen(must('node-type-list'), 'click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-type]');
    if (!target) {
      return;
    }
    const nextType = target.dataset.type || '';
    activeTypeFilter = activeTypeFilter === nextType ? '' : nextType;
    renderNodeTypes();
    renderGraph();
  });
  listen(must('risk-list'), 'click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-risk-index]');
    if (!target) {
      return;
    }
    showRiskDetail(Number(target.dataset.riskIndex));
  });
  document.querySelectorAll<HTMLElement>('.studio-tab').forEach((tab) => {
    listen(tab, 'click', async () => {
      if (tab.dataset.view === 'office') {
        navigate('/');
        return;
      }
      if (tab.dataset.view === 'graph') {
        showGraphView();
        return;
      }
      const perspective = tab.dataset.perspective;
      if (!perspective) {
        return;
      }
      currentPerspective = perspective;
      currentReport = await fetchPerspectiveReport(perspective);
      document.querySelectorAll<HTMLElement>('.studio-tab').forEach((item) => {
        item.classList.toggle('active', item === tab);
      });
      showReportView();
      await renderCurrentReport();
    });
  });
  document.querySelectorAll<HTMLElement>('[data-mode]').forEach((button) => {
    listen(button, 'click', async () => {
      currentReportMode = button.dataset.mode || 'markdown';
      document.querySelectorAll<HTMLElement>('[data-mode]').forEach((item) => {
        item.classList.toggle('active', item === button);
      });
      await renderCurrentReport();
    });
  });
  listen(must('copy-report-btn'), 'click', async () => {
    const content = must('report-content').innerText;
    await navigator.clipboard.writeText(content);
  });
  listen(window, 'resize', renderGraph);
  listen(document, 'keydown', (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === 'Escape') {
      hideTooltip();
      panel.style.display = 'none';
    }
  });

  setTheme(localStorage.getItem('opencroc-studio-theme') || 'dark');
  panel.style.display = '';
  try {
    await refreshAll();
  } catch {
    must('welcome').classList.remove('hidden');
    must('graph-empty').classList.remove('hidden');
  }
  connectWs();

  return () => {
    listeners.forEach((cleanup) => cleanup());
    listeners.length = 0;
    if (ws) {
      ws.close();
    }
    window.clearTimeout(reconnectTimer);
  };
}
