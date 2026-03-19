import { startTransition, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { getEdgeTypeLabel, getKindLabel, getStageKeyLabel, getStageLabel, getStatusLabel } from '@features/tasks/labels';
import PlanetInterior from '@features/tasks/interior/PlanetInterior';
import PlanetInteriorScene3D from '@features/tasks/interior/PlanetInteriorScene3D';
import PlanetUniverse from '@features/tasks/universe/PlanetUniverse';
import type {
  PlanetEdge,
  PlanetInteriorData,
  PlanetInteriorResponse,
  PlanetListResponse,
  PlanetOverviewItem,
  TaskRecord,
} from '@features/tasks/types';
import { getCurrentAppPath, navigate, subscribeNavigation } from '@shared/navigation';

const taskStyles = `
:root {
  --task-bg: #f6f1e8;
  --task-panel: rgba(255, 251, 246, 0.88);
  --task-card: rgba(255, 255, 255, 0.8);
  --task-hover: rgba(248, 242, 233, 0.96);
  --task-border: rgba(100, 83, 61, 0.14);
  --task-accent: #2e6b59;
  --task-red: #b95a4a;
  --task-orange: #b78034;
  --task-blue: #56748f;
  --task-purple: #7b6a89;
  --task-text: #2d261f;
  --task-dim: #6f6254;
  --task-muted: #9a8a77;
  --task-shadow: 0 20px 60px rgba(84, 67, 48, 0.12);
}
html, body, #root { width: 100%; height: 100%; }
body {
  margin: 0;
  font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", "PingFang SC", "Hiragino Sans GB", serif;
  background:
    radial-gradient(circle at top left, rgba(46, 107, 89, 0.08), transparent 30%),
    radial-gradient(circle at top right, rgba(86, 116, 143, 0.08), transparent 28%),
    radial-gradient(circle at bottom right, rgba(183, 128, 52, 0.08), transparent 24%),
    var(--task-bg);
  color: var(--task-text);
}
.task-page {
  min-height: 100%;
  padding: 24px;
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  grid-template-rows: minmax(360px, 420px) minmax(0, 1fr);
  grid-template-areas:
    "universe universe"
    "panel main";
  gap: 16px;
}
.task-shell,
.task-universe-shell {
  border: 1px solid var(--task-border);
  background: var(--task-panel);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: var(--task-shadow);
  backdrop-filter: blur(18px);
}
.task-universe-shell {
  grid-area: universe;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  min-height: 0;
}
.task-universe-head,
.task-panel-head,
.task-main-head {
  padding: 18px 20px;
  border-bottom: 1px solid var(--task-border);
}
.task-universe-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.task-universe-body {
  flex: 1;
  min-height: 0;
  padding: 12px 16px 16px;
}
.task-universe-svg {
  width: 100%;
  height: 100%;
  display: block;
}
.task-universe-aside {
  border-left: 1px solid var(--task-border);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: linear-gradient(180deg, rgba(10, 16, 28, 0.36), rgba(10, 16, 28, 0.08));
}
.task-legend,
.task-kpi-list,
.task-active-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.task-legend-item,
.task-active-item,
.task-kpi {
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid var(--task-border);
  background: var(--task-card);
}
.task-active-item {
  width: 100%;
  font: inherit;
}
.task-legend-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: var(--task-dim);
}
.task-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 8px;
  vertical-align: middle;
}
.task-kpi .value {
  display: block;
  margin-top: 6px;
  font-size: 24px;
  font-weight: 700;
  color: var(--task-text);
}
.task-kpi .label,
.task-active-item .meta {
  color: var(--task-dim);
  font-size: 12px;
}
.task-tool-card {
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid var(--task-border);
  background: var(--task-card);
}
.task-tool-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.task-tool-btn,
.task-tool-select {
  border: 1px solid var(--task-border);
  border-radius: 12px;
  background: rgba(255, 251, 246, 0.9);
  color: var(--task-text);
  font: inherit;
}
.task-tool-btn {
  padding: 8px 10px;
  cursor: pointer;
}
.task-tool-btn.active {
  border-color: color-mix(in srgb, var(--task-orange) 48%, var(--task-border));
  background: rgba(251, 191, 36, 0.18);
}
.task-view-switch {
  display: inline-flex;
  gap: 8px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(248, 242, 233, 0.88);
  border: 1px solid var(--task-border);
}
.task-tool-btn.danger {
  border-color: color-mix(in srgb, var(--task-red) 40%, var(--task-border));
  background: rgba(248, 113, 113, 0.14);
}
.task-tool-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.task-tool-select {
  padding: 8px 10px;
}
.task-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 11px;
  border-radius: 999px;
  border: 1px solid rgba(100, 83, 61, 0.14);
  background: rgba(255, 251, 246, 0.92);
  color: var(--task-dim);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}
.task-status-badge.warn {
  border-color: rgba(183, 128, 52, 0.28);
  background: rgba(183, 128, 52, 0.14);
  color: #8b6327;
}
.task-status-badge.info {
  border-color: rgba(86, 116, 143, 0.24);
  background: rgba(86, 116, 143, 0.12);
  color: #56748f;
}
.task-edge-reason {
  margin-top: 8px;
  color: var(--task-dim);
  font-size: 12px;
  line-height: 1.6;
}
.task-shell {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.task-panel { grid-area: panel; }
.task-main { grid-area: main; }
.task-panel-body,
.task-main-body {
  padding: 18px 20px;
  overflow: auto;
  min-height: 0;
}
.task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.task-item {
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--task-border);
  background: var(--task-card);
  cursor: pointer;
  transition: 0.18s ease;
  color: inherit;
  text-align: left;
}
.task-item:hover,
.task-item.active {
  background: var(--task-hover);
  border-color: color-mix(in srgb, var(--task-accent) 42%, var(--task-border));
}
.task-title { font-weight: 700; }
.task-meta { margin-top: 6px; color: var(--task-dim); font-size: 12px; line-height: 1.5; }
.task-progress {
  margin-top: 10px;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(151, 130, 105, 0.16);
}
.task-progress > span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--task-accent), var(--task-blue));
}
.task-badges {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}
.badge {
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--task-border);
  background: rgba(248, 242, 233, 0.9);
  font-size: 11px;
  color: var(--task-dim);
}
.badge.running { color: var(--task-accent); }
.badge.failed { color: var(--task-red); }
.badge.waiting { color: var(--task-orange); }
.badge.done { color: var(--task-blue); }
.badge.archived { color: var(--task-muted); }
.task-planet {
  cursor: pointer;
  transition: transform 0.18s ease;
  transform-origin: center;
}
.task-planet:hover { transform: scale(1.03); }
.task-planet.running { animation: task-planet-pulse 2.1s ease-in-out infinite; }
.task-planet.waiting { animation: task-planet-blink 2.6s ease-in-out infinite; }
.task-planet-title {
  fill: #2d261f;
  font-size: 12px;
  font-weight: 700;
}
.task-planet-kind,
.task-planet-meta {
  fill: var(--task-dim);
  font-size: 11px;
  letter-spacing: 0.04em;
}
.task-planet-kind {
  fill: rgba(92, 76, 56, 0.9);
  font-weight: 600;
}
.task-detail-stack section + section { margin-top: 22px; }
.summary-card,
.stage-card,
.event-card,
.task-empty {
  border-radius: 18px;
  border: 1px solid var(--task-border);
  background: var(--task-card);
}
.summary-card {
  padding: 18px;
  border-color: color-mix(in srgb, var(--task-accent) 20%, var(--task-border));
  background: linear-gradient(180deg, rgba(255, 252, 247, 0.98), rgba(248, 242, 233, 0.96));
}
.summary-card h3,
.stage-card h3,
.event-card h3 {
  margin: 0;
  font-size: 14px;
}
.task-summary {
  margin-top: 12px;
  color: var(--task-text);
  line-height: 1.8;
  font-size: 14px;
}
.task-summary p { margin: 0 0 14px; }
.task-summary p:last-child { margin-bottom: 0; }
.stage-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.stage-card,
.event-card,
.task-empty {
  padding: 14px;
}
.stage-card p,
.event-card p {
  margin: 8px 0 0;
  color: var(--task-dim);
  line-height: 1.6;
  font-size: 13px;
}
.stage-status {
  margin-top: 8px;
  font-size: 12px;
  color: var(--task-muted);
  text-transform: uppercase;
}
.stage-status.running { color: var(--task-accent); }
.stage-status.done { color: var(--task-blue); }
.stage-status.failed { color: var(--task-red); }
.event-feed {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.event-card .time {
  color: var(--task-muted);
  font-size: 11px;
  margin-top: 6px;
}
.task-empty {
  color: var(--task-dim);
  text-align: center;
}
.planet-interior-shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.planet-hero-card,
.planet-visual-card,
.planet-summary-card,
.planet-agents-card,
.planet-timeline-card,
.planet-stage-card {
  border-radius: 20px;
  border: 1px solid var(--task-border);
  background: var(--task-card);
}
.planet-hero-card {
  padding: 18px 20px;
  background:
    radial-gradient(circle at top right, rgba(86, 116, 143, 0.12), transparent 32%),
    linear-gradient(180deg, rgba(255, 252, 247, 0.98), rgba(248, 242, 233, 0.95));
}
.planet-hero-kind {
  color: var(--task-dim);
  font-size: 11px;
  letter-spacing: 0.12em;
  font-weight: 700;
}
.planet-hero-card h2 {
  margin: 10px 0 0;
  font-size: 24px;
}
.pixel-office-interior {
  --pixel-office-bg: rgba(247, 242, 232, 0.98);
  --pixel-office-card: rgba(255, 251, 244, 0.96);
  --pixel-office-edge: rgba(76, 57, 35, 0.18);
  --pixel-office-shadow: 8px 8px 0 rgba(143, 116, 82, 0.14);
}
.pixel-office-panel {
  border-radius: 10px;
  border: 2px solid var(--pixel-office-edge);
  background: var(--pixel-office-card);
  box-shadow: var(--pixel-office-shadow);
}
.pixel-office-interior .planet-hero-card,
.pixel-office-interior .planet-summary-card,
.pixel-office-interior .planet-agents-card,
.pixel-office-interior .planet-timeline-card,
.pixel-office-interior .planet-stage-card,
.pixel-office-interior .planet-visual-card {
  border-radius: 10px;
  border-width: 2px;
  box-shadow: var(--pixel-office-shadow);
}
.pixel-office-interior .planet-hero-card {
  background:
    linear-gradient(180deg, rgba(255, 250, 240, 0.98), rgba(242, 233, 220, 0.98));
}
.pixel-office-interior .planet-hero-kind,
.pixel-office-interior .planet-card-head span,
.pixel-office-interior .planet-stage-top span,
.pixel-office-interior .planet-agent-top span,
.pixel-office-interior .planet-agent-meta,
.pixel-office-interior .planet-event-meta,
.pixel-office-interior .planet-stage-status,
.pixel-office-interior .planet-hero-meta {
  font-family: "SFMono-Regular", "Menlo", "Monaco", "Courier New", monospace;
  letter-spacing: 0.02em;
}
.pixel-office-interior .task-summary,
.pixel-office-interior .planet-stage-card p,
.pixel-office-interior .planet-agent-card p,
.pixel-office-interior .planet-event-message {
  line-height: 1.7;
}
.planet-hero-meta {
  margin-top: 8px;
  color: var(--task-dim);
  line-height: 1.6;
  font-size: 13px;
}
.planet-interior-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(300px, 0.85fr);
  gap: 16px;
}
.planet-visual-stack,
.planet-side-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.planet-visual-card {
  padding: 12px;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(86, 116, 143, 0.08), transparent 30%),
    radial-gradient(circle at bottom right, rgba(46, 107, 89, 0.08), transparent 24%),
    rgba(255, 252, 247, 0.96);
}
.planet-visual-card-3d {
  padding: 0;
  background:
    radial-gradient(circle at 18% 18%, rgba(86, 116, 143, 0.12), transparent 24%),
    radial-gradient(circle at 82% 16%, rgba(183, 128, 52, 0.1), transparent 24%),
    radial-gradient(circle at 50% 78%, rgba(46, 107, 89, 0.08), transparent 30%),
    linear-gradient(180deg, rgba(255, 252, 247, 0.98), rgba(246, 239, 229, 0.98));
}
.planet-interior-svg {
  width: 100%;
  height: auto;
  display: block;
}
.planet-interior-scene {
  position: relative;
  min-height: 540px;
}
.planet-interior-canvas {
  width: 100%;
  height: 540px;
  display: block;
}
.planet-interior-pixel-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.planet-interior-pixel-layer img {
  position: absolute;
  image-rendering: pixelated;
  user-select: none;
  pointer-events: none;
}
.planet-pixel-bg {
  left: 50%;
  top: 32px;
  width: min(560px, 84%);
  transform: translateX(-50%);
  opacity: 0.18;
}
.planet-pixel-walls {
  right: 20px;
  top: 18px;
  width: 180px;
  opacity: 0.52;
}
.planet-pixel-server {
  left: 22px;
  bottom: 64px;
  width: 86px;
  opacity: 0.86;
}
.planet-pixel-coffee {
  right: 36px;
  bottom: 70px;
  width: 72px;
  opacity: 0.82;
}
.planet-pixel-desk {
  left: 50%;
  bottom: 8px;
  width: min(420px, 74%);
  transform: translateX(-50%);
  opacity: 0.92;
}
.planet-interior-scene-overlay {
  position: absolute;
  inset: 18px auto auto 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: min(420px, calc(100% - 36px));
  pointer-events: none;
}
.planet-interior-badge {
  align-self: flex-start;
  padding: 7px 12px;
  border-radius: 8px;
  border: 2px solid rgba(76, 57, 35, 0.16);
  background: rgba(255, 248, 238, 0.92);
  color: #6f6254;
  font-size: 12px;
  font-family: "SFMono-Regular", "Menlo", "Monaco", "Courier New", monospace;
}
.planet-interior-hud {
  border-radius: 10px;
  border: 2px solid rgba(76, 57, 35, 0.16);
  background: rgba(255, 250, 242, 0.84);
  box-shadow: 8px 8px 0 rgba(143, 116, 82, 0.12);
  backdrop-filter: blur(18px);
  padding: 14px 16px;
}
.planet-interior-hud strong {
  display: block;
  color: var(--task-text);
  font-size: 16px;
}
.planet-interior-hud span {
  display: block;
  color: var(--task-dim);
  font-size: 13px;
  line-height: 1.7;
}
.planet-interior-hud span + span {
  margin-top: 6px;
}
.planet-interior-toolbar {
  position: absolute;
  right: 18px;
  bottom: 18px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.planet-interior-toolbar button {
  border: 2px solid rgba(76, 57, 35, 0.16);
  border-radius: 8px;
  background: rgba(255, 251, 246, 0.92);
  color: var(--task-text);
  font: inherit;
  padding: 8px 12px;
  cursor: pointer;
  box-shadow: 4px 4px 0 rgba(143, 116, 82, 0.1);
  font-family: "SFMono-Regular", "Menlo", "Monaco", "Courier New", monospace;
}
.planet-stage-strip {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.planet-stage-card {
  padding: 14px;
}
.planet-stage-card.active {
  border-color: color-mix(in srgb, var(--task-orange) 38%, var(--task-border));
  background: linear-gradient(180deg, rgba(255, 250, 242, 0.98), rgba(249, 240, 225, 0.92));
}
.pixel-office-interior .planet-stage-card.active {
  border-color: rgba(183, 128, 52, 0.46);
  box-shadow: 8px 8px 0 rgba(183, 128, 52, 0.12);
}
.planet-stage-top,
.planet-agent-top,
.planet-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.planet-card-head {
  padding: 16px 18px 0;
}
.planet-card-head h3 {
  margin: 0;
  font-size: 14px;
}
.planet-card-head span,
.planet-stage-top span,
.planet-agent-top span {
  color: var(--task-dim);
  font-size: 12px;
}
.planet-stage-card strong,
.planet-agent-card strong {
  font-size: 14px;
}
.planet-stage-status {
  margin-top: 8px;
  font-size: 11px;
  color: var(--task-muted);
  text-transform: uppercase;
}
.planet-stage-status.running { color: var(--task-orange); }
.planet-stage-status.done { color: var(--task-accent); }
.planet-stage-status.failed { color: var(--task-red); }
.planet-stage-card p,
.planet-agent-card p {
  margin: 8px 0 0;
  color: var(--task-dim);
  line-height: 1.6;
  font-size: 13px;
}
.planet-summary-card .task-summary {
  padding: 14px 18px 18px;
}
.planet-agents-card,
.planet-timeline-card {
  overflow: hidden;
}
.planet-agent-list,
.planet-event-feed {
  padding: 14px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.planet-agent-card,
.planet-event-item {
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid var(--task-border);
  background: rgba(248, 242, 233, 0.72);
}
.planet-agent-card.working,
.planet-agent-card.thinking {
  border-color: color-mix(in srgb, var(--task-orange) 34%, var(--task-border));
}
.planet-agent-card.done {
  border-color: color-mix(in srgb, var(--task-accent) 32%, var(--task-border));
}
.planet-agent-card.error {
  border-color: color-mix(in srgb, var(--task-red) 38%, var(--task-border));
}
.planet-agent-card.active {
  border-color: color-mix(in srgb, var(--task-blue) 36%, var(--task-border));
  background: rgba(255, 251, 246, 0.94);
}
.planet-agent-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.planet-agent-pixel {
  width: 26px;
  height: 26px;
  image-rendering: pixelated;
  flex: 0 0 auto;
}
.planet-agent-meta,
.planet-event-meta {
  margin-top: 6px;
  color: var(--task-dim);
  font-size: 12px;
  line-height: 1.5;
}
.planet-event-item {
  display: flex;
  gap: 12px;
}
.planet-event-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-top: 6px;
  flex: 0 0 auto;
  background: var(--task-blue);
}
.planet-event-dot.warn { background: var(--task-orange); }
.planet-event-dot.error { background: var(--task-red); }
.planet-event-copy {
  min-width: 0;
}
.planet-event-message {
  font-size: 13px;
  line-height: 1.6;
}
@keyframes task-planet-pulse {
  0%, 100% { opacity: 0.88; }
  50% { opacity: 1; }
}
@keyframes task-planet-blink {
  0%, 100% { opacity: 0.78; }
  50% { opacity: 1; }
}
@media (max-width: 1180px) {
  .task-page {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(340px, 420px) auto auto;
    grid-template-areas:
      "universe"
      "panel"
      "main";
  }
  .task-universe-shell {
    grid-template-columns: 1fr;
  }
  .task-universe-aside {
    border-left: 0;
    border-top: 1px solid var(--task-border);
  }
}
@media (max-width: 760px) {
  .task-page { padding: 14px; }
  .stage-grid { grid-template-columns: 1fr; }
  .planet-stage-strip,
  .planet-interior-grid {
    grid-template-columns: 1fr;
  }
  .planet-interior-scene,
  .planet-interior-canvas {
    min-height: 420px;
    height: 420px;
  }
  .planet-pixel-walls {
    width: 130px;
    right: 14px;
  }
}
`;

function formatTime(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function sortTasks(tasks: TaskRecord[]): TaskRecord[] {
  return [...tasks].sort((left, right) => right.updatedAt - left.updatedAt);
}

function parseSelectedTaskId(pathname: string): string | null {
  const [pathOnly] = pathname.split('?');
  const parts = pathOnly.split('/').filter(Boolean);
  if (parts[0] !== 'tasks') return null;
  return parts[1] ?? null;
}

function computeFallbackComplexity(task: TaskRecord): number {
  let score = 0;
  score += Math.min(task.stages.length / 3, 2);
  score += Math.min(task.title.length / 32, 2);
  score += Math.min(task.events.length / 8, 2);
  const durationMs = (task.completedAt ?? Date.now()) - task.createdAt;
  score += Math.min(durationMs / (5 * 60 * 1000), 2);
  score += ['chat', 'analysis', 'pipeline', 'report', 'execute', 'test'].includes(task.kind) ? 1.5 : 0.75;
  return Math.max(1, Math.min(10, Math.round(score)));
}

function complexityToRadius(complexity: number): number {
  return Math.round(28 + (complexity - 1) * (34 / 9));
}

function fallbackPlanetFromTask(task: TaskRecord, index: number): PlanetOverviewItem {
  const complexity = computeFallbackComplexity(task);
  const angle = index * 2.399963229728653;
  const distance = 90 + index * 34;
  const currentStage = task.stages.find((stage) => stage.key === task.currentStageKey);

  return {
    id: task.id,
    title: task.title,
    sourceText: task.sourceText,
    summary: task.summary,
    kind: task.kind,
    status: task.status,
    progress: task.progress,
    complexity,
    radius: complexityToRadius(complexity),
    position: {
      x: 420 + Math.cos(angle) * distance,
      y: 290 + Math.sin(angle) * distance,
    },
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
    currentStageKey: task.currentStageKey,
    currentStageLabel: currentStage?.label,
    waitingFor: task.waitingFor,
    taskUrl: `/tasks/${task.id}`,
    tags: [task.kind, ...(task.currentStageKey ? [task.currentStageKey] : [])],
  };
}

function buildFallbackPlanets(tasks: TaskRecord[]): PlanetOverviewItem[] {
  return sortTasks(tasks).map((task, index) => fallbackPlanetFromTask(task, index));
}

function edgeKey(edge: Pick<PlanetEdge, 'fromPlanetId' | 'toPlanetId'>): string {
  return `${edge.fromPlanetId}::${edge.toPlanetId}`;
}

function getPlanetLabel(planets: PlanetOverviewItem[], planetId: string): string {
  return planets.find((planet) => planet.id === planetId)?.title ?? planetId;
}

function upsertTask(tasks: TaskRecord[], nextTask: TaskRecord): TaskRecord[] {
  const index = tasks.findIndex((task) => task.id === nextTask.id);
  if (index === -1) return sortTasks([nextTask, ...tasks]);
  const next = [...tasks];
  next[index] = nextTask;
  return sortTasks(next);
}

function upsertPlanet(planets: PlanetOverviewItem[], task: TaskRecord): PlanetOverviewItem[] {
  const index = planets.findIndex((planet) => planet.id === task.id);
  if (index === -1) {
    return [fallbackPlanetFromTask(task, planets.length), ...planets];
  }

  const next = [...planets];
  const current = next[index];
  const currentStage = task.stages.find((stage) => stage.key === task.currentStageKey);
  next[index] = {
    ...current,
    title: task.title,
    sourceText: task.sourceText,
    summary: task.summary,
    kind: task.kind,
    status: current.status === 'archived' ? 'archived' : task.status,
    progress: task.progress,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
    currentStageKey: task.currentStageKey,
    currentStageLabel: currentStage?.label,
    waitingFor: task.waitingFor,
  };

  return [...next].sort((left, right) => right.updatedAt - left.updatedAt);
}

function clampStageProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildFallbackInterior(task: TaskRecord): PlanetInteriorData {
  const totalStages = Math.max(task.stages.length, 1);
  const arcSize = 360 / totalStages;
  const gap = Math.min(7, arcSize * 0.12);
  const stages = task.stages.map((stage, index) => {
    const rawStart = index * arcSize;
    const rawEnd = rawStart + arcSize;
    const arcStart = rawStart + gap / 2;
    const arcEnd = rawEnd - gap / 2;

    let progress = 0;
    if (stage.status === 'done' || stage.status === 'failed') {
      progress = 100;
    } else if (stage.status === 'running') {
      const stageSpan = 100 / totalStages;
      const stageStart = index * stageSpan;
      progress = clampStageProgress(((task.progress - stageStart) / stageSpan) * 100);
    }

    return {
      key: stage.key,
      label: stage.label,
      status: stage.status,
      progress,
      detail: stage.detail,
      startedAt: stage.startedAt,
      completedAt: stage.completedAt,
      arcStart,
      arcEnd,
      midAngle: (arcStart + arcEnd) / 2,
    };
  });

  const currentStage = stages.find((stage) => stage.key === task.currentStageKey) ?? stages.find((stage) => stage.status === 'running') ?? stages[0];
  const agents = currentStage ? [{
    id: `fallback-agent-${task.id}`,
    name: '任务引擎',
    role: 'runtime',
    sprite: 'runtime',
    status: task.status === 'failed'
      ? 'error'
      : task.status === 'done'
        ? 'done'
        : task.status === 'running' || task.status === 'waiting'
          ? 'working'
          : 'idle',
    stageKey: currentStage.key,
    stageLabel: currentStage.label,
    progress: typeof currentStage.progress === 'number' ? currentStage.progress : task.progress,
    currentAction: currentStage.detail || task.summary || '当前使用本地降级详情视图。',
    angle: currentStage.midAngle,
  }] : [];

  return {
    stages,
    agents,
    events: task.events.slice(-30).reverse(),
    summary: task.summary,
    waitingFor: task.waitingFor,
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export default function TasksPage() {
  const [interiorViewMode, setInteriorViewMode] = useState<'3d' | '2d'>('3d');
  const pathname = useSyncExternalStore(subscribeNavigation, getCurrentAppPath, () => '/tasks');
  const selectedTaskId = parseSelectedTaskId(pathname);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [planets, setPlanets] = useState<PlanetOverviewItem[]>([]);
  const [edges, setEdges] = useState<PlanetEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [planetApiFallback, setPlanetApiFallback] = useState(false);
  const [interior, setInterior] = useState<PlanetInteriorData | null>(null);
  const [interiorTaskId, setInteriorTaskId] = useState<string | null>(null);
  const [interiorLoading, setInteriorLoading] = useState(false);
  const [interiorError, setInteriorError] = useState<string | null>(null);
  const [interiorFallback, setInteriorFallback] = useState(false);
  const [agentRefreshTick, setAgentRefreshTick] = useState(0);
  const [edgeRefreshTick, setEdgeRefreshTick] = useState(0);
  const [linkMode, setLinkMode] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [linkType, setLinkType] = useState<PlanetEdge['type']>('related-to');
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
  const [edgeBusy, setEdgeBusy] = useState(false);
  const [edgeError, setEdgeError] = useState<string | null>(null);

  async function refreshUniverse(): Promise<void> {
    try {
      const planetData = await fetchJson<PlanetListResponse>('/api/planets?limit=50');
      setPlanets((planetData.planets || []).sort((left, right) => right.updatedAt - left.updatedAt));
      setEdges(planetData.edges || []);
      setPlanetApiFallback(false);
      setSelectedEdgeKey((current) => {
        if (!current) return current;
        return (planetData.edges || []).some((edge) => edgeKey(edge) === current) ? current : null;
      });
      return;
    } catch {
      setPlanets(buildFallbackPlanets(tasks));
      setEdges([]);
      setPlanetApiFallback(true);
      setSelectedEdgeKey(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData(): Promise<void> {
      setLoading(true);
      setError(null);
      setEdgeError(null);

      try {
        const taskData = await fetchJson<{ ok: true; tasks: TaskRecord[] }>('/api/tasks?limit=30');

        if (cancelled) return;

        let nextTasks = sortTasks(taskData.tasks || []);
        if (selectedTaskId && !nextTasks.some((task) => task.id === selectedTaskId)) {
          try {
            const selected = await fetchJson<{ ok: true; task: TaskRecord }>(`/api/tasks/${selectedTaskId}`);
            if (!cancelled) {
              nextTasks = upsertTask(nextTasks, selected.task);
            }
          } catch {
            // Keep the overview loaded even if the specific task no longer exists.
          }
        }

        if (cancelled) return;
        setTasks(nextTasks);

        try {
          const planetData = await fetchJson<PlanetListResponse>('/api/planets?limit=50');
          if (cancelled) return;
          setPlanets((planetData.planets || []).sort((left, right) => right.updatedAt - left.updatedAt));
          setEdges(planetData.edges || []);
          setPlanetApiFallback(false);
        } catch {
          if (cancelled) return;
          setPlanets(buildFallbackPlanets(nextTasks));
          setEdges([]);
          setPlanetApiFallback(true);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (!cancelled) {
          setHasLoaded(true);
          setLoading(false);
        }
      }
    }

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoaded || !selectedTaskId || tasks.some((task) => task.id === selectedTaskId)) {
      return;
    }

    let cancelled = false;

    async function loadSelectedTask(): Promise<void> {
      try {
        const selected = await fetchJson<{ ok: true; task: TaskRecord }>(`/api/tasks/${selectedTaskId}`);
        if (!cancelled) {
          setTasks((current) => upsertTask(current, selected.task));
          setPlanets((current) => upsertPlanet(current, selected.task));
        }
      } catch {
        // Ignore missing historical task ids.
      }
    }

    void loadSelectedTask();

    return () => {
      cancelled = true;
    };
  }, [hasLoaded, selectedTaskId, tasks]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'task:update') {
          const nextTask = message.payload as TaskRecord;
          startTransition(() => {
            setTasks((current) => upsertTask(current, nextTask));
            setPlanets((current) => upsertPlanet(current, nextTask));
            setEdgeRefreshTick((current) => current + 1);
          });
          return;
        }

        if (message.type === 'agent:update' || message.type === 'agent:assigned' || message.type === 'agent:released') {
          startTransition(() => {
            setAgentRefreshTick((current) => current + 1);
          });
        }
      } catch {
        // Ignore malformed events.
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;

    const timer = window.setTimeout(() => {
      void refreshUniverse().catch((loadError) => {
        setEdgeError(loadError instanceof Error ? loadError.message : String(loadError));
      });
    }, 420);

    return () => {
      window.clearTimeout(timer);
    };
  }, [edgeRefreshTick, hasLoaded]);

  const selectedTask = useMemo(() => {
    if (selectedTaskId) {
      return tasks.find((task) => task.id === selectedTaskId) ?? null;
    }
    return tasks[0] ?? null;
  }, [selectedTaskId, tasks]);

  const stats = useMemo(() => ({
    total: planets.length,
    running: planets.filter((planet) => planet.status === 'running').length,
    waiting: planets.filter((planet) => planet.status === 'waiting').length,
    done: planets.filter((planet) => planet.status === 'done').length,
  }), [planets]);

  const activePlanets = useMemo(
    () => planets
      .filter((planet) => planet.status === 'running' || planet.status === 'waiting')
      .slice(0, 4),
    [planets],
  );

  async function handlePlanetClick(taskId: string): Promise<void> {
    if (!linkMode) {
      navigate(`/tasks/${taskId}`);
      return;
    }

    setEdgeError(null);
    setSelectedEdgeKey(null);

    if (!linkSourceId) {
      setLinkSourceId(taskId);
      return;
    }

    if (linkSourceId === taskId) {
      setLinkSourceId(null);
      return;
    }

    setEdgeBusy(true);
    try {
      await fetchJson<{ ok: true; edge: PlanetEdge }>('/api/planets/edges', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          from: linkSourceId,
          to: taskId,
          type: linkType,
        }),
      });
    } catch (actionError) {
      setEdgeError(actionError instanceof Error ? actionError.message : String(actionError));
      setEdgeBusy(false);
      return;
    }

    try {
      await refreshUniverse();
      setSelectedEdgeKey(edgeKey({ fromPlanetId: linkSourceId, toPlanetId: taskId }));
      setLinkSourceId(null);
    } catch (loadError) {
      setEdgeError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setEdgeBusy(false);
    }
  }

  async function handleDeleteSelectedEdge(): Promise<void> {
    if (!selectedEdge || selectedEdge.source !== 'manual') return;

    setEdgeBusy(true);
    setEdgeError(null);
    try {
      const response = await fetch(`/api/planets/edges/${selectedEdge.fromPlanetId}/${selectedEdge.toPlanetId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      await refreshUniverse();
      setSelectedEdgeKey(null);
    } catch (actionError) {
      setEdgeError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setEdgeBusy(false);
    }
  }

  async function handleUpdateSelectedEdge(): Promise<void> {
    if (!selectedEdge || selectedEdge.source !== 'manual') return;

    setEdgeBusy(true);
    setEdgeError(null);
    try {
      await fetchJson<{ ok: true; edge: PlanetEdge }>(`/api/planets/edges/${selectedEdge.fromPlanetId}/${selectedEdge.toPlanetId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: linkType }),
      });
      await refreshUniverse();
      setSelectedEdgeKey(edgeKey(selectedEdge));
    } catch (actionError) {
      setEdgeError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setEdgeBusy(false);
    }
  }

  const selectedPlanet = useMemo(() => {
    if (!selectedTask) return null;
    return planets.find((planet) => planet.id === selectedTask.id) ?? fallbackPlanetFromTask(selectedTask, 0);
  }, [planets, selectedTask]);

  const selectedEdge = useMemo(
    () => edges.find((edge) => edgeKey(edge) === selectedEdgeKey) ?? null,
    [edges, selectedEdgeKey],
  );

  useEffect(() => {
    if (selectedEdge?.source === 'manual') {
      setLinkType(selectedEdge.type);
    }
  }, [selectedEdge]);

  useEffect(() => {
    if (!planetApiFallback) return;
    setLinkMode(false);
    setLinkSourceId(null);
  }, [planetApiFallback]);

  useEffect(() => {
    if (!selectedTask) {
      setInterior(null);
      setInteriorError(null);
      setInteriorLoading(false);
      setInteriorFallback(false);
      return;
    }

    let cancelled = false;

    async function loadInterior(): Promise<void> {
      if (interiorTaskId !== selectedTask.id) {
        setInterior(null);
        setInteriorTaskId(selectedTask.id);
      }
      setInteriorLoading(true);
      setInteriorError(null);

      try {
        const data = await fetchJson<PlanetInteriorResponse>(`/api/planets/${selectedTask.id}/interior`);
        if (!cancelled) {
          setInterior(data.interior);
          setInteriorTaskId(selectedTask.id);
          setInteriorFallback(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setInterior(buildFallbackInterior(selectedTask));
          setInteriorTaskId(selectedTask.id);
          setInteriorError(null);
          setInteriorFallback(true);
        }
      } finally {
        if (!cancelled) {
          setInteriorLoading(false);
        }
      }
    }

    void loadInterior();

    return () => {
      cancelled = true;
    };
  }, [
    selectedTask?.id,
    selectedTask?.updatedAt,
    selectedTask?.status === 'running' || selectedTask?.status === 'waiting' ? agentRefreshTick : 0,
  ]);

  return (
    <>
      <style>{taskStyles}</style>
      <div className="task-page">
        <section className="task-universe-shell">
          <div className="task-universe-main">
            <div className="task-universe-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 18 }}>OpenCroc 星球宇宙</h1>
                <div style={{ marginTop: 6, color: 'var(--task-dim)', fontSize: 13 }}>
                  每个复杂任务都会沉淀成一颗星球。执行中的星球会发光，待确认的星球会轻微闪动，已完成的结果会留在这里形成长期记忆。
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {planetApiFallback ? (
                  <span className="task-status-badge warn">仅任务接口</span>
                ) : null}
                <button
                  type="button"
                  className="task-tool-btn"
                  onClick={() => navigate(selectedTask ? `/universe?focus=${encodeURIComponent(selectedTask.id)}` : '/universe')}
                >
                  全屏查看
                </button>
              </div>
            </div>
            <div className="task-universe-body">
              {loading && planets.length === 0 ? (
                <div className="task-empty">正在加载星球宇宙…</div>
              ) : (
                <PlanetUniverse
                  planets={planets}
                  edges={edges}
                  selectedId={selectedTask?.id ?? null}
                  selectedEdgeKey={selectedEdgeKey}
                  linkSourceId={linkSourceId}
                  onPlanetClick={(taskId) => { void handlePlanetClick(taskId); }}
                  onEdgeClick={(edge) => setSelectedEdgeKey(edgeKey(edge))}
                />
              )}
            </div>
          </div>
          <aside className="task-universe-aside">
            <div className="task-kpi-list">
              <div className="task-kpi">
                <span className="label">星球总数</span>
                <span className="value">{stats.total}</span>
              </div>
              <div className="task-kpi">
                <span className="label">执行中</span>
                <span className="value" style={{ color: 'var(--task-orange)' }}>{stats.running}</span>
              </div>
              <div className="task-kpi">
                <span className="label">待确认</span>
                <span className="value" style={{ color: 'var(--task-purple)' }}>{stats.waiting}</span>
              </div>
              <div className="task-kpi">
                <span className="label">已完成</span>
                <span className="value" style={{ color: 'var(--task-accent)' }}>{stats.done}</span>
              </div>
            </div>

            <div className="task-legend">
              <div className="task-legend-item"><span><span className="task-dot" style={{ background: '#ef9f27' }} /> 执行中</span><span>发光 + 进度环</span></div>
              <div className="task-legend-item"><span><span className="task-dot" style={{ background: '#8b82f4' }} /> 待确认</span><span>需要你介入</span></div>
              <div className="task-legend-item"><span><span className="task-dot" style={{ background: '#34d399' }} /> 已完成</span><span>结果已沉淀</span></div>
              <div className="task-legend-item"><span><span className="task-dot" style={{ background: '#f87171' }} /> 失败</span><span>需要恢复处理</span></div>
            </div>

            <div className="task-tool-card">
              <div style={{ fontWeight: 700, marginBottom: 10 }}>星球关系</div>
              {planetApiFallback ? (
                <div className="task-edge-reason">
                  当前服务尚未部署 Planet API。关系编辑已禁用，待 `/api/planets` 上线后恢复。
                </div>
              ) : null}
              <div className="task-tool-row">
                <button
                  type="button"
                  className={`task-tool-btn ${linkMode ? 'active' : ''}`}
                  onClick={() => {
                    setLinkMode((current) => {
                      const next = !current;
                      if (!next) {
                        setLinkSourceId(null);
                      }
                      return next;
                    });
                    setSelectedEdgeKey(null);
                    setEdgeError(null);
                  }}
                  disabled={planetApiFallback}
                >
                  {linkMode ? '退出连线模式' : '创建连线'}
                </button>
                <select
                  className="task-tool-select"
                  value={linkType}
                  onChange={(event) => setLinkType(event.target.value as PlanetEdge['type'])}
                  disabled={!linkMode || planetApiFallback}
                >
                  <option value="related-to">{getEdgeTypeLabel('related-to')}</option>
                  <option value="depends-on">{getEdgeTypeLabel('depends-on')}</option>
                  <option value="supersedes">{getEdgeTypeLabel('supersedes')}</option>
                </select>
              </div>
              <div className="task-edge-reason">
                {planetApiFallback
                  ? '当前处于降级模式，本次部署中不可用星球关系和自动依赖推断。'
                  : linkMode
                  ? (linkSourceId
                    ? `已锁定起点：${planets.find((planet) => planet.id === linkSourceId)?.title || linkSourceId}。再点击另一颗星球即可建立“${getEdgeTypeLabel(linkType)}”关系。`
                    : '连线模式已开启。先点一颗星球作为起点，再点另一颗作为终点。')
                  : '系统会根据任务文本、时间顺序、任务类型和共享路径自动推断关系。'}
              </div>
              {selectedEdge ? (
                <>
                  <div className="task-edge-reason">
                    已选关系：{getPlanetLabel(planets, selectedEdge.fromPlanetId)} → {getPlanetLabel(planets, selectedEdge.toPlanetId)} · {getEdgeTypeLabel(selectedEdge.type)} · {selectedEdge.source === 'manual' ? '手动' : '自动'}
                  </div>
                  {selectedEdge.reason ? (
                    <div className="task-edge-reason">{selectedEdge.reason}</div>
                  ) : null}
                  <div className="task-tool-row" style={{ marginTop: 10 }}>
                    {selectedEdge.source === 'manual' ? (
                      <>
                        <button
                          type="button"
                          className="task-tool-btn"
                          onClick={() => { void handleUpdateSelectedEdge(); }}
                          disabled={edgeBusy || linkType === selectedEdge.type}
                        >
                          更新手动关系
                        </button>
                        <button
                          type="button"
                          className="task-tool-btn danger"
                          onClick={() => { void handleDeleteSelectedEdge(); }}
                          disabled={edgeBusy}
                        >
                          删除手动关系
                        </button>
                      </>
                    ) : (
                      <span className="task-edge-reason">自动关系当前仅支持查看。</span>
                    )}
                  </div>
                </>
              ) : null}
              {edgeError ? <div className="task-edge-reason" style={{ color: 'var(--task-red)' }}>{edgeError}</div> : null}
            </div>

            <div className="task-active-list">
              {activePlanets.length > 0 ? activePlanets.map((planet) => (
                <button
                  key={planet.id}
                  type="button"
                  className="task-active-item"
                  style={{ color: 'inherit', textAlign: 'left', cursor: 'pointer', background: 'var(--task-card)' }}
                  onClick={() => navigate(`/tasks/${planet.id}`)}
                >
                  <div style={{ fontWeight: 700 }}>{planet.title}</div>
                  <div className="meta">
                    {getStatusLabel(planet.status)} · {planet.progress}% · {planet.currentStageLabel ? getStageLabel(planet.currentStageLabel, planet.currentStageKey) : getKindLabel(planet.kind)}
                  </div>
                </button>
              )) : (
                <div className="task-empty">当前没有活跃星球。</div>
              )}
            </div>
          </aside>
        </section>

        <aside className="task-shell task-panel">
          <div className="task-panel-head">
            <h1 style={{ margin: 0, fontSize: 18 }}>任务流</h1>
            <div style={{ marginTop: 6, color: 'var(--task-dim)', fontSize: 13 }}>
              列表视图仍然保留，方便快速浏览、复制信息和在降级模式下继续导航。
            </div>
          </div>
          <div className="task-panel-body">
            {error ? <div className="task-empty">任务加载失败：{error}</div> : null}
            {!error && tasks.length === 0 && !loading ? (
              <div className="task-empty">还没有任务。发起一次扫描、流水线或飞书复杂请求后，这里就会出现记录。</div>
            ) : null}
            <div className="task-list">
              {tasks.map((task) => (
                <button
                  key={task.id}
                  className={`task-item ${task.id === selectedTask?.id ? 'active' : ''}`}
                  type="button"
                  onClick={() => navigate(`/tasks/${task.id}`)}
                >
                  <div className="task-title">{task.title}</div>
                  <div className="task-meta">
                    {getKindLabel(task.kind)} · {getStatusLabel(task.status)} · 更新于 {formatTime(task.updatedAt)}
                    {task.currentStageKey ? ` · 阶段 ${getStageKeyLabel(task.currentStageKey)}` : ''}
                  </div>
                  <div className="task-progress"><span style={{ width: `${task.progress}%` }} /></div>
                  <div className="task-badges">
                    <span className={`badge ${task.status}`}>{task.progress}%</span>
                    {task.waitingFor ? <span className="badge waiting">等待：{task.waitingFor}</span> : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="task-shell task-main">
          <div className="task-main-head">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 18 }}>星球内部</h1>
                <div style={{ marginTop: 6, color: 'var(--task-dim)', fontSize: 13 }}>
                  {interiorViewMode === '3d'
                    ? '这里展开的是当前星球的像素办公室：核心工位、阶段轨道、执行工位，以及实时事件时间线。'
                    : '这里展开的是当前星球的内部结构：阶段环、执行工位，以及实时事件时间线。'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <div className="task-view-switch">
                  <button
                    type="button"
                    className={`task-tool-btn ${interiorViewMode === '3d' ? 'active' : ''}`}
                    onClick={() => setInteriorViewMode('3d')}
                  >
                    像素办公室
                  </button>
                  <button
                    type="button"
                    className={`task-tool-btn ${interiorViewMode === '2d' ? 'active' : ''}`}
                    onClick={() => setInteriorViewMode('2d')}
                  >
                    2D 环图
                  </button>
                </div>
                {interiorFallback ? (
                  <span className="task-status-badge info">本地详情</span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="task-main-body">
            {selectedTask && selectedPlanet ? (
              interior && interiorTaskId === selectedTask.id && !interiorError ? (
                interiorViewMode === '3d' ? (
                  <PlanetInteriorScene3D
                    planet={selectedPlanet}
                    interior={interior}
                    formatTime={formatTime}
                  />
                ) : (
                  <PlanetInterior
                    planet={selectedPlanet}
                    interior={interior}
                    formatTime={formatTime}
                  />
                )
              ) : interiorLoading ? (
                <div className="task-empty">正在加载星球内部详情…</div>
              ) : (
                <div className="task-empty">
                  星球内部详情加载失败{interiorError ? `：${interiorError}` : '。'}
                </div>
              )
            ) : (
              <div className="task-empty">{loading ? '正在加载任务…' : '还没有选中任务。'}</div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
