import { useEffect } from 'react';

const pixelStyles = `
:root {
  --pixel-bg: #0a1220;
  --pixel-panel: rgba(11, 18, 31, 0.86);
  --pixel-card: rgba(19, 30, 50, 0.8);
  --pixel-hover: rgba(34, 51, 82, 0.84);
  --pixel-border: rgba(148, 163, 184, 0.15);
  --pixel-accent: #34d399;
  --pixel-red: #f87171;
  --pixel-orange: #fbbf24;
  --pixel-blue: #60a5fa;
  --pixel-purple: #a78bfa;
  --pixel-text: #e2e8f0;
  --pixel-dim: #94a3b8;
  --pixel-muted: #64748b;
  --pixel-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
}
[data-theme="light"] {
  --pixel-bg: #edf3fb;
  --pixel-panel: rgba(255, 255, 255, 0.88);
  --pixel-card: rgba(248, 250, 252, 0.98);
  --pixel-hover: rgba(226, 232, 240, 0.98);
  --pixel-border: rgba(100, 116, 139, 0.18);
  --pixel-accent: #059669;
  --pixel-red: #dc2626;
  --pixel-orange: #d97706;
  --pixel-blue: #2563eb;
  --pixel-purple: #7c3aed;
  --pixel-text: #0f172a;
  --pixel-dim: #475569;
  --pixel-muted: #94a3b8;
  --pixel-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
}
html, body, #root { width: 100%; height: 100%; }
body {
  margin: 0;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background:
    radial-gradient(circle at top left, rgba(96, 165, 250, 0.08), transparent 34%),
    radial-gradient(circle at bottom right, rgba(52, 211, 153, 0.08), transparent 30%),
    var(--pixel-bg);
  color: var(--pixel-text);
}
.pixel-app {
  display: grid;
  grid-template-columns: 260px 1fr 360px;
  grid-template-rows: 72px 1fr 180px;
  grid-template-areas:
    "header header header"
    "sidebar main panel"
    "office office office";
  gap: 10px;
  height: 100%;
  padding: 10px;
}
.pixel-shell,
.pixel-header,
.pixel-main,
.pixel-panel,
.pixel-office {
  border-radius: 20px;
  border: 1px solid var(--pixel-border);
  background: var(--pixel-panel);
  backdrop-filter: blur(18px);
  box-shadow: var(--pixel-shadow);
}
.pixel-header {
  grid-area: header;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
}
.pixel-logo {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--pixel-accent) 16%, transparent);
  color: var(--pixel-accent);
  font-weight: 700;
}
.pixel-title h1 { margin: 0; font-size: 16px; }
.pixel-title p { margin: 2px 0 0; font-size: 12px; color: var(--pixel-dim); }
.pixel-switch,
.pixel-actions,
.pixel-stats,
.pixel-panel-tabs,
.pixel-kpis { display: flex; gap: 8px; }
.pixel-switch button,
.pixel-btn,
.pixel-tab,
.pixel-small-btn {
  border: 1px solid var(--pixel-border);
  border-radius: 12px;
  background: var(--pixel-card);
  color: var(--pixel-text);
  cursor: pointer;
  transition: 0.2s ease;
  font: inherit;
}
.pixel-switch button,
.pixel-btn,
.pixel-small-btn { padding: 9px 12px; }
.pixel-tab { padding: 8px 10px; flex: 1; }
.pixel-switch button.active,
.pixel-tab.active {
  border-color: color-mix(in srgb, var(--pixel-accent) 36%, var(--pixel-border));
  background: color-mix(in srgb, var(--pixel-accent) 14%, var(--pixel-card));
}
.pixel-btn.primary { background: color-mix(in srgb, var(--pixel-accent) 20%, var(--pixel-card)); }
.pixel-btn.danger { background: color-mix(in srgb, var(--pixel-red) 16%, var(--pixel-card)); }
.pixel-switch button:hover,
.pixel-btn:hover,
.pixel-tab:hover,
.pixel-small-btn:hover,
.pixel-list-item:hover,
.pixel-agent-card:hover { background: var(--pixel-hover); }
.pixel-select {
  border-radius: 12px;
  border: 1px solid var(--pixel-border);
  background: var(--pixel-card);
  color: var(--pixel-text);
  padding: 9px 10px;
}
.pixel-spacer { flex: 1; }
.pixel-stats > div {
  min-width: 62px;
  padding: 7px 10px;
  border-radius: 14px;
  border: 1px solid var(--pixel-border);
  background: var(--pixel-card);
  text-align: center;
}
.pixel-stats .label { font-size: 10px; color: var(--pixel-muted); text-transform: uppercase; }
.pixel-stats .value {
  display: block;
  margin-top: 4px;
  font-size: 17px;
  font-weight: 700;
  color: var(--pixel-accent);
}
.pixel-theme-btn {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  border: 1px solid var(--pixel-border);
  background: var(--pixel-card);
}
.pixel-conn {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--pixel-muted);
}
.pixel-conn.connected { background: var(--pixel-accent); }
.pixel-sidebar {
  grid-area: sidebar;
  overflow: auto;
  padding: 16px;
}
.pixel-sidebar h3 {
  margin: 0 0 10px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--pixel-dim);
}
.pixel-list { display: flex; flex-direction: column; gap: 8px; }
.pixel-list-item,
.pixel-agent-card,
.pixel-file-item {
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--pixel-border);
  background: var(--pixel-card);
}
.pixel-main {
  grid-area: main;
  position: relative;
  overflow: hidden;
}
.pixel-view { position: absolute; inset: 0; }
.pixel-view.hidden { display: none; }
.pixel-graph-canvas { width: 100%; height: 100%; }
.pixel-tooltip {
  position: fixed;
  z-index: 80;
  display: none;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid var(--pixel-border);
  background: rgba(10, 15, 26, 0.94);
  color: #e2e8f0;
  font-size: 12px;
  pointer-events: none;
}
.pixel-tooltip.visible { display: block; }
.pixel-stage {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 24px;
  overflow: hidden;
  background:
    radial-gradient(circle at 20% 18%, rgba(96, 165, 250, 0.14), transparent 24%),
    radial-gradient(circle at 82% 22%, rgba(52, 211, 153, 0.12), transparent 20%),
    linear-gradient(180deg, rgba(17, 24, 39, 0.26), rgba(15, 23, 42, 0.4));
}
.pixel-kpis {
  position: absolute;
  left: 18px;
  top: 18px;
  gap: 10px;
}
.pixel-kpi {
  min-width: 100px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--pixel-border);
  background: rgba(8, 15, 27, 0.72);
}
.pixel-kpi .t { font-size: 11px; color: var(--pixel-dim); }
.pixel-kpi .v {
  margin-top: 5px;
  font-size: 26px;
  font-weight: 700;
  color: var(--pixel-accent);
}
.pixel-kpi.errors .v { color: var(--pixel-red); }
.pixel-kpi.done .v { color: var(--pixel-blue); }
.pixel-agent-layer { position: absolute; inset: 0; }
.pixel-avatar {
  position: absolute;
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  border: 1px solid var(--pixel-border);
  background: color-mix(in srgb, var(--pixel-accent) 12%, var(--pixel-card));
  font-size: 20px;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.18);
}
.pixel-avatar.error,
.pixel-avatar.failed { background: color-mix(in srgb, var(--pixel-red) 14%, var(--pixel-card)); }
.pixel-avatar.testing { background: color-mix(in srgb, var(--pixel-blue) 14%, var(--pixel-card)); }
.pixel-avatar.done,
.pixel-avatar.passed { background: color-mix(in srgb, var(--pixel-accent) 18%, var(--pixel-card)); }
.pixel-label {
  position: absolute;
  min-width: 120px;
  max-width: 160px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid var(--pixel-border);
  background: rgba(8, 15, 27, 0.82);
  font-size: 12px;
  color: var(--pixel-text);
  transform: translateX(-50%);
}
.pixel-label .role,
.pixel-label .task { display: block; color: var(--pixel-dim); font-size: 11px; }
.pixel-bubble {
  position: absolute;
  padding: 7px 10px;
  border-radius: 999px;
  border: 1px solid var(--pixel-border);
  background: rgba(8, 15, 27, 0.88);
  font-size: 11px;
  color: var(--pixel-text);
  animation: pixel-bubble-in 3s ease forwards;
}
@keyframes pixel-bubble-in {
  0% { opacity: 0; transform: translateY(8px); }
  12% { opacity: 1; transform: translateY(0); }
  88% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-6px); }
}
.pixel-panel {
  grid-area: panel;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.pixel-panel-tabs {
  padding: 10px;
  border-bottom: 1px solid var(--pixel-border);
}
.pixel-panel-body { flex: 1; overflow: auto; padding: 12px; }
.pixel-log-entry {
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--pixel-border);
  background: var(--pixel-card);
  margin-bottom: 8px;
  font-size: 12px;
}
.pixel-log-entry .ts {
  display: block;
  margin-bottom: 4px;
  color: var(--pixel-muted);
  font-size: 10px;
}
.pixel-office {
  grid-area: office;
  overflow: auto;
  padding: 14px;
}
.pixel-office-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
}
.pixel-agent-card .role,
.pixel-agent-card .task,
.pixel-file-meta { display: block; color: var(--pixel-dim); font-size: 11px; }
.pixel-progress {
  margin-top: 10px;
  height: 7px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.4);
}
.pixel-progress > span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--pixel-accent), var(--pixel-blue));
}
.pixel-file-preview {
  position: fixed;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(2, 6, 23, 0.44);
  backdrop-filter: blur(10px);
  z-index: 90;
}
.pixel-file-preview.visible { display: flex; }
.pixel-file-dialog {
  width: min(860px, 92vw);
  height: min(680px, 86vh);
  border-radius: 20px;
  border: 1px solid var(--pixel-border);
  background: var(--pixel-panel);
  box-shadow: var(--pixel-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.pixel-file-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--pixel-border);
}
.pixel-file-code {
  flex: 1;
  overflow: auto;
  margin: 0;
  padding: 16px;
  color: var(--pixel-dim);
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
}
.pixel-shortcuts {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 85;
  display: none;
  grid-template-columns: auto auto;
  gap: 4px 12px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid var(--pixel-border);
  background: rgba(8, 15, 27, 0.88);
  color: var(--pixel-dim);
  font-size: 11px;
}
.pixel-shortcuts.visible { display: grid; }
.pixel-shortcuts kbd {
  display: inline-flex;
  min-width: 18px;
  justify-content: center;
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid var(--pixel-border);
  background: var(--pixel-card);
  color: var(--pixel-text);
}
@media (max-width: 1260px) {
  .pixel-app { grid-template-columns: 220px 1fr 320px; }
}
@media (max-width: 1080px) {
  .pixel-app {
    grid-template-columns: 1fr;
    grid-template-rows: 72px 1fr 180px;
    grid-template-areas:
      "header"
      "main"
      "office";
  }
  .pixel-sidebar,
  .pixel-panel { display: none; }
}
`;

