import { useEffect } from 'react';

const studioStyles = `
:root {
  --studio-bg: #08101d;
  --studio-panel: rgba(11, 19, 34, 0.84);
  --studio-card: rgba(17, 29, 52, 0.76);
  --studio-hover: rgba(31, 48, 79, 0.82);
  --studio-border: rgba(148, 163, 184, 0.16);
  --studio-accent: #34d399;
  --studio-red: #f87171;
  --studio-orange: #fbbf24;
  --studio-blue: #60a5fa;
  --studio-purple: #a78bfa;
  --studio-text: #e2e8f0;
  --studio-dim: #94a3b8;
  --studio-muted: #64748b;
  --studio-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
}

[data-theme="light"] {
  --studio-bg: #eef4fb;
  --studio-panel: rgba(255, 255, 255, 0.88);
  --studio-card: rgba(248, 250, 252, 0.95);
  --studio-hover: rgba(226, 232, 240, 0.95);
  --studio-border: rgba(100, 116, 139, 0.18);
  --studio-accent: #059669;
  --studio-red: #dc2626;
  --studio-orange: #d97706;
  --studio-blue: #2563eb;
  --studio-purple: #7c3aed;
  --studio-text: #0f172a;
  --studio-dim: #475569;
  --studio-muted: #94a3b8;
  --studio-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
}

html, body, #root { width: 100%; height: 100%; }
body {
  margin: 0;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background:
    radial-gradient(circle at top left, rgba(52, 211, 153, 0.08), transparent 32%),
    radial-gradient(circle at top right, rgba(96, 165, 250, 0.08), transparent 30%),
    var(--studio-bg);
  color: var(--studio-text);
}
.studio-app {
  display: grid;
  grid-template-columns: 300px 1fr 360px;
  height: 100%;
  gap: 10px;
  padding: 10px;
}
.studio-shell,
.studio-panel,
.studio-main,
.studio-header,
.studio-bar {
  border: 1px solid var(--studio-border);
  background: var(--studio-panel);
  backdrop-filter: blur(18px);
  box-shadow: var(--studio-shadow);
}
.studio-shell,
.studio-panel,
.studio-main { border-radius: 20px; overflow: hidden; }
.studio-sidebar { display: flex; flex-direction: column; }
.studio-section { padding: 16px; border-bottom: 1px solid var(--studio-border); }
.studio-section:last-child { border-bottom: none; }
.studio-section h3 {
  margin: 0 0 10px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--studio-dim);
}
.studio-input-row,
.studio-actions,
.studio-chip-row,
.studio-header-actions,
.studio-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.studio-input,
.studio-btn,
.studio-chip {
  border-radius: 12px;
  border: 1px solid var(--studio-border);
  font: inherit;
}
.studio-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--studio-card);
  color: var(--studio-text);
}
.studio-btn,
.studio-chip,
.studio-tab,
.snapshot-action {
  cursor: pointer;
  transition: 0.2s ease;
}
.studio-btn,
.studio-chip {
  padding: 9px 14px;
  background: var(--studio-card);
  color: var(--studio-text);
}
.studio-btn:hover,
.studio-chip:hover,
.studio-list-item:hover,
.studio-tab:hover,
.snapshot-action:hover { background: var(--studio-hover); }
.studio-btn.primary {
  background: color-mix(in srgb, var(--studio-accent) 22%, var(--studio-card));
  border-color: color-mix(in srgb, var(--studio-accent) 42%, var(--studio-border));
}
.studio-stat-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.studio-stat {
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--studio-border);
  background: var(--studio-card);
}
.studio-stat-label { font-size: 10px; text-transform: uppercase; color: var(--studio-muted); }
.studio-stat-value { margin-top: 6px; font-size: 22px; font-weight: 700; color: var(--studio-accent); }
.studio-main { display: flex; flex-direction: column; }
.studio-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 10px;
  padding: 10px;
  border-radius: 18px;
}
.studio-tab {
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--studio-border);
  background: var(--studio-card);
  color: var(--studio-dim);
  font-size: 12px;
}
.studio-tab.active {
  color: var(--studio-text);
  border-color: color-mix(in srgb, var(--studio-accent) 38%, var(--studio-border));
  background: color-mix(in srgb, var(--studio-accent) 14%, var(--studio-card));
}
.studio-graph-wrap {
  position: relative;
  flex: 1;
  margin: 0 10px 10px;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid var(--studio-border);
  background:
    radial-gradient(circle at top, rgba(52, 211, 153, 0.08), transparent 42%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.12), transparent),
    var(--studio-card);
}
.studio-welcome,
.studio-loading,
.studio-report-view { position: absolute; inset: 0; }
.studio-welcome,
.studio-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
  padding: 24px;
}
.studio-loading.hidden,
.studio-welcome.hidden,
.studio-report-view.hidden,
.studio-empty.hidden { display: none; }
.studio-hero { font-size: 42px; }
.studio-empty {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  padding: 12px 16px;
  border-radius: 999px;
  border: 1px dashed var(--studio-border);
  background: rgba(15, 23, 42, 0.24);
  color: var(--studio-dim);
}
.studio-graph-canvas { width: 100%; height: 100%; }
.studio-report-view {
  overflow: auto;
  padding: 22px 24px 28px;
  background: color-mix(in srgb, var(--studio-bg) 86%, transparent);
}
.studio-report-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 18px;
}
.studio-chip.active {
  color: var(--studio-text);
  border-color: color-mix(in srgb, var(--studio-accent) 36%, var(--studio-border));
}
.studio-bar {
  display: flex;
  gap: 8px;
  padding: 10px;
  margin: 0 10px 10px;
  border-radius: 18px;
  overflow-x: auto;
}
.agent-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 120px;
  padding: 8px 12px;
  border-radius: 999px;
  background: var(--studio-card);
  border: 1px solid var(--studio-border);
  font-size: 12px;
}
.agent-status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--studio-muted);
}
.agent-status-dot.working,
.agent-status-dot.testing { background: var(--studio-accent); }
.agent-status-dot.error,
.agent-status-dot.failed { background: var(--studio-red); }
.agent-status-dot.thinking { background: var(--studio-purple); }
.studio-panel { display: flex; flex-direction: column; }
.studio-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--studio-border);
}
.studio-panel-body { flex: 1; overflow: auto; padding: 16px; }
.studio-list,
.snapshot-list { display: flex; flex-direction: column; gap: 8px; }
.studio-list-item,
.snapshot-item {
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--studio-border);
  background: var(--studio-card);
}
.studio-list-item.active {
  border-color: color-mix(in srgb, var(--studio-accent) 40%, var(--studio-border));
}
.snapshot-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.snapshot-action {
  padding: 5px 9px;
  border-radius: 999px;
  border: 1px solid var(--studio-border);
  background: transparent;
  color: var(--studio-dim);
  font-size: 11px;
}
.snapshot-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.snapshot-tag {
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--studio-accent) 14%, transparent);
  color: var(--studio-accent);
  font-size: 11px;
}
.studio-tooltip {
  position: fixed;
  z-index: 80;
  display: none;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid var(--studio-border);
  background: rgba(10, 15, 26, 0.94);
  color: #e2e8f0;
  font-size: 12px;
  pointer-events: none;
}
.studio-tooltip.visible { display: block; }
.studio-panel-body h1,
.studio-panel-body h2,
.studio-panel-body h3 { margin: 0 0 12px; }
.studio-panel-body p,
.studio-panel-body li,
.studio-panel-body code,
.studio-panel-body pre { color: var(--studio-dim); line-height: 1.7; }
.studio-panel-body pre,
.studio-report-block {
  border-radius: 14px;
  border: 1px solid var(--studio-border);
  background: var(--studio-card);
  padding: 12px;
  overflow: auto;
}
@media (max-width: 1280px) {
  .studio-app { grid-template-columns: 280px 1fr 320px; }
}
@media (max-width: 1080px) {
  .studio-app { grid-template-columns: 1fr; }
}
`;

