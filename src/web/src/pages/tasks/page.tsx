import { useEffect } from 'react';

const taskStyles = `
:root {
  --task-bg: #08101d;
  --task-panel: rgba(11, 19, 34, 0.84);
  --task-card: rgba(17, 29, 52, 0.76);
  --task-hover: rgba(31, 48, 79, 0.82);
  --task-border: rgba(148, 163, 184, 0.16);
  --task-accent: #34d399;
  --task-red: #f87171;
  --task-orange: #fbbf24;
  --task-blue: #60a5fa;
  --task-text: #e2e8f0;
  --task-dim: #94a3b8;
  --task-muted: #64748b;
}
html, body, #root { width: 100%; height: 100%; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background:
    radial-gradient(circle at top left, rgba(52, 211, 153, 0.08), transparent 32%),
    radial-gradient(circle at top right, rgba(96, 165, 250, 0.08), transparent 30%),
    var(--task-bg);
  color: var(--task-text);
}
.task-page {
  min-height: 100%;
  padding: 24px;
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  gap: 16px;
}
.task-panel, .task-main {
  border: 1px solid var(--task-border);
  background: var(--task-panel);
  border-radius: 20px;
  overflow: hidden;
}
.task-panel-head, .task-main-head {
  padding: 18px 20px;
  border-bottom: 1px solid var(--task-border);
}
.task-panel-body, .task-main-body {
  padding: 18px 20px;
}
.task-list { display: flex; flex-direction: column; gap: 10px; }
.task-item {
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--task-border);
  background: var(--task-card);
}
.task-item.active { border-color: color-mix(in srgb, var(--task-accent) 40%, var(--task-border)); }
.task-title { font-weight: 700; }
.task-meta { margin-top: 6px; color: var(--task-dim); font-size: 12px; }
.task-progress { margin-top: 10px; height: 8px; border-radius: 999px; overflow: hidden; background: rgba(15, 23, 42, 0.5); }
.task-progress > span { display: block; height: 100%; background: linear-gradient(90deg, var(--task-accent), var(--task-blue)); }
.task-badges { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.badge {
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--task-border);
  background: rgba(15, 23, 42, 0.28);
  font-size: 11px;
  color: var(--task-dim);
}
.badge.running { color: var(--task-accent); }
.badge.failed { color: var(--task-red); }
.badge.waiting { color: var(--task-orange); }
.stage-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.stage-card, .event-card {
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--task-border);
  background: var(--task-card);
}
.summary-card {
  padding: 18px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--task-accent) 22%, var(--task-border));
  background: linear-gradient(180deg, rgba(18, 37, 62, 0.94), rgba(9, 18, 33, 0.92));
}
.summary-card h3 {
  margin: 0 0 12px;
  font-size: 15px;
}
.task-summary {
  color: var(--task-text);
  line-height: 1.8;
  font-size: 14px;
  white-space: normal;
}
.task-summary p {
  margin: 0 0 14px;
}
.task-summary p:last-child {
  margin-bottom: 0;
}
.stage-card h3, .event-card h3 { margin: 0; font-size: 14px; }
.stage-card p, .event-card p { margin: 8px 0 0; color: var(--task-dim); line-height: 1.6; font-size: 13px; }
.stage-status { margin-top: 8px; font-size: 12px; color: var(--task-muted); text-transform: uppercase; }
.stage-status.running { color: var(--task-accent); }
.stage-status.done { color: var(--task-blue); }
.stage-status.failed { color: var(--task-red); }
.event-feed { display: flex; flex-direction: column; gap: 10px; }
.event-card .time { color: var(--task-muted); font-size: 11px; }
.task-main-body section + section { margin-top: 20px; }
.task-empty {
  padding: 24px;
  border-radius: 16px;
  border: 1px dashed var(--task-border);
  color: var(--task-dim);
  text-align: center;
}
@media (max-width: 980px) {
  .task-page { grid-template-columns: 1fr; }
}
`;

type TaskStage = {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  detail?: string;
};

type TaskEvent = {
  type: string;
  message: string;
  progress?: number;
  time: number;
  level?: string;
};

type TaskRecord = {
  id: string;
  kind: string;
  title: string;
  status: 'queued' | 'running' | 'waiting' | 'done' | 'failed';
  progress: number;
  stages: TaskStage[];
  summary?: string;
  waitingFor?: string;
  updatedAt: number;
  events: TaskEvent[];
};

