import { startTransition, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import {
  getAgentStatusLabel,
  getEdgeTypeLabel,
  getKindLabel,
  getRoleLabel,
  getStageKeyLabel,
  getStageLabel,
  getStatusLabel,
} from '@features/tasks/labels';
import PlanetInterior from '@features/tasks/interior/PlanetInterior';
import PlanetInteriorScene3D from '@features/tasks/interior/PlanetInteriorScene3D';
import PlanetUniverse, { PLANET_UNIVERSE_VIEW_BOX, type PlanetUniverseViewport } from '@features/tasks/universe/PlanetUniverse';
import type {
  PlanetEdge,
  PlanetInteriorData,
  PlanetInteriorResponse,
  PlanetListResponse,
  PlanetOverviewItem,
  TaskRecord,
} from '@features/tasks/types';
import { getCurrentAppPath, navigate, subscribeNavigation } from '@shared/navigation';
import { shouldPrefer2D, supportsWebGL } from '@shared/platform';

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
  min-height: 100dvh;
  height: 100dvh;
  padding: 24px;
  display: grid;
  grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);
  grid-template-rows: clamp(278px, 35dvh, 340px) minmax(0, 1fr);
  grid-template-areas:
    "universe universe"
    "panel main";
  gap: 14px;
  max-width: 1560px;
  margin: 0 auto;
  box-sizing: border-box;
  overflow: hidden;
}
.task-detail-page {
  min-height: 100%;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1480px;
  margin: 0 auto;
}
.task-detail-topbar {
  position: sticky;
  top: 14px;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border-radius: 18px;
  border: 1px solid var(--task-border);
  background: rgba(255, 251, 246, 0.84);
  box-shadow: 0 18px 52px rgba(84, 67, 48, 0.08);
  backdrop-filter: blur(18px);
}
.task-detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(300px, 0.85fr);
  gap: 16px;
}
.task-detail-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.task-detail-back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.task-detail-hero {
  padding: 18px 20px;
  background:
    radial-gradient(circle at top left, rgba(46, 107, 89, 0.12), transparent 30%),
    radial-gradient(circle at top right, rgba(86, 116, 143, 0.1), transparent 28%),
    linear-gradient(180deg, rgba(255, 252, 247, 0.98), rgba(248, 242, 233, 0.95));
}
.task-detail-hero h1 {
  margin: 10px 0 0;
  font-size: 28px;
  line-height: 1.25;
}
.task-detail-meta {
  margin-top: 10px;
  color: var(--task-dim);
  font-size: 13px;
  line-height: 1.7;
}
.task-detail-copy {
  margin-top: 14px;
  color: var(--task-text);
  line-height: 1.8;
  font-size: 14px;
}
.task-detail-copy p {
  margin: 0;
}
.task-detail-main .task-main-body {
  padding: 18px;
}
.task-detail-side .task-panel-body,
.task-detail-side .task-main-body {
  padding: 16px 18px 18px;
}
 .task-detail-tasklist {
	  display: flex;
	  flex-direction: column;
	  gap: 10px;
	}
	.task-agent-list {
	  display: flex;
	  flex-direction: column;
	  gap: 10px;
	}
	.task-agent-card {
	  padding: 12px;
	  border-radius: 14px;
	  border: 1px solid var(--task-border);
	  background: var(--task-card);
	}
	.task-agent-head {
	  display: flex;
	  align-items: baseline;
	  justify-content: space-between;
	  gap: 10px;
	  flex-wrap: wrap;
	}
	.task-agent-name {
	  font-weight: 800;
	  font-size: 14px;
	  line-height: 1.4;
	}
	.task-agent-meta {
	  margin-top: 6px;
	  color: var(--task-dim);
	  font-size: 12px;
	  line-height: 1.5;
	}
	.task-agent-hint {
	  margin-top: 8px;
	  color: var(--task-text);
	  font-size: 13px;
	  line-height: 1.6;
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
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.95fr) 360px;
  min-height: 0;
  background:
    radial-gradient(circle at left top, rgba(46, 107, 89, 0.12), transparent 34%),
    radial-gradient(circle at 82% 22%, rgba(86, 116, 143, 0.12), transparent 24%),
    linear-gradient(180deg, rgba(255, 252, 247, 0.96), rgba(247, 240, 230, 0.92));
}
.task-universe-head,
.task-panel-head,
.task-main-head {
  padding: 16px 18px;
  border-bottom: 1px solid var(--task-border);
}
.task-universe-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
}
.task-universe-body {
  flex: 1;
  min-height: 0;
  padding: 0;
  min-width: 0;
  border-radius: 22px;
  overflow: hidden;
  border: 1px solid rgba(100, 83, 61, 0.12);
  background:
    radial-gradient(circle at 16% 18%, rgba(46, 107, 89, 0.12), transparent 24%),
    radial-gradient(circle at 80% 26%, rgba(86, 116, 143, 0.14), transparent 28%),
    linear-gradient(180deg, rgba(253, 250, 245, 0.96), rgba(240, 232, 220, 0.84));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
}
.task-universe-svg {
  width: 100%;
  height: 100%;
  display: block;
}
.task-overview-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.task-overview-kicker {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--task-blue);
}
.task-overview-title {
  margin: 0;
  font-size: 24px;
  line-height: 1.12;
}
.task-overview-lede {
  margin-top: 2px;
  color: var(--task-dim);
  font-size: 12px;
  line-height: 1.6;
  max-width: 760px;
}
.task-overview-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.task-overview-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--task-border);
  background: rgba(255, 255, 255, 0.72);
  color: var(--task-dim);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}