export default function StudioPage() {
  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;

    void import('@features/studio/runtime')
      .then(({ mountStudioRuntime }) => mountStudioRuntime())
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
      <style>{studioStyles}</style>
      <div className="studio-app">
        <aside className="studio-shell studio-sidebar">
          <section className="studio-section">
            <h3>Scan Target</h3>
            <div className="studio-input-row">
              <input id="scan-input" className="studio-input" placeholder="./backend or github.com/owner/repo" />
            </div>
            <div className="studio-actions" style={{ marginTop: 10 }}>
              <button id="scan-btn" className="studio-btn primary" type="button">Start Scan</button>
            </div>
          </section>
          <section className="studio-section" id="stats-section">
            <h3>Project Summary</h3>
            <div className="studio-stat-grid">
              <div className="studio-stat"><div className="studio-stat-label">Modules</div><div className="studio-stat-value" id="stat-modules">0</div></div>
              <div className="studio-stat"><div className="studio-stat-label">APIs</div><div className="studio-stat-value" id="stat-apis">0</div></div>
              <div className="studio-stat"><div className="studio-stat-label">Models</div><div className="studio-stat-value" id="stat-models">0</div></div>
              <div className="studio-stat"><div className="studio-stat-label">Risks</div><div className="studio-stat-value" id="stat-risks">0</div></div>
            </div>
          </section>
          <section className="studio-section">
            <h3>Node Types</h3>
            <div id="node-type-list" className="studio-list" />
          </section>
          <section className="studio-section">
            <h3>Snapshots</h3>
            <input id="snapshot-search" className="studio-input" placeholder="Search snapshots" />
            <div id="snapshot-tag-filters" className="studio-chip-row" style={{ marginTop: 10 }} />
            <div id="snapshot-list" className="snapshot-list" style={{ marginTop: 10 }} />
          </section>
          <section className="studio-section" style={{ flex: 1, overflow: 'auto' }}>
            <h3>Risks</h3>
            <div id="risk-list" className="studio-list" />
          </section>
        </aside>

        <main className="studio-main">
          <div className="studio-header">
            <div className="studio-tabs">
              <button className="studio-tab" data-view="office" type="button">3D Office</button>
              <button className="studio-tab active" data-view="graph" type="button">Knowledge Graph</button>
              <button className="studio-tab" data-perspective="developer" type="button">Developer</button>
              <button className="studio-tab" data-perspective="architect" type="button">Architect</button>
              <button className="studio-tab" data-perspective="tester" type="button">Tester</button>
              <button className="studio-tab" data-perspective="product" type="button">Product</button>
              <button className="studio-tab" data-perspective="student" type="button">Student</button>
              <button className="studio-tab" data-perspective="executive" type="button">Executive</button>
            </div>
            <div className="studio-header-actions">
              <button id="focus-btn" className="studio-btn" type="button">Focus Node</button>
              <button id="theme-btn" className="studio-btn" type="button">Theme</button>
              <button id="panel-btn" className="studio-btn" type="button">Toggle Panel</button>
            </div>
          </div>

          <div className="studio-graph-wrap">
            <div id="welcome" className="studio-welcome">
              <div className="studio-hero">OpenCroc</div>
              <h1>Studio Graph Workspace</h1>
              <p>Scan a codebase to populate the knowledge graph, risk list, and perspective reports.</p>
              <div className="studio-input-row" style={{ maxWidth: 560 }}>
                <input id="welcome-input" className="studio-input" placeholder="./backend or github.com/owner/repo" />
                <button id="welcome-scan-btn" className="studio-btn primary" type="button">Analyze</button>
              </div>
            </div>
            <div id="loading" className="studio-loading hidden">
              <div className="studio-hero">Scanning</div>
              <div id="loading-text">Preparing analysis...</div>
              <div id="loading-detail" style={{ color: 'var(--studio-dim)' }} />
            </div>
            <svg id="graph-canvas" className="studio-graph-canvas" />
            <div id="graph-empty" className="studio-empty hidden">No graph yet. Run a scan to begin.</div>
            <div id="report-view" className="studio-report-view hidden">
              <div id="report-toolbar" className="studio-report-toolbar">
                <div className="studio-chip-row">
                  <button className="studio-chip active" data-mode="markdown" type="button">Markdown</button>
                  <button className="studio-chip" data-mode="mermaid" type="button">Mermaid</button>
                  <button className="studio-chip" data-mode="raw" type="button">Raw</button>
                </div>
                <button id="copy-report-btn" className="studio-btn" type="button">Copy</button>
              </div>
              <div id="report-content" />
            </div>
          </div>

          <div className="studio-bar" id="agent-bar">
            <div className="agent-pill"><span className="agent-status-dot idle" id="agent-parser" /><span>Parser</span></div>
            <div className="agent-pill"><span className="agent-status-dot idle" id="agent-analyzer" /><span>Analyzer</span></div>
            <div className="agent-pill"><span className="agent-status-dot idle" id="agent-planner" /><span>Planner</span></div>
            <div className="agent-pill"><span className="agent-status-dot idle" id="agent-tester" /><span>Tester</span></div>
            <div className="agent-pill"><span className="agent-status-dot idle" id="agent-healer" /><span>Healer</span></div>
            <div className="agent-pill"><span className="agent-status-dot idle" id="agent-reporter" /><span>Reporter</span></div>
          </div>
        </main>

        <aside className="studio-panel" id="panel">
          <div className="studio-panel-head">
            <h2 id="panel-title" style={{ margin: 0 }}>Details</h2>
            <button id="panel-close-btn" className="studio-btn" type="button">Close</button>
          </div>
          <div id="panel-body" className="studio-panel-body">
            <p>Select a node, risk, or perspective report to inspect more details.</p>
          </div>
        </aside>
      </div>

      <div id="tooltip" className="studio-tooltip" />
    </>
  );
}
