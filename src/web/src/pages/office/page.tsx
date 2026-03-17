import { useEffect } from 'react';
import '@styles/office.css';

function CrocMark() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="4" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="9" r="2.5" fill="currentColor" />
      <rect x="5" y="2" width="6" height="2" rx="0.5" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

function View3dIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1L14.5 5v6L8 15 1.5 11V5z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 1v14M1.5 5L8 9l6.5-4" stroke="currentColor" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

function GraphIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="4" cy="4" r="2" fill="currentColor" opacity="0.6" />
      <circle cx="12" cy="4" r="2" fill="currentColor" opacity="0.6" />
      <circle cx="8" cy="12" r="2" fill="currentColor" opacity="0.6" />
      <line x1="4" y1="6" x2="8" y2="10" stroke="currentColor" strokeWidth="1" />
      <line x1="12" y1="6" x2="8" y2="10" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg id="theme-icon-dark" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1a7 7 0 100 14 5 5 0 010-14z" fill="currentColor" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg id="theme-icon-light" viewBox="0 0 16 16" fill="none" style={{ display: 'none' }} aria-hidden="true">
      <circle cx="8" cy="8" r="3" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <line x1="8" y1="1" x2="8" y2="3" />
        <line x1="8" y1="13" x2="8" y2="15" />
        <line x1="1" y1="8" x2="3" y2="8" />
        <line x1="13" y1="8" x2="15" y2="8" />
        <line x1="3.05" y1="3.05" x2="4.46" y2="4.46" />
        <line x1="11.54" y1="11.54" x2="12.95" y2="12.95" />
        <line x1="3.05" y1="12.95" x2="4.46" y2="11.54" />
        <line x1="11.54" y1="4.46" x2="12.95" y2="3.05" />
      </g>
    </svg>
  );
}

export default function OfficePage() {
  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;

    void import('@features/office/runtime').then(({ mountOfficeRuntime }) => {
      return mountOfficeRuntime();
    }).then((cleanup) => {
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
      <div className="loading-overlay" id="loading-overlay">
        <div style={{ width: 48, height: 48, opacity: 0.8, color: 'var(--accent)' }}>
          <CrocMark />
        </div>
        <div className="loading-bar">
          <div className="fill" id="loading-fill" />
        </div>
        <div className="loading-text" id="loading-text">
          Initializing 3D engine...
        </div>
      </div>

      <canvas id="three-canvas" />

      <div className="header" id="header">
        <div className="logo">
          <CrocMark />
        </div>
        <div className="title-wrap">
          <h1>OpenCroc Studio</h1>
          <span className="subtitle">3D Ops Dashboard | Real-time Multi-Agent Runtime</span>
        </div>
        <div className="h-divider" />
        <div className="view-switch">
          <button id="view-3d" className="active" type="button">
            <View3dIcon />
            3D Office
          </button>
          <button id="view-graph" type="button">
            <GraphIcon />
            Graph
          </button>
        </div>
        <div className="h-divider" />
        <div className="actions">
          <button className="btn btn-secondary" id="btn-scan" type="button">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 8h12M4 4h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Scan
          </button>
          <button className="btn btn-primary" id="btn-pipeline" type="button">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 8h3l2-4 2 8 2-4h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Pipeline
          </button>
          <div className="run-mode-wrap">
            <select id="run-mode" defaultValue="auto">
              <option value="auto">Auto</option>
              <option value="reuse">Reuse</option>
              <option value="managed">Managed</option>
            </select>
          </div>
          <button className="btn btn-secondary" id="btn-run-tests" type="button">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 2v12l8-6z" fill="currentColor" opacity="0.7" />
            </svg>
            Tests
          </button>
          <button className="btn btn-secondary" id="btn-reports" type="button">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="3" y="1" width="10" height="14" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <line x1="5" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1" opacity="0.5" />
              <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1" opacity="0.5" />
              <line x1="5" y1="11" x2="9" y2="11" stroke="currentColor" strokeWidth="1" opacity="0.5" />
            </svg>
            Reports
          </button>
          <button className="btn btn-danger" id="btn-reset" type="button">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 8a6 6 0 0111.3-2.8M14 8a6 6 0 01-11.3 2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M14 2v4h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Reset
          </button>
        </div>
        <div className="stats">
          <div className="stat-box">
            <span className="stat-label">MODULES</span>
            <span className="stat-value" id="s-mod">0</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">CLASSES</span>
            <span className="stat-value" id="s-mdl">0</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">FUNCS</span>
            <span className="stat-value" id="s-api">0</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">FILES</span>
            <span className="stat-value" id="s-files">-</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">NODES</span>
            <span className="stat-value" id="s-nodes">-</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">RISKS</span>
            <span className="stat-value" id="s-risks">-</span>
          </div>
        </div>
        <div className="header-end">
          <button id="theme-toggle" title="Toggle theme" type="button">
            <MoonIcon />
            <SunIcon />
          </button>
          <div id="conn-dot" title="WebSocket" />
        </div>
      </div>

      <div className="sidebar" id="sidebar">
        <div className="sidebar-header">
          <h3>Modules</h3>
          <button className="sidebar-toggle" id="sidebar-toggle" type="button">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="sidebar-content" id="sidebar-content">
          <div id="mod-list" />
          <div id="agent-sidebar" style={{ marginTop: 12 }} />
        </div>
      </div>

      <div className="right-panel" id="right-panel">
        <div className="panel-tabs">
          <button className="tab active" data-tab="log" type="button">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 3h12M2 7h8M2 11h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Log
          </button>
          <button className="tab" data-tab="files" type="button">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 1h6l4 4v10H3z" stroke="currentColor" strokeWidth="1.2" />
              <path d="M9 1v4h4" stroke="currentColor" strokeWidth="1" opacity="0.5" />
            </svg>
            Files
          </button>
          <button className="tab" data-tab="results" type="button">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <polyline points="2,12 5,6 9,10 14,3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Results
          </button>
          <button className="tab" data-tab="reports" type="button">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <path d="M5 10V7M8 10V5M11 10V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Reports
          </button>
        </div>
        <div className="panel-content" id="log-list" />
        <div className="panel-content hidden" id="file-list" />
        <div className="panel-content hidden" id="results-panel" />
        <div className="panel-content hidden" id="reports-panel" />
      </div>

      <div className="file-preview" id="file-preview">
        <div className="backdrop" id="fp-backdrop" />
        <div className="fp-dialog">
          <div className="fp-header">
            <span className="fp-title" id="fp-title">File Preview</span>
            <button className="fp-close" id="fp-close" type="button">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <pre className="fp-code" id="fp-code" />
        </div>
      </div>

      <div className="tooltip" id="tooltip">
        <div className="tt-name" />
        <div className="tt-module" />
        <div className="tt-type" />
      </div>

      <div className="shortcut-legend" id="shortcut-legend">
        <kbd>1</kbd><span>3D Office</span>
        <kbd>2</kbd><span>Graph View</span>
        <kbd>S</kbd><span>Scan</span>
        <kbd>P</kbd><span>Pipeline</span>
        <kbd>T</kbd><span>Run Tests</span>
        <kbd>R</kbd><span>Reports</span>
        <kbd>X</kbd><span>Reset</span>
        <kbd>D</kbd><span>Dark/Light</span>
        <kbd>?</kbd><span>Shortcuts</span>
        <kbd>Esc</kbd><span>Close</span>
      </div>

      <div className="toast-container" id="toast-container" />
    </>
  );
}