function formatTime(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

export default function TasksPage() {
  useEffect(() => {
    const selectedId = window.location.pathname.split('/').filter(Boolean)[1] || null;
    const taskListEl = document.getElementById('task-list');
    const detailEl = document.getElementById('task-detail');

    let socket: WebSocket | null = null;
    let currentId: string | null = selectedId;
    let tasks: TaskRecord[] = [];

    function renderList(): void {
      if (!taskListEl) return;
      if (tasks.length === 0) {
        taskListEl.innerHTML = '<div class="task-empty">No tasks yet. Start a scan, pipeline, or analysis task to populate this view.</div>';
        return;
      }
      taskListEl.innerHTML = tasks.map((task) => `
        <button class="task-item ${task.id === currentId ? 'active' : ''}" data-task-id="${task.id}" type="button">
          <div class="task-title">${escapeHtml(task.title)}</div>
          <div class="task-meta">${escapeHtml(task.kind)} · ${escapeHtml(task.status)} · updated ${escapeHtml(formatTime(task.updatedAt))}</div>
          <div class="task-progress"><span style="width:${task.progress}%"></span></div>
          <div class="task-badges">
            <span class="badge ${task.status}">${task.progress}%</span>
            ${task.waitingFor ? `<span class="badge waiting">waiting: ${escapeHtml(task.waitingFor)}</span>` : ''}
          </div>
        </button>
      `).join('');

      taskListEl.querySelectorAll('[data-task-id]').forEach((node) => {
        node.addEventListener('click', () => {
          const taskId = (node as HTMLElement).dataset.taskId || null;
          if (!taskId) return;
          currentId = taskId;
          window.history.replaceState({}, '', `/tasks/${taskId}`);
          renderList();
          renderDetail();
        });
      });
    }

    function renderDetail(): void {
      if (!detailEl) return;
      const task = tasks.find((item) => item.id === currentId) || tasks[0];
      if (!task) {
        detailEl.innerHTML = '<div class="task-empty">No task selected.</div>';
        return;
      }
      currentId = task.id;
      detailEl.innerHTML = `
        <section>
          <h2 style="margin:0 0 10px">${escapeHtml(task.title)}</h2>
          <div class="task-meta">Task ID: ${escapeHtml(task.id)} · ${escapeHtml(task.kind)} · ${escapeHtml(task.status)}</div>
          <div class="task-progress" style="margin-top:14px"><span style="width:${task.progress}%"></span></div>
          <div class="task-badges">
            <span class="badge ${task.status}">progress ${task.progress}%</span>
            ${task.waitingFor ? `<span class="badge waiting">waiting: ${escapeHtml(task.waitingFor)}</span>` : ''}
          </div>
        </section>
        ${task.summary ? `
        <section>
          <div class="summary-card">
            <h3>结果摘要</h3>
            <div class="task-summary">${renderMultiline(task.summary)}</div>
          </div>
        </section>
        ` : ''}
        <section>
          <h2 style="margin:0 0 10px">Stages</h2>
          <div class="stage-grid">
            ${task.stages.map((stage) => `
              <div class="stage-card">
                <h3>${escapeHtml(stage.label)}</h3>
                <div class="stage-status ${stage.status}">${escapeHtml(stage.status)}</div>
                <p>${escapeHtml(stage.detail || 'No detail yet.')}</p>
              </div>
            `).join('')}
          </div>
        </section>
        <section>
          <h2 style="margin:0 0 10px">Event Feed</h2>
          <div class="event-feed">
            ${(task.events || []).slice().reverse().map((event) => `
              <div class="event-card">
                <h3>${escapeHtml(event.message)}</h3>
                <div class="time">${escapeHtml(formatTime(event.time))} · ${escapeHtml(event.type)}${typeof event.progress === 'number' ? ` · ${event.progress}%` : ''}</div>
                <p>${escapeHtml(event.level || 'info')}</p>
              </div>
            `).join('')}
          </div>
        </section>
      `;
    }

    async function refreshTasks(): Promise<void> {
      const response = await fetch('/api/tasks?limit=30');
      const data = await response.json();
      tasks = data.tasks || [];
      renderList();
      renderDetail();
    }

    function escapeHtml(input: string): string {
      return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function renderMultiline(input: string): string {
      return escapeHtml(input)
        .split(/\n{2,}/)
        .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
        .join('');
    }

    void refreshTasks();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type !== 'task:update') return;
        const task = message.payload as TaskRecord;
        const index = tasks.findIndex((item) => item.id === task.id);
        if (index >= 0) tasks[index] = task;
        else tasks.unshift(task);
        tasks = [...tasks].sort((a, b) => b.updatedAt - a.updatedAt);
        renderList();
        renderDetail();
      } catch {
        // Ignore malformed events.
      }
    };

    return () => {
      socket?.close();
    };
  }, []);

  return (
    <>
      <style>{taskStyles}</style>
      <div className="task-page">
        <aside className="task-panel">
          <div className="task-panel-head">
            <h1 style={{ margin: 0, fontSize: 18 }}>OpenCroc Tasks</h1>
            <div style={{ marginTop: 6, color: 'var(--task-dim)', fontSize: 13 }}>
              Live execution progress for scans, pipelines, analysis, and future Feishu-bridged tasks.
            </div>
          </div>
          <div className="task-panel-body">
            <div id="task-list" className="task-list" />
          </div>
        </aside>
        <main className="task-main">
          <div className="task-main-head">
            <h1 style={{ margin: 0, fontSize: 18 }}>Task Detail</h1>
            <div style={{ marginTop: 6, color: 'var(--task-dim)', fontSize: 13 }}>
              Track progress, stage status, and execution events in one place.
            </div>
          </div>
          <div className="task-main-body" id="task-detail">
            <div className="task-empty">Loading tasks…</div>
          </div>
        </main>
      </div>
    </>
  );
}