export default function PixelPage() {
  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;

    void import('@features/pixel/runtime')
      .then(({ mountPixelRuntime }) => mountPixelRuntime())
      .then((cleanup) => {
        if (cancelled) {
          cleanup();
          return;
        }
        dispose = cleanup;
      });

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  return (
    <>
      <style>{pixelStyles}</style>
      <div className="pixel-app">
        <header className="pixel-header">
          <div className="pixel-logo">OC</div>
          <div className="pixel-title">
            <h1>OpenCroc Studio</h1>
            <p>Pixel Ops Dashboard | Multi-agent runtime monitor</p>
          </div>
          <div className="pixel-switch">
            <button id="view-dashboard" className="active" type="button">Dashboard</button>
            <button id="view-office" type="button">Pixel Office</button>
          </div>
          <div className="pixel-actions">
            <button id="btn-scan" className="pixel-btn primary" type="button">Scan</button>
            <button id="btn-pipeline" className="pixel-btn primary" type="button">Pipeline</button>
            <select id="run-mode" className="pixel-select" defaultValue="auto">
              <option value="auto">Auto</option>
              <option value="reuse">Reuse</option>
              <option value="managed">Managed</option>
            </select>
            <button id="btn-run-tests" className="pixel-btn" type="button">Tests</button>
            <button id="btn-reports" className="pixel-btn" type="button">Reports</button>
            <button id="btn-reset" className="pixel-btn danger" type="button">Reset</button>
          </div>
          <div className="pixel-spacer" />
          <div className="pixel-stats">
            <div><span className="label">Modules</span><span className="value" id="s-mod">-</span></div>
            <div><span className="label">Models</span><span className="value" id="s-mdl">-</span></div>
            <div><span className="label">APIs</span><span className="value" id="s-api">-</span></div>
            <div><span className="label">Tests</span><span className="value" id="s-files">-</span></div>
            <div id="s-results-wrap" style={{ display: 'none' }}><span className="label">Results</span><span className="value" id="s-results">-</span></div>
          </div>
          <button id="theme-toggle" className="pixel-theme-btn" type="button">◐</button>
          <div id="conn-dot" className="pixel-conn" />
        </header>

        <aside className="pixel-shell pixel-sidebar">
          <h3>Modules</h3>
          <div id="mod-list" className="pixel-list" />
          <h3 style={{ marginTop: 16 }}>Agents</h3>
          <div id="agent-sidebar" className="pixel-list" />
        </aside>

        <main className="pixel-main">
          <div id="graph-view" className="pixel-view">
            <canvas id="graph-canvas" className="pixel-graph-canvas" />
          </div>
          <div id="pixel-view" className="pixel-view hidden">
            <div className="pixel-stage">
              <div className="pixel-kpis">
                <div className="pixel-kpi"><div className="t">Working</div><div className="v" id="kpi-working">0</div></div>
                <div className="pixel-kpi errors"><div className="t">Errors</div><div className="v" id="kpi-errors">0</div></div>
                <div className="pixel-kpi done"><div className="t">Done</div><div className="v" id="kpi-done">0</div></div>
              </div>
              <div id="pixel-agent-layer" className="pixel-agent-layer" />
            </div>
          </div>
        </main>

        <aside className="pixel-panel">
          <div className="pixel-panel-tabs">
            <button className="pixel-tab active" data-tab="log" type="button">Log</button>
            <button className="pixel-tab" data-tab="files" type="button">Tests</button>
            <button className="pixel-tab" data-tab="results" type="button">Results</button>
            <button className="pixel-tab" data-tab="reports" type="button">Reports</button>
          </div>
          <div className="pixel-panel-body">
            <div id="log-list" />
            <div id="file-list" style={{ display: 'none' }} />
            <div id="results-panel" style={{ display: 'none' }} />
            <div id="reports-panel" style={{ display: 'none' }} />
          </div>
        </aside>

        <section className="pixel-office">
          <h3 style={{ margin: '0 0 10px', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pixel-dim)' }}>Desk View</h3>
          <div id="croc-office" className="pixel-office-grid" />
        </section>
      </div>

      <div id="tooltip" className="pixel-tooltip" />

      <div id="file-preview" className="pixel-file-preview">
        <div className="pixel-file-dialog">
          <div className="pixel-file-head">
            <strong id="fp-title">file.ts</strong>
            <button id="fp-close" className="pixel-small-btn" type="button">Close</button>
          </div>
          <pre id="fp-code" className="pixel-file-code" />
        </div>
      </div>

      <div id="shortcut-legend" className="pixel-shortcuts">
        <kbd>1</kbd><span>Dashboard</span>
        <kbd>2</kbd><span>Pixel Office</span>
        <kbd>S</kbd><span>Scan</span>
        <kbd>P</kbd><span>Pipeline</span>
        <kbd>T</kbd><span>Run tests</span>
        <kbd>R</kbd><span>Reports</span>
        <kbd>X</kbd><span>Reset</span>
        <kbd>D</kbd><span>Theme</span>
        <kbd>?</kbd><span>Show shortcuts</span>
      </div>
    </>
  );
}