.task-overview-pill strong {
  color: var(--task-text);
  font-size: 13px;
}
.task-overview-actions {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}
.task-overview-side {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.task-overview-side-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.task-overview-side .task-overview-copy {
  gap: 6px;
}
.task-overview-side .task-overview-title {
  font-size: 22px;
}
.task-overview-side .task-overview-lede {
  max-width: none;
}
.task-overview-side .task-overview-actions {
  justify-content: flex-start;
  flex-shrink: 0;
}
.task-universe-aside {
  border-left: 1px solid var(--task-border);
  padding: 12px;
  display: grid;
  grid-template-rows: auto auto minmax(112px, 0.8fr) minmax(148px, 1fr);
  gap: 10px;
  min-height: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(247, 240, 230, 0.78));
  overflow: hidden;
}
.task-legend,
.task-active-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid var(--task-border);
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 10px 26px rgba(84, 67, 48, 0.06);
}
.task-active-list {
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
}
.task-active-list::before {
  content: "活跃星球";
  display: block;
  margin-bottom: 2px;
  font-size: 13px;
  font-weight: 700;
  color: var(--task-text);
}
.task-legend {
  display: none;
}
.task-kpi-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.task-legend-item,
.task-active-item,
.task-kpi {
  padding: 10px 11px;
  border-radius: 16px;
  border: 1px solid var(--task-border);
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 10px 26px rgba(84, 67, 48, 0.06);
}
.task-active-item {
  width: 100%;
  font: inherit;
  position: relative;
  text-align: left;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}
.task-active-item::before {
  content: "";
  position: absolute;
  left: 10px;
  top: 10px;
  bottom: 10px;
  width: 4px;
  border-radius: 999px;
  background: rgba(154, 138, 119, 0.5);
  opacity: 0.9;
}
.task-active-item[data-status="running"]::before {
  background: color-mix(in srgb, var(--task-orange) 72%, rgba(255, 255, 255, 0.3));
}
.task-active-item[data-status="waiting"]::before {
  background: color-mix(in srgb, var(--task-purple) 72%, rgba(255, 255, 255, 0.3));
}
.task-active-item[data-status="done"]::before {
  background: color-mix(in srgb, var(--task-accent) 70%, rgba(255, 255, 255, 0.3));
}
.task-active-item[data-status="failed"]::before {
  background: color-mix(in srgb, var(--task-red) 74%, rgba(255, 255, 255, 0.3));
}
.task-active-item:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--task-blue) 28%, var(--task-border));
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 18px 44px rgba(84, 67, 48, 0.1);
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
  font-size: 21px;
  font-weight: 700;
  color: var(--task-text);
  line-height: 1.1;
}
.task-kpi .label,
.task-active-item .meta {
  color: var(--task-dim);
  font-size: 12px;
}
.task-kpi .hint {
  display: block;
  margin-top: 3px;
  color: var(--task-muted);
  font-size: 11px;
}
.task-aside-card {
  padding: 14px;
  border-radius: 18px;
  border: 1px solid var(--task-border);
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 10px 26px rgba(84, 67, 48, 0.06);
}
.task-aside-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.task-aside-card-head h3 {
  margin: 0;
  font-size: 13px;
}
.task-aside-meta {
  margin-top: 6px;
  color: var(--task-dim);
  font-size: 12px;
  line-height: 1.6;
}
.task-tool-card {
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid var(--task-border);
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 10px 26px rgba(84, 67, 48, 0.06);
  min-height: 0;
  overflow: auto;
}
.task-tool-card-title {
  font-weight: 700;
  margin-bottom: 10px;
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
.task-panel,
.task-main {
  min-height: 0;
}
.task-panel { grid-area: panel; }
.task-main { grid-area: main; }
.task-panel-body,
.task-main-body {
  flex: 1 1 auto;
  padding: 14px 16px 16px;
  overflow: auto;
  min-height: 0;
}
.task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.task-item {
  position: relative;
  padding: 12px 12px 12px 22px;
  border-radius: 16px;
  border: 1px solid var(--task-border);
  background: var(--task-card);
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease;
  color: inherit;
  text-align: left;
  box-shadow: 0 12px 32px rgba(84, 67, 48, 0.06);
}
.task-item::before {
  content: "";
  position: absolute;
  left: 10px;
  top: 12px;
  bottom: 12px;
  width: 4px;
  border-radius: 999px;
  background: rgba(154, 138, 119, 0.5);
  opacity: 0.9;
}
.task-item[data-status="running"]::before {
  background: color-mix(in srgb, var(--task-orange) 72%, rgba(255, 255, 255, 0.3));
}
.task-item[data-status="waiting"]::before {
  background: color-mix(in srgb, var(--task-purple) 72%, rgba(255, 255, 255, 0.3));
}
.task-item[data-status="done"]::before {
  background: color-mix(in srgb, var(--task-accent) 70%, rgba(255, 255, 255, 0.3));
}
.task-item[data-status="failed"]::before {
  background: color-mix(in srgb, var(--task-red) 74%, rgba(255, 255, 255, 0.3));
}
.task-item:hover,
.task-item.active {
  transform: translateY(-1px);
  background: var(--task-hover);
  border-color: color-mix(in srgb, var(--task-accent) 36%, var(--task-border));
  box-shadow: 0 20px 52px rgba(84, 67, 48, 0.12);
}
.task-title {
  font-weight: 850;
  font-size: 14px;
  line-height: 1.45;
}
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
.badge.running {
  border-color: color-mix(in srgb, var(--task-accent) 22%, var(--task-border));
  background: rgba(46, 107, 89, 0.08);
}
.badge.waiting {
  border-color: color-mix(in srgb, var(--task-orange) 22%, var(--task-border));
  background: rgba(183, 128, 52, 0.1);
}
.badge.done {
  border-color: color-mix(in srgb, var(--task-blue) 22%, var(--task-border));
  background: rgba(86, 116, 143, 0.1);
}
.badge.failed {
  border-color: color-mix(in srgb, var(--task-red) 22%, var(--task-border));
  background: rgba(185, 90, 74, 0.08);
}
.badge.archived {
  background: rgba(151, 130, 105, 0.08);
}
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
.task-detail-hero[data-status="running"] {
  border-color: color-mix(in srgb, var(--task-accent) 26%, var(--task-border));
}
.task-detail-hero[data-status="waiting"] {
  border-color: color-mix(in srgb, var(--task-orange) 26%, var(--task-border));
}
.task-detail-hero[data-status="done"] {
  border-color: color-mix(in srgb, var(--task-blue) 26%, var(--task-border));
}
.task-detail-hero[data-status="failed"] {
  border-color: color-mix(in srgb, var(--task-red) 26%, var(--task-border));
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
  min-height: 100%;
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
  grid-template-columns: minmax(0, 1.02fr) minmax(360px, 0.98fr);
  gap: 16px;
  align-items: start;
  min-height: 0;
}
.planet-visual-stack,
.planet-side-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.planet-visual-card {
  padding: 8px;
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
  max-width: 720px;
  margin: 0 auto;
}
.planet-interior-scene {
  position: relative;
  min-height: 380px;
}
.planet-interior-canvas {
  width: 100%;
  height: 380px;
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
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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
  max-height: 520px;
  overflow: auto;
  font-size: 15px;
  line-height: 1.9;
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
  max-height: 280px;
  overflow: auto;
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
    height: auto;
    grid-template-columns: 1fr;
    grid-template-rows: minmax(360px, 440px) auto auto;
    grid-template-areas:
      "universe"
      "panel"
      "main";
  }
  .task-universe-shell {
    grid-template-columns: 1fr;
  }
  .task-universe-aside {
    display: flex;
    flex-direction: column;
    border-left: 0;
    border-top: 1px solid var(--task-border);
    overflow: visible;
  }
  .task-overview-side-top {
    flex-direction: column;
  }
  .task-detail-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 760px) {
  .task-page {
    padding: 14px;
    height: auto;
  }
  .task-universe-aside {
    overflow: visible;
  }
  .task-tool-card,
  .task-active-list {
    overflow: visible;
  }
  .task-overview-title {
    font-size: 24px;
  }
  .task-kpi-list {
    grid-template-columns: 1fr 1fr;
  }
  .task-detail-page { padding: 14px; }
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

function buildOverviewViewport(planets: PlanetOverviewItem[]): PlanetUniverseViewport | undefined {
  if (planets.length === 0) return undefined;

  const bounds = planets.reduce((acc, planet) => ({
    minX: Math.min(acc.minX, planet.position.x - planet.radius - 22),
    maxX: Math.max(acc.maxX, planet.position.x + planet.radius + 22),
    minY: Math.min(acc.minY, planet.position.y - planet.radius - 28),
    maxY: Math.max(acc.maxY, planet.position.y + planet.radius + 30),
  }), {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  });

  const width = Math.max(140, bounds.maxX - bounds.minX);
  const height = Math.max(120, bounds.maxY - bounds.minY);
  const zoom = Math.max(
    0.92,
    Math.min(
      2.25,
      Math.min(
        PLANET_UNIVERSE_VIEW_BOX.width / width,
        PLANET_UNIVERSE_VIEW_BOX.height / height,
      ) * 1.06,
    ),
  );

  return {
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerY: (bounds.minY + bounds.maxY) / 2,
    zoom,
  };
}

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

function buildTopicAdjacency(edges: PlanetEdge[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const edge of edges) {
    const left = graph.get(edge.fromPlanetId) ?? new Set<string>();
    left.add(edge.toPlanetId);
    graph.set(edge.fromPlanetId, left);

    const right = graph.get(edge.toPlanetId) ?? new Set<string>();
    right.add(edge.fromPlanetId);
    graph.set(edge.toPlanetId, right);
  }
  return graph;
}

function collectConnectedTopicIds(startId: string, edges: PlanetEdge[], maxHops: number): string[] {
  if (!startId) return [];
  if (edges.length === 0) return [];

  const graph = buildTopicAdjacency(edges);
  const visited = new Set<string>([startId]);
  let frontier: string[] = [startId];

  for (let hop = 0; hop < maxHops; hop += 1) {
    const next: string[] = [];
    for (const current of frontier) {
      const neighbors = graph.get(current);
      if (!neighbors) continue;
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }

  visited.delete(startId);
  return [...visited];
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
  const disable3D = useMemo(() => shouldPrefer2D() || !supportsWebGL(), []);
  const [interiorViewMode, setInteriorViewMode] = useState<'3d' | '2d'>(() => (disable3D ? '2d' : '3d'));
  const pathname = useSyncExternalStore(subscribeNavigation, getCurrentAppPath, () => '/tasks');
  const selectedTaskId = parseSelectedTaskId(pathname);
  const detailMode = Boolean(selectedTaskId);
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

  useEffect(() => {
    if (disable3D && interiorViewMode === '3d') {
      setInteriorViewMode('2d');
    }
  }, [disable3D, interiorViewMode]);

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

  const overviewViewport = useMemo(
    () => buildOverviewViewport(planets),
    [planets],
  );

  const overviewUpdatedAt = selectedTask?.updatedAt ?? tasks[0]?.updatedAt ?? null;

  const activePlanets = useMemo(
    () => planets
      .filter((planet) => planet.status === 'running' || planet.status === 'waiting')
      .slice(0, 4),
    [planets],
  );

  const topicTasks = useMemo(() => {
    if (!selectedTask) return [] as PlanetOverviewItem[];
    if (planetApiFallback || edges.length === 0) {
      return tasks
        .filter((task) => task.id !== selectedTask.id)
        .slice(0, 6)
        .map((task, index) => fallbackPlanetFromTask(task, index));
    }

    const connectedIds = collectConnectedTopicIds(selectedTask.id, edges, 2);
    if (connectedIds.length === 0) return [] as PlanetOverviewItem[];

    const byId = new Map(planets.map((planet) => [planet.id, planet]));
    const collected = connectedIds
      .map((id) => byId.get(id))
      .filter((item): item is PlanetOverviewItem => Boolean(item));

    return collected
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 8);
  }, [selectedTask?.id, planetApiFallback, edges, planets, tasks]);

  const interiorAgents = useMemo(() => {
    if (!selectedTask) return [];
    if (!interior || interiorTaskId !== selectedTask.id) return [];

    const weights: Record<string, number> = {
      error: 0,
      working: 1,
      thinking: 2,
      idle: 3,
      done: 4,
    };

    return [...interior.agents].sort((left, right) => {
      const leftWeight = weights[left.status] ?? 10;
      const rightWeight = weights[right.status] ?? 10;
      if (leftWeight !== rightWeight) return leftWeight - rightWeight;
      return (left.name || left.id).localeCompare(right.name || right.id);
    });
  }, [interior, interiorTaskId, selectedTask?.id]);

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

  const interiorContent = selectedTask && selectedPlanet ? (
    interior && interiorTaskId === selectedTask.id && !interiorError ? (
      interiorViewMode === '3d' && !disable3D ? (
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
      <div className="task-empty">Loading task detail...</div>
    ) : (
      <div className="task-empty">
        Failed to load task detail{interiorError ? `: ${interiorError}` : '.'}
      </div>
    )
  ) : (
    <div className="task-empty">{loading ? 'Loading task...' : 'No task selected.'}</div>
  );

  const recentEvents = selectedTask ? [...selectedTask.events].slice(-8).reverse() : [];

  if (detailMode) {
    return (
      <>
        <style>{taskStyles}</style>
        <div className="task-detail-page">
          <div className="task-detail-topbar">
            <button
              type="button"
              className="task-tool-btn task-detail-back"
              onClick={() => navigate('/tasks')}
            >
              Back to tasks
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {selectedTask ? (
                <>
                  <span className={`badge ${selectedTask.status}`}>{getStatusLabel(selectedTask.status)}</span>
                  <span className="badge">{selectedTask.progress}%</span>
                  <span className="badge">{getKindLabel(selectedTask.kind)}</span>
                </>
              ) : null}
              {interiorFallback ? <span className="task-status-badge info">Local detail</span> : null}
            </div>
          </div>

          {selectedTask ? (
            <>
              <section className="task-shell task-detail-hero" data-status={selectedTask.status}>
                <div style={{ color: 'var(--task-dim)', fontSize: 12, letterSpacing: '0.12em', fontWeight: 700 }}>
                  TASK DETAIL
                </div>
                <h1>{selectedTask.title}</h1>
                <div className="task-detail-meta">
                  {getKindLabel(selectedTask.kind)} · {getStatusLabel(selectedTask.status)} · Created {formatTime(selectedTask.createdAt)}
                  {selectedTask.currentStageKey ? ` · Current stage: ${getStageKeyLabel(selectedTask.currentStageKey)}` : ''}
                  {selectedTask.completedAt ? ` · Completed ${formatTime(selectedTask.completedAt)}` : ''}
                </div>
                <div className="task-progress" style={{ marginTop: 14 }}>
                  <span style={{ width: `${selectedTask.progress}%` }} />
                </div>
                <div className="task-badges" style={{ marginTop: 12 }}>
                  <span className={`badge ${selectedTask.status}`}>progress {selectedTask.progress}%</span>
                  {selectedTask.waitingFor ? <span className="badge waiting">waiting {selectedTask.waitingFor}</span> : null}
                  <span className="badge">{selectedTask.id}</span>
                </div>
                {(selectedTask.summary || selectedTask.sourceText || recentEvents[0]?.message) ? (
                  <div className="task-detail-copy">
                    <p>{selectedTask.summary || selectedTask.sourceText || recentEvents[0]?.message}</p>
                  </div>
                ) : null}
              </section>

              <div className="task-detail-grid">
                <main className="task-shell task-detail-main">
                    <div className="task-main-head">
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                        <div>
                          <h1 style={{ margin: 0, fontSize: 18 }}>Task detail</h1>
                        <div style={{ marginTop: 6, color: 'var(--task-dim)', fontSize: 13 }}>
                          This page is optimized for the Feishu progress card and focuses on one task.
                        </div>
                      </div>
                      <div className="task-view-switch">
                        <button
                          type="button"
                          className={`task-tool-btn ${interiorViewMode === '3d' && !disable3D ? 'active' : ''}`}
                          onClick={() => setInteriorViewMode('3d')}
                          disabled={disable3D}
                          title={disable3D ? '3D 视图在当前设备/内置浏览器环境下容易白屏，已默认切换到 2D。' : undefined}
                        >
                          Workspace
                        </button>
                        <button
                          type="button"
                          className={`task-tool-btn ${interiorViewMode === '2d' ? 'active' : ''}`}
                          onClick={() => setInteriorViewMode('2d')}
                        >
                          2D Map
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="task-main-body">
                    {interiorContent}
                  </div>
                </main>

	                <aside className="task-detail-side">
	                  <section className="task-shell">
	                    <div className="task-panel-head">
	                      <h1 style={{ margin: 0, fontSize: 16 }}>Stage progress</h1>
	                    </div>
                    <div className="task-panel-body">
                      <div className="stage-grid">
                        {selectedTask.stages.map((stage) => (
                          <div key={stage.key} className="stage-card">
                            <h3>{getStageLabel(stage.label, stage.key)}</h3>
                            <div className={`stage-status ${stage.status}`}>{stage.status}</div>
                            <p>{stage.detail || 'No stage detail.'}</p>
                          </div>
                        ))}
                      </div>
	                    </div>
	                  </section>

	                  <section className="task-shell">
	                    <div className="task-panel-head">
	                      <h1 style={{ margin: 0, fontSize: 16 }}>Robots</h1>
	                    </div>
	                    <div className="task-panel-body">
	                      {interiorAgents.length > 0 ? (
	                        <div className="task-agent-list">
	                          {interiorAgents.map((agent) => {
	                            const tone = agent.status === 'error' ? 'warn' : 'info';
	                            const label = `${getRoleLabel(agent.role)} · ${getAgentStatusLabel(agent.status)}${typeof agent.progress === 'number' ? ` · ${agent.progress}%` : ''}`;
	                            return (
	                              <div key={agent.id} className="task-agent-card">
	                                <div className="task-agent-head">
	                                  <div className="task-agent-name">{agent.name}</div>
	                                  <span className={`task-status-badge ${tone}`}>{agent.stageLabel}</span>
	                                </div>
	                                <div className="task-agent-meta">{label}</div>
	                                {agent.currentAction ? (
	                                  <div className="task-agent-hint">{agent.currentAction}</div>
	                                ) : null}
	                              </div>
	                            );
	                          })}
	                        </div>
	                      ) : (
	                        <div className="task-empty">No active robots loaded yet.</div>
	                      )}
	                    </div>
	                  </section>

	                  <section className="task-shell">
	                    <div className="task-panel-head">
	                      <h1 style={{ margin: 0, fontSize: 16 }}>Recent events</h1>
	                    </div>
                    <div className="task-panel-body">
                      {recentEvents.length > 0 ? (
                        <div className="event-feed">
                          {recentEvents.map((event, index) => (
                            <div key={`${event.time}-${index}`} className="event-card">
                              <h3>{event.message}</h3>
                              <div className="time">
                                {formatTime(event.time)} · {event.type}{typeof event.progress === 'number' ? ` · ${event.progress}%` : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="task-empty">No events yet.</div>
                      )}
	                    </div>
	                  </section>

	                  <section className="task-shell">
	                    <div className="task-panel-head">
	                      <h1 style={{ margin: 0, fontSize: 16 }}>
	                        Topic tasks{topicTasks.length > 0 ? ` (${topicTasks.length})` : ''}
	                      </h1>
	                    </div>
	                    <div className="task-panel-body">
	                      {topicTasks.length > 0 ? (
	                        <div className="task-detail-tasklist">
	                          {topicTasks.map((task) => (
	                            <button
	                              key={task.id}
	                              type="button"
	                              className="task-item"
	                              onClick={() => navigate(`/tasks/${task.id}`)}
	                            >
	                              <div className="task-title">{task.title}</div>
	                              <div className="task-meta">
	                                {getKindLabel(task.kind)} · {getStatusLabel(task.status)} · {task.progress}%
	                              </div>
	                            </button>
	                          ))}
	                        </div>
	                      ) : (
	                        <div className="task-empty">
	                          No topic links yet. Create edges in the Tasks universe view or reference previous tasks in your prompt.
	                        </div>
	                      )}
	                    </div>
	                  </section>
	                </aside>
              </div>
            </>
          ) : (
            <section className="task-shell task-detail-hero">
              <h1 style={{ margin: 0, fontSize: 24 }}>Task not found</h1>
              <div className="task-detail-meta">
                {loading ? 'Trying to load task detail...' : 'This task link may be expired, or the task id is invalid.'}
              </div>
            </section>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <style>{taskStyles}</style>
      <div className="task-page">
        <section className="task-universe-shell">
          <div className="task-universe-main">
            <div className="task-universe-body">
              {loading && planets.length === 0 ? (
                <div className="task-empty">正在加载任务星图…</div>
              ) : (
                <PlanetUniverse
                  planets={planets}
                  edges={edges}
                  selectedId={selectedTask?.id ?? null}
                  selectedEdgeKey={selectedEdgeKey}
                  linkSourceId={linkSourceId}
                  viewport={overviewViewport}
                  onPlanetClick={(taskId) => { void handlePlanetClick(taskId); }}
                  onEdgeClick={(edge) => setSelectedEdgeKey(edgeKey(edge))}
                />
              )}
            </div>
          </div>
          <aside className="task-universe-aside">
            <div className="task-aside-card task-overview-side">
              <div className="task-overview-side-top">
                <div className="task-overview-copy">
                  <span className="task-overview-kicker">Task Overview</span>
                  <h1 className="task-overview-title">OpenCroc 任务星图</h1>
                </div>
                <div className="task-overview-actions">
                  <span className={`task-status-badge ${planetApiFallback ? 'warn' : 'info'}`}>
                    {planetApiFallback ? '仅任务接口' : '实时星图'}
                  </span>
                  <button
                    type="button"
                    className="task-tool-btn"
                    onClick={() => navigate(selectedTask ? `/universe?focus=${encodeURIComponent(selectedTask.id)}` : '/universe')}
                  >
                    全屏查看
                  </button>
                </div>
              </div>
              <div className="task-overview-lede">
                把扫描、流水线和飞书复杂任务统一放进一张持续刷新的星图里。发光的是执行中任务，闪烁的是待确认节点，点进任意星球就能查看完整进度卡片。
              </div>
              <div className="task-overview-pills">
                <span className="task-overview-pill"><strong>{stats.total}</strong> 个任务已装载</span>
                <span className="task-overview-pill"><strong>{stats.running + stats.waiting}</strong> 个任务正在活跃推进</span>
                <span className="task-overview-pill"><span className="task-dot" style={{ background: '#ef9f27', marginRight: 0 }} /> 执行中会发光</span>
                <span className="task-overview-pill"><span className="task-dot" style={{ background: '#8b82f4', marginRight: 0 }} /> 待确认会闪烁</span>
                {overviewUpdatedAt ? (
                  <span className="task-overview-pill">最近更新 {formatTime(overviewUpdatedAt)}</span>
                ) : null}
              </div>
            </div>
            <div className="task-kpi-list">
              <div className="task-kpi">
                <span className="label">任务总数</span>
                <span className="value">{stats.total}</span>
                <span className="hint">当前已进入星图的全部任务</span>
              </div>
              <div className="task-kpi">
                <span className="label">执行中</span>
                <span className="value" style={{ color: 'var(--task-orange)' }}>{stats.running}</span>
                <span className="hint">仍在自动推进的任务</span>
              </div>
              <div className="task-kpi">
                <span className="label">待确认</span>
                <span className="value" style={{ color: 'var(--task-purple)' }}>{stats.waiting}</span>
                <span className="hint">需要人工接力的节点</span>
              </div>
              <div className="task-kpi">
                <span className="label">已完成</span>
                <span className="value" style={{ color: 'var(--task-accent)' }}>{stats.done}</span>
                <span className="hint">已经沉淀为历史记录</span>
              </div>
            </div>

            <div className="task-legend">
              <div className="task-legend-item"><span><span className="task-dot" style={{ background: '#ef9f27' }} /> 执行中</span><span>发光 + 进度环</span></div>
              <div className="task-legend-item"><span><span className="task-dot" style={{ background: '#8b82f4' }} /> 待确认</span><span>需要你介入</span></div>
              <div className="task-legend-item"><span><span className="task-dot" style={{ background: '#34d399' }} /> 已完成</span><span>结果已沉淀</span></div>
              <div className="task-legend-item"><span><span className="task-dot" style={{ background: '#f87171' }} /> 失败</span><span>需要恢复处理</span></div>
            </div>

            <div className="task-tool-card">
              <div className="task-tool-card-title">星球关系</div>
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
	                  data-status={planet.status}
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
                  data-status={task.status}
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
                    className={`task-tool-btn ${interiorViewMode === '3d' && !disable3D ? 'active' : ''}`}
                    onClick={() => setInteriorViewMode('3d')}
                    disabled={disable3D}
                    title={disable3D ? '3D 视图在当前设备/内置浏览器环境下容易白屏，已默认切换到 2D。' : undefined}
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
                interiorViewMode === '3d' && !disable3D ? (
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
