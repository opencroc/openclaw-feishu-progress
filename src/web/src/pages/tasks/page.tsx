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
import UniverseScene3D from '@features/tasks/universe/UniverseScene3D';
import type {
  PlanetEdge,
  PlanetInteriorData,
  PlanetInteriorResponse,
  PlanetListResponse,
  PlanetOverviewItem,
  TaskRecord,
} from '@features/tasks/types';
import { getCurrentAppPath, navigate, subscribeNavigation } from '@shared/navigation';
import { supportsWebGL } from '@shared/platform';

const taskStyles = `
:root {
  --task-bg: #f5f0e8;
  --task-panel: #faf7f2;
  --task-card: #fff;
  --task-border: rgba(140, 120, 90, 0.12);
  --task-border-hover: rgba(140, 120, 90, 0.28);
  --task-text: #2d2417;
  --task-dim: #6b5d4f;
  --task-muted: #a09484;
  --task-accent: #6b8f4e; /* olive */
  --task-red: #c4713b; /* terra */
  --task-orange: #b5943a; /* sand */
  --task-blue: #4a8f8c; /* teal */
  --task-purple: #8b6eab; /* plum */
  --task-shadow: 0 1px 3px rgba(45, 36, 23, 0.06);
}
html, body, #root { width: 100%; height: 100%; margin: 0; padding: 0; }
body {
  font-family: 'Noto Sans SC', "PingFang SC", sans-serif;
  background: var(--task-bg);
  color: var(--task-text);
}

/* Topbar */
.task-page-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 28px;
  background: var(--task-panel);
  border-bottom: 1px solid var(--task-border);
  position: sticky;
  top: 0;
  z-index: 100;
}
.task-page-topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.task-page-topbar-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--task-accent);
  box-shadow: 0 0 8px rgba(107, 143, 78, 0.6);
  animation: task-pulse 2s infinite;
}
@keyframes task-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.9); }
}
.task-page-topbar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--task-dim);
  letter-spacing: 0.02em;
}
.task-page-topbar-ver {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 600;
  color: var(--task-text);
  background: var(--task-card);
  border: 1px solid var(--task-border);
  padding: 6px 14px;
  border-radius: 20px;
  box-shadow: var(--task-shadow);
}

/* Main Layout */
.task-page-layout {
  display: grid;
  grid-template-columns: 228px minmax(0, 1fr) 308px;
  min-height: calc(100dvh - 44px);
  height: calc(100dvh - 44px);
  overflow: hidden;
}

/* Left Panel */
.task-panel-left {
  background: var(--task-panel);
  border-right: 1px solid var(--task-border);
  padding: 12px 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.task-panel-left .task-panel-head {
  padding: 0 0 10px 0;
  border: none;
}
.task-panel-left h1 {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 2px 0;
}
.task-panel-left .task-dim-text {
  font-size: 10px;
  color: var(--task-muted);
  line-height: 1.45;
}

/* Center Panel */
.task-panel-center {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: var(--task-bg);
}

.task-universe-shell {
  position: relative;
  margin: 16px 20px 0;
  border-radius: 20px;
  overflow: hidden;
  background: linear-gradient(180deg, #f8f4ec, #efe8da 60%, #e6dece);
  box-shadow: 0 4px 24px rgba(44, 36, 24, 0.08), 0 0 0 1px var(--task-border);
  min-height: 560px;
  height: 560px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.task-universe-body {
  flex: 1;
  min-height: 0;
  position: relative;
}

.task-main {
  padding: 24px 20px 40px;
  border: none;
  background: transparent;
  box-shadow: none;
  border-radius: 0;
}
.task-main .task-main-head {
  padding: 0;
  border: none;
  margin-bottom: 18px;
}
.task-main h1 {
  font-family: 'Source Serif 4', 'Noto Sans SC', serif;
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 4px 0;
}
.task-main .task-dim-text {
  font-size: 12px;
  color: var(--task-muted);
}

/* Right Panel */
.task-panel-right {
  background: var(--task-panel);
  border-left: 1px solid var(--task-border);
  padding: 22px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.task-right-card {
  background: var(--task-card);
  border: 1px solid var(--task-border);
  border-radius: 12px;
  padding: 18px;
  box-shadow: var(--task-shadow);
}
.task-right-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.task-right-card-title {
  font-size: 14px;
  font-weight: 600;
}
.task-right-card-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 5px;
}
.task-right-card-badge.done { background: rgba(107, 143, 78, 0.1); color: var(--task-accent); }
.task-right-card-badge.info { background: rgba(74, 143, 140, 0.1); color: var(--task-blue); }
.task-right-card-badge.warn { background: rgba(181, 148, 58, 0.1); color: var(--task-orange); }
.task-right-card-badge.error { background: rgba(139, 110, 171, 0.1); color: var(--task-purple); }

/* Left Items */
.task-item {
  background: var(--task-card);
  border: 1px solid var(--task-border);
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: 0.2s;
  box-shadow: 0 1px 2px rgba(45, 36, 23, 0.04);
  text-align: left;
  display: flex;
  flex-direction: column;
  width: 100%;
}
.task-item:hover {
  border-color: var(--task-border-hover);
  transform: translateY(-1px);
}
.task-item.active {
  border-color: rgba(196, 113, 59, 0.35);
  background: rgba(196, 113, 59, 0.03);
}
.task-item-topline {
  display: flex;
  gap: 4px;
  margin-bottom: 6px;
  align-items: center;
  flex-wrap: wrap;
}
.task-item-tag {
  font-size: 9px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
}
.task-item-tag.t1 { background: rgba(74, 143, 140, 0.1); color: var(--task-blue); }
.task-item-tag.t2 { background: rgba(139, 110, 171, 0.1); color: var(--task-purple); }
.task-item-count {
  font-size: 10px;
  color: var(--task-muted);
  margin-left: auto;
}
.task-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.task-meta {
  font-size: 10px;
  color: var(--task-muted);
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.task-item-pls {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.task-item-pl {
  font-size: 9px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
}
.task-item-pl.pp { background: rgba(74, 143, 140, 0.1); color: var(--task-blue); }
.task-item-pl.pw { background: rgba(181, 148, 58, 0.1); color: var(--task-orange); }
.task-item-pl.pd { background: rgba(107, 143, 78, 0.1); color: var(--task-accent); }

.task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.task-topic-strip {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}
.task-topic-card,
.task-topic-section {
  border-radius: 14px;
  border: 1px solid var(--task-border);
  background:
    radial-gradient(circle at top right, rgba(86, 116, 143, 0.08), transparent 34%),
    linear-gradient(180deg, rgba(255, 252, 247, 0.96), rgba(248, 242, 233, 0.9));
  box-shadow: 0 8px 22px rgba(84, 67, 48, 0.06);
}
.task-topic-card {
  padding: 8px 10px;
  text-align: left;
  color: inherit;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.task-topic-card:hover,
.task-topic-card.active {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--task-blue) 30%, var(--task-border));
  box-shadow: 0 10px 24px rgba(84, 67, 48, 0.1);
}
.task-topic-card-top,
.task-topic-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.task-topic-card-title,
.task-topic-section-title {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.3;
}
.task-topic-card-meta,
.task-topic-section-meta,
.task-topic-spotlight-meta {
  margin-top: 2px;
  color: var(--task-dim);
  font-size: 10px;
  line-height: 1.45;
}
.task-topic-card-stats,
.task-topic-head-stats,
.task-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.task-topic-tasklist {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.task-topic-section {
  padding: 8px;
}
.task-status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 600;
  line-height: 1.4;
  border: 1px solid var(--task-border);
  background: rgba(255, 255, 255, 0.75);
  color: var(--task-dim);
}
.task-status-badge.info {
  border-color: color-mix(in srgb, var(--task-blue) 35%, var(--task-border));
  color: var(--task-blue);
  background: color-mix(in srgb, var(--task-blue) 12%, #ffffff);
}
.task-status-badge.warn {
  border-color: color-mix(in srgb, var(--task-orange) 35%, var(--task-border));
  color: var(--task-orange);
  background: color-mix(in srgb, var(--task-orange) 12%, #ffffff);
}
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 600;
  line-height: 1.35;
  border: 1px solid var(--task-border);
  background: rgba(255, 255, 255, 0.74);
  color: var(--task-dim);
}
.badge.running {
  border-color: color-mix(in srgb, var(--task-orange) 28%, var(--task-border));
  color: var(--task-orange);
  background: color-mix(in srgb, var(--task-orange) 10%, #ffffff);
}
.badge.waiting {
  border-color: color-mix(in srgb, var(--task-purple) 28%, var(--task-border));
  color: var(--task-purple);
  background: color-mix(in srgb, var(--task-purple) 10%, #ffffff);
}
.badge.done {
  border-color: color-mix(in srgb, var(--task-accent) 28%, var(--task-border));
  color: var(--task-accent);
  background: color-mix(in srgb, var(--task-accent) 10%, #ffffff);
}
.badge.failed {
  border-color: color-mix(in srgb, var(--task-red) 30%, var(--task-border));
  color: var(--task-red);
  background: color-mix(in srgb, var(--task-red) 10%, #ffffff);
}

/* Overrides for components */
.universe-canvas-shell {
  position: relative;
  width: 100%;
  height: 100%;
}
.universe-canvas-stage {
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid rgba(100, 83, 61, 0.1);
  background:
    radial-gradient(circle at 18% 20%, rgba(86, 116, 143, 0.08), transparent 20%),
    radial-gradient(circle at 74% 18%, rgba(183, 128, 52, 0.08), transparent 24%),
    linear-gradient(180deg, rgba(255, 252, 247, 0.98), rgba(246, 239, 228, 0.96));
  cursor: grab;
}
.universe-canvas-stage:active {
  cursor: grabbing;
}
.universe-canvas-stage-3d {
  position: relative;
  background:
    radial-gradient(circle at 18% 16%, rgba(86, 116, 143, 0.12), transparent 24%),
    radial-gradient(circle at 78% 18%, rgba(183, 128, 52, 0.12), transparent 24%),
    radial-gradient(circle at 50% 72%, rgba(46, 107, 89, 0.08), transparent 30%),
    linear-gradient(180deg, rgba(255, 252, 247, 0.98), rgba(244, 236, 225, 0.98));
}
.universe-scene-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.universe-scene-overlay {
  position: absolute;
  inset: 18px auto auto 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: min(420px, calc(100% - 36px));
  pointer-events: none;
}
.universe-scene-badge {
  align-self: flex-start;
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid rgba(100, 83, 61, 0.14);
  background: rgba(255, 251, 246, 0.88);
  color: var(--task-dim);
  font-size: 12px;
}
.universe-scene-hud,
.universe-scene-note {
  border-radius: 16px;
  border: 1px solid rgba(100, 83, 61, 0.14);
  background: rgba(255, 251, 246, 0.82);
  box-shadow: 0 14px 36px rgba(84, 67, 48, 0.08);
  backdrop-filter: blur(14px);
  padding: 12px 14px;
}
.universe-scene-hud strong {
  display: block;
  color: var(--task-text);
  font-size: 14px;
}
.universe-scene-hud span,
.universe-scene-note {
  display: block;
  color: var(--task-dim);
  font-size: 12px;
  line-height: 1.6;
}
.universe-scene-hud span + span {
  margin-top: 4px;
}
.universe-canvas-toolbar {
  position: absolute;
  right: 16px;
  bottom: 16px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.universe-canvas-toolbar button {
  border: 1px solid rgba(100, 83, 61, 0.14);
  border-radius: 999px;
  padding: 7px 11px;
  background: rgba(255, 251, 246, 0.9);
  color: var(--task-text);
  font: inherit;
  cursor: pointer;
}
.universe-canvas-toolbar button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.task-view-switch button {
  font-size: 12px;
  padding: 7px 18px;
  border-radius: 8px;
  border: 1px solid var(--task-border);
  background: var(--task-card);
  color: var(--task-dim);
  cursor: pointer;
  transition: 0.2s;
  box-shadow: var(--task-shadow);
}
.task-view-switch button.active {
  background: rgba(196, 113, 59, 0.1);
  color: var(--task-red);
  border-color: rgba(196, 113, 59, 0.25);
  font-weight: 600;
}

/* Reset scrollbars */
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-thumb { background: rgba(140, 120, 90, 0.15); border-radius: 3px; }
`;

const taskDetailStyles = `
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
.task-decision-shell {
  background:
    radial-gradient(circle at top left, rgba(123, 106, 137, 0.14), transparent 28%),
    linear-gradient(180deg, rgba(255, 252, 247, 0.98), rgba(247, 240, 230, 0.95));
}
.task-decision-body {
  padding: 18px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.task-decision-prompt {
  margin: 0;
  font-size: 20px;
  line-height: 1.45;
}
.task-decision-help {
  color: var(--task-dim);
  font-size: 13px;
  line-height: 1.7;
}
.task-decision-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.task-decision-option {
  min-width: min(240px, 100%);
  max-width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 12px 14px;
  text-align: left;
}
.task-decision-option-title {
  font-weight: 800;
  font-size: 14px;
  line-height: 1.4;
}
.task-decision-option-copy {
  color: var(--task-dim);
  font-size: 12px;
  line-height: 1.55;
  white-space: normal;
}
.task-decision-note-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.task-decision-note {
  width: 100%;
  min-height: 96px;
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid var(--task-border);
  border-radius: 16px;
  background: rgba(255, 251, 246, 0.9);
  color: var(--task-text);
  font: inherit;
  padding: 12px 14px;
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
.task-detail-page .task-universe-shell {
  border: 1px solid var(--task-border);
  background: var(--task-panel);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: var(--task-shadow);
  backdrop-filter: blur(18px);
}
.task-detail-page .task-universe-shell {
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
.task-detail-page .task-universe-head,
.task-panel-head,
.task-main-head {
  padding: 16px 18px;
  border-bottom: 1px solid var(--task-border);
}
.task-detail-page .task-universe-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
}
.task-detail-page .task-universe-body {
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
.task-detail-page .task-universe-svg {
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
.task-detail-page .task-overview-side-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.task-detail-page .task-overview-side .task-overview-copy {
  gap: 6px;
}
.task-detail-page .task-overview-side .task-overview-title {
  font-size: 22px;
}
.task-detail-page .task-overview-side .task-overview-lede {
  max-width: none;
}
.task-detail-page .task-overview-side .task-overview-actions {
  justify-content: flex-start;
  flex-shrink: 0;
}
.task-detail-page .task-universe-aside {
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
.universe-canvas-shell {
  position: relative;
  height: 100%;
}
.universe-canvas-stage {
  height: 100%;
  min-height: 0;
  border-radius: 24px;
  overflow: hidden;
  border: 1px solid rgba(100, 83, 61, 0.1);
  background:
    radial-gradient(circle at 18% 20%, rgba(86, 116, 143, 0.08), transparent 20%),
    radial-gradient(circle at 74% 18%, rgba(183, 128, 52, 0.08), transparent 24%),
    linear-gradient(180deg, rgba(255, 252, 247, 0.98), rgba(246, 239, 228, 0.96));
  cursor: grab;
}
.universe-canvas-stage:active {
  cursor: grabbing;
}
.universe-canvas-stage-3d {
  position: relative;
  background:
    radial-gradient(circle at 18% 16%, rgba(86, 116, 143, 0.12), transparent 24%),
    radial-gradient(circle at 78% 18%, rgba(183, 128, 52, 0.12), transparent 24%),
    radial-gradient(circle at 50% 72%, rgba(46, 107, 89, 0.08), transparent 30%),
    linear-gradient(180deg, rgba(255, 252, 247, 0.98), rgba(244, 236, 225, 0.98));
}
.universe-scene-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.universe-scene-overlay {
  position: absolute;
  inset: 18px auto auto 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: min(420px, calc(100% - 36px));
  pointer-events: none;
}
.universe-scene-badge {
  align-self: flex-start;
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid rgba(100, 83, 61, 0.14);
  background: rgba(255, 251, 246, 0.88);
  color: var(--task-dim);
  font-size: 12px;
}
.universe-scene-hud,
.universe-scene-note {
  border-radius: 20px;
  border: 1px solid rgba(100, 83, 61, 0.14);
  background: rgba(255, 251, 246, 0.82);
  box-shadow: 0 18px 50px rgba(84, 67, 48, 0.08);
  backdrop-filter: blur(18px);
  padding: 14px 16px;
}
.universe-scene-hud strong {
  display: block;
  color: var(--task-text);
  font-size: 16px;
}
.universe-scene-hud span,
.universe-scene-note {
  display: block;
  color: var(--task-dim);
  font-size: 13px;
  line-height: 1.7;
}
.universe-scene-hud span + span {
  margin-top: 6px;
}
.universe-canvas-toolbar {
  position: absolute;
  right: 16px;
  bottom: 16px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.universe-canvas-toolbar button {
  border: 1px solid rgba(100, 83, 61, 0.14);
  border-radius: 999px;
  padding: 8px 12px;
  background: rgba(255, 251, 246, 0.9);
  color: var(--task-text);
  font: inherit;
  cursor: pointer;
}
.universe-canvas-toolbar button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.task-topic-strip {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}
.task-topic-card,
.task-topic-section {
  border-radius: 20px;
  border: 1px solid var(--task-border);
  background:
    radial-gradient(circle at top right, rgba(86, 116, 143, 0.09), transparent 34%),
    linear-gradient(180deg, rgba(255, 252, 247, 0.96), rgba(248, 242, 233, 0.9));
  box-shadow: 0 14px 36px rgba(84, 67, 48, 0.08);
}
.task-topic-card {
  padding: 8px 10px;
  text-align: left;
  color: inherit;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.task-topic-card:hover,
.task-topic-card.active {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--task-blue) 30%, var(--task-border));
  box-shadow: 0 18px 44px rgba(84, 67, 48, 0.12);
}
.task-topic-card-top,
.task-topic-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.task-topic-card-title,
.task-topic-section-title {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.3;
}
.task-topic-card-meta,
.task-topic-section-meta,
.task-topic-spotlight-meta {
  margin-top: 2px;
  color: var(--task-dim);
  font-size: 10px;
  line-height: 1.45;
}
.task-topic-card-stats,
.task-topic-head-stats,
.task-topic-spotlight-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.task-topic-groups {
  gap: 10px;
}
.task-topic-section {
  padding: 10px 12px;
}
.task-topic-head-copy {
  min-width: 0;
}
.task-topic-head-stats {
  justify-content: flex-end;
}
.task-topic-code {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 5px 8px;
  border-radius: 999px;
  border: 1px dashed rgba(100, 83, 61, 0.18);
  background: rgba(255, 251, 246, 0.76);
  color: var(--task-muted);
  font-size: 11px;
  line-height: 1;
  font-family: "SFMono-Regular", "Menlo", "Monaco", "Courier New", monospace;
}
.task-topic-tasklist {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.task-item-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.task-item-topline-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}
.task-item-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid rgba(100, 83, 61, 0.12);
  background: rgba(255, 255, 255, 0.7);
  color: var(--task-blue);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.task-item-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.task-item-side {
  flex: 0 0 auto;
  color: var(--task-muted);
  font-size: 9px;
  line-height: 1.3;
  text-align: right;
}
.task-item-summary {
  margin-top: 8px;
  color: var(--task-text);
  font-size: 12px;
  line-height: 1.65;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.task-topic-spotlight {
  padding: 18px 20px;
  background:
    radial-gradient(circle at top left, rgba(46, 107, 89, 0.12), transparent 34%),
    radial-gradient(circle at right top, rgba(86, 116, 143, 0.12), transparent 28%),
    linear-gradient(180deg, rgba(255, 252, 247, 0.98), rgba(248, 242, 233, 0.94));
}
.task-topic-spotlight-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  gap: 16px;
  align-items: start;
}
.task-topic-spotlight h2 {
  margin: 10px 0 0;
  font-size: 24px;
  line-height: 1.25;
}
.task-topic-spotlight-aside {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid var(--task-border);
  background: rgba(255, 251, 246, 0.76);
  box-shadow: 0 14px 38px rgba(84, 67, 48, 0.08);
}
.task-topic-mini-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.task-topic-mini-card {
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid var(--task-border);
  background: rgba(255, 255, 255, 0.74);
}
.task-topic-mini-card strong {
  display: block;
  font-size: 18px;
  line-height: 1.1;
  color: var(--task-text);
}
.task-topic-mini-card span {
  display: block;
  margin-top: 6px;
  color: var(--task-dim);
  font-size: 11px;
  line-height: 1.5;
}
.task-topic-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.task-item {
  position: relative;
  padding: 8px 8px 8px 15px;
  border-radius: 10px;
  border: 1px solid var(--task-border);
  background: var(--task-card);
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease;
  color: inherit;
  text-align: left;
  box-shadow: 0 6px 16px rgba(84, 67, 48, 0.05);
}
.task-item::before {
  content: "";
  position: absolute;
  left: 6px;
  top: 8px;
  bottom: 8px;
  width: 3px;
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
  border-radius: 10px;
  overflow: hidden;
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
  min-height: 420px;
  height: 420px;
  overflow: hidden;
  isolation: isolate;
  background:
    radial-gradient(circle at 30% 24%, rgba(76, 176, 157, 0.12), transparent 32%),
    radial-gradient(circle at 74% 28%, rgba(201, 164, 95, 0.14), transparent 30%),
    linear-gradient(180deg, rgba(253, 250, 245, 0.98), rgba(238, 230, 216, 0.96));
}
.planet-interior-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  z-index: 2;
}
.planet-interior-scene-overlay {
  position: absolute;
  inset: 18px auto auto 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: min(420px, calc(100% - 36px));
  pointer-events: none;
  z-index: 3;
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
  z-index: 4;
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
  .task-detail-page .task-universe-shell {
    grid-template-columns: 1fr;
  }
  .task-detail-page .task-universe-aside {
    display: flex;
    flex-direction: column;
    border-left: 0;
    border-top: 1px solid var(--task-border);
    overflow: visible;
  }
  .task-detail-page .task-overview-side-top {
    flex-direction: column;
  }
  .task-detail-grid {
    grid-template-columns: 1fr;
  }
  .task-topic-spotlight-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 760px) {
  .task-page {
    padding: 14px;
    height: auto;
  }
  .task-detail-page .task-universe-aside {
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
  .task-topic-strip,
  .task-topic-mini-grid {
    grid-template-columns: 1fr;
  }
  .task-topic-head,
  .task-item-title-row {
    flex-direction: column;
  }
  .task-item-side {
    text-align: left;
  }
  .planet-interior-scene,
  .planet-interior-canvas {
    min-height: 420px;
    height: 420px;
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

type TopicGroup = {
  key: string;
  topicId?: string;
  label: string;
  subtitle: string;
  tasks: TaskRecord[];
  latestUpdatedAt: number;
  counts: Record<TaskRecord['status'], number>;
};

function shortenMiddle(value: string, head = 16, tail = 8): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function getTopicGroupKey(task: TaskRecord): string {
  return task.topicId?.trim() || `standalone:${task.id}`;
}

function getTopicLabel(topicId?: string): string {
  if (!topicId) return '独立任务';
  const parts = topicId.split(':');
  if (parts[0] === 'topic' && parts[1] === 'feishu') {
    const threadPart = parts[3] || parts[parts.length - 1] || topicId;
    return `Feishu 线程 ${shortenMiddle(threadPart, 10, 6)}`;
  }
  return shortenMiddle(topicId, 16, 8);
}

function getTopicSubtitle(topicId?: string): string {
  if (!topicId) {
    return '没有挂到 thread/topicId 的任务会以独立话题展示。';
  }

  const parts = topicId.split(':');
  if (parts[0] === 'topic' && parts[1] === 'feishu') {
    const chatPart = parts[2] ? shortenMiddle(parts[2], 8, 4) : 'unknown';
    const threadPart = parts[3] ? shortenMiddle(parts[3], 10, 6) : 'root';
    return `strict-by-thread · chat ${chatPart} · thread ${threadPart}`;
  }

  return `deterministic topic · ${shortenMiddle(topicId, 18, 10)}`;
}

function buildTopicGroups(tasks: TaskRecord[]): TopicGroup[] {
  const buckets = new Map<string, TaskRecord[]>();

  for (const task of sortTasks(tasks)) {
    const key = getTopicGroupKey(task);
    const bucket = buckets.get(key) ?? [];
    bucket.push(task);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .map(([key, bucket]) => {
      const ordered = sortTasks(bucket);
      const lead = ordered[0];
      const counts: Record<TaskRecord['status'], number> = {
        queued: 0,
        running: 0,
        waiting: 0,
        done: 0,
        failed: 0,
      };

      for (const task of ordered) {
        counts[task.status] += 1;
      }

      return {
        key,
        topicId: lead?.topicId,
        label: getTopicLabel(lead?.topicId),
        subtitle: getTopicSubtitle(lead?.topicId),
        tasks: ordered,
        latestUpdatedAt: lead?.updatedAt ?? 0,
        counts,
      };
    })
    .sort((left, right) => {
      if (left.latestUpdatedAt !== right.latestUpdatedAt) {
        return right.latestUpdatedAt - left.latestUpdatedAt;
      }
      return right.tasks.length - left.tasks.length;
    });
}

function prioritizeTask<T extends { id: string }>(items: T[], selectedId: string): T[] {
  const index = items.findIndex((item) => item.id === selectedId);
  if (index <= 0) return items;
  const next = [...items];
  const [selected] = next.splice(index, 1);
  next.unshift(selected);
  return next;
}

function buildEdgeLoadMap(edges: PlanetEdge[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    counts.set(edge.fromPlanetId, (counts.get(edge.fromPlanetId) ?? 0) + 1);
    counts.set(edge.toPlanetId, (counts.get(edge.toPlanetId) ?? 0) + 1);
  }
  return counts;
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
  const bodyText = await response.text();
  const payload = bodyText
    ? (() => {
        try {
          return JSON.parse(bodyText);
        } catch {
          return bodyText;
        }
      })()
    : undefined;

  if (!response.ok) {
    if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
      throw new Error(payload.error);
    }
    if (typeof payload === 'string' && payload.trim()) {
      throw new Error(payload.trim());
    }
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return payload as T;
}

interface TaskDecisionApiResponse {
  ok: true;
  alreadyResolved?: boolean;
  detail?: string;
  decision: {
    optionId?: string;
    optionLabel?: string;
    freeText?: string;
  };
  task: TaskRecord;
}

export default function TasksPage() {
  const disable3D = useMemo(() => !supportsWebGL(), []);
  const [overviewViewMode, setOverviewViewMode] = useState<'3d' | '2d'>(() => (disable3D ? '2d' : '3d'));
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
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionFreeText, setDecisionFreeText] = useState('');

  useEffect(() => {
    if (disable3D && overviewViewMode === '3d') {
      setOverviewViewMode('2d');
    }
  }, [disable3D, overviewViewMode]);

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

  useEffect(() => {
    setDecisionBusy(false);
    setDecisionError(null);
    setDecisionFreeText('');
  }, [selectedTask?.id, selectedTask?.status]);

  const stats = useMemo(() => ({
    total: planets.length,
    running: planets.filter((planet) => planet.status === 'running').length,
    waiting: planets.filter((planet) => planet.status === 'waiting').length,
    done: planets.filter((planet) => planet.status === 'done').length,
  }), [planets]);
  const topicGroups = useMemo(() => buildTopicGroups(tasks), [tasks]);
  const featuredTopicGroups = useMemo(() => topicGroups.slice(0, 4), [topicGroups]);
  const edgeLoadByTask = useMemo(() => buildEdgeLoadMap(edges), [edges]);

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

  const selectedTopicGroup = useMemo(() => {
    if (!selectedTask) return null;
    return topicGroups.find((group) => group.tasks.some((task) => task.id === selectedTask.id)) ?? null;
  }, [selectedTask, topicGroups]);

  const topicTasks = useMemo(() => {
    if (!selectedTask) return [] as TaskRecord[];

    if (selectedTopicGroup) {
      return prioritizeTask(selectedTopicGroup.tasks, selectedTask.id).slice(0, 8);
    }

    if (planetApiFallback || edges.length === 0) {
      return [selectedTask, ...tasks.filter((task) => task.id !== selectedTask.id).slice(0, 5)];
    }

    const connectedIds = collectConnectedTopicIds(selectedTask.id, edges, 2);
    if (connectedIds.length === 0) return [selectedTask];

    const byId = new Map(tasks.map((task) => [task.id, task]));
    const collected = connectedIds
      .map((id) => byId.get(id))
      .filter((item): item is TaskRecord => Boolean(item));

    return prioritizeTask(sortTasks([selectedTask, ...collected]), selectedTask.id).slice(0, 8);
  }, [selectedTask, selectedTopicGroup, planetApiFallback, edges, tasks]);

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

  async function handleSubmitTaskDecision(optionId?: string): Promise<void> {
    if (!selectedTask) return;

    const freeText = decisionFreeText.trim() || undefined;
    setDecisionBusy(true);
    setDecisionError(null);

    try {
      const response = await fetchJson<TaskDecisionApiResponse>(`/api/tasks/${selectedTask.id}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          optionId,
          freeText,
        }),
      });

      startTransition(() => {
        setTasks((current) => upsertTask(current, response.task));
        setPlanets((current) => upsertPlanet(current, response.task));
      });
    } catch (actionError) {
      setDecisionError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setDecisionBusy(false);
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
    if (overviewViewMode !== '3d') return;
    setLinkMode(false);
    setLinkSourceId(null);
    setSelectedEdgeKey(null);
    setEdgeError(null);
  }, [overviewViewMode]);

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
      <div className="task-empty">正在加载任务详情…</div>
    ) : (
      <div className="task-empty">
        任务详情加载失败{interiorError ? `：${interiorError}` : '。'}
      </div>
    )
  ) : (
    <div className="task-empty">{loading ? '正在加载任务…' : '还没有选中任务。'}</div>
  );

  const recentEvents = selectedTask ? [...selectedTask.events].slice(-8).reverse() : [];
  const overviewUse3d = overviewViewMode === '3d' && !disable3D && !linkMode && !selectedEdgeKey;
  const selectedTaskEdgeCount = selectedTask ? (edgeLoadByTask.get(selectedTask.id) ?? 0) : 0;
  const selectedTopicActiveCount = selectedTopicGroup
    ? selectedTopicGroup.counts.running + selectedTopicGroup.counts.waiting
    : 0;
  const selectedDecisionOptions = selectedTask?.decision?.options ?? [];
  const canSubmitFreeTextDecision = selectedTask?.decision?.allowFreeText === true && decisionFreeText.trim().length > 0;

  if (detailMode) {
    return (
      <>
        <style>{`${taskStyles}\n${taskDetailStyles}`}</style>
        <div className="task-detail-page">
          <div className="task-detail-topbar">
            <button
              type="button"
              className="task-tool-btn task-detail-back"
              onClick={() => navigate('/tasks')}
            >
              返回任务流
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {selectedTask ? (
                <>
                  <span className={`badge ${selectedTask.status}`}>{getStatusLabel(selectedTask.status)}</span>
                  <span className="badge">{selectedTask.progress}%</span>
                  <span className="badge">{getKindLabel(selectedTask.kind)}</span>
                  <span className="badge">{getTopicLabel(selectedTask.topicId)}</span>
                </>
              ) : null}
              {interiorFallback ? <span className="task-status-badge info">Local detail</span> : null}
            </div>
          </div>

          {selectedTask ? (
            <>
              <section className="task-shell task-detail-hero" data-status={selectedTask.status}>
                <div style={{ color: 'var(--task-dim)', fontSize: 12, letterSpacing: '0.12em', fontWeight: 700 }}>
                  任务详情
                </div>
                <h1>{selectedTask.title}</h1>
                <div className="task-detail-meta">
                  {getKindLabel(selectedTask.kind)} · {getStatusLabel(selectedTask.status)} · 创建于 {formatTime(selectedTask.createdAt)}
                  {selectedTask.currentStageKey ? ` · 当前阶段 ${getStageKeyLabel(selectedTask.currentStageKey)}` : ''}
                  {selectedTask.completedAt ? ` · 完成于 ${formatTime(selectedTask.completedAt)}` : ''}
                </div>
                <div className="task-progress" style={{ marginTop: 14 }}>
                  <span style={{ width: `${selectedTask.progress}%` }} />
                </div>
                <div className="task-badges" style={{ marginTop: 12 }}>
                  <span className={`badge ${selectedTask.status}`}>进度 {selectedTask.progress}%</span>
                  {selectedTask.waitingFor ? <span className="badge waiting">等待 {selectedTask.waitingFor}</span> : null}
                  <span className="badge">{getTopicLabel(selectedTask.topicId)}</span>
                  <span className="badge">{selectedTaskEdgeCount} 条关系</span>
                  <span className="badge">{selectedTask.id}</span>
                </div>
                {(selectedTask.summary || selectedTask.sourceText || recentEvents[0]?.message) ? (
                  <div className="task-detail-copy">
                    <p>{selectedTask.summary || selectedTask.sourceText || recentEvents[0]?.message}</p>
                  </div>
                ) : null}
              </section>

              {selectedTask.status === 'waiting' ? (
                <section className="task-shell task-decision-shell">
                  <div className="task-panel-head">
                    <h1 style={{ margin: 0, fontSize: 16 }}>继续任务</h1>
                  </div>
                  <div className="task-decision-body">
                    <h2 className="task-decision-prompt">
                      {selectedTask.decision?.prompt || selectedTask.waitingFor || '这个任务正在等待你的确认'}
                    </h2>
                    <div className="task-decision-help">
                      如果飞书卡片按钮没有响应，直接在这里确认也能继续任务。这里提交的仍然是同一个后端决策接口，任务状态会立刻恢复推进，并尽量同步回飞书。
                    </div>
                    {selectedDecisionOptions.length > 0 ? (
                      <div className="task-decision-actions">
                        {selectedDecisionOptions.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            className="task-tool-btn task-decision-option"
                            disabled={decisionBusy}
                            onClick={() => { void handleSubmitTaskDecision(option.id); }}
                          >
                            <span className="task-decision-option-title">{option.label}</span>
                            <span className="task-decision-option-copy">
                              {option.description || `决策 ID：${option.id}`}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {selectedTask.decision?.allowFreeText === true ? (
                      <div className="task-decision-note-wrap">
                        <textarea
                          className="task-decision-note"
                          value={decisionFreeText}
                          onChange={(event) => setDecisionFreeText(event.target.value)}
                          placeholder="如果这个确认点需要补充说明，可以在这里填写。"
                          disabled={decisionBusy}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="task-tool-btn"
                            disabled={decisionBusy || !canSubmitFreeTextDecision}
                            onClick={() => { void handleSubmitTaskDecision(); }}
                          >
                            提交文字确认
                          </button>
                          <span className="task-status-badge info">可选补充说明会和确认动作一起提交</span>
                        </div>
                      </div>
                    ) : null}
                    {selectedDecisionOptions.length === 0 && selectedTask.decision?.allowFreeText !== true ? (
                      <span className="task-status-badge warn">当前等待状态没有可直接提交的本地确认选项。</span>
                    ) : null}
                    {decisionBusy ? <span className="task-status-badge info">正在提交确认…</span> : null}
                    {decisionError ? <span className="task-status-badge warn">{decisionError}</span> : null}
                  </div>
                </section>
              ) : null}

              <section className="task-shell task-topic-spotlight">
                <div className="task-topic-spotlight-grid">
                  <div>
                    <div style={{ color: 'var(--task-dim)', fontSize: 12, letterSpacing: '0.12em', fontWeight: 700 }}>
                      话题聚光灯
                    </div>
                    <h2>{selectedTopicGroup?.label || getTopicLabel(selectedTask.topicId)}</h2>
                    <div className="task-topic-spotlight-meta">
                      {selectedTopicGroup?.subtitle || getTopicSubtitle(selectedTask.topicId)}
                    </div>
                    <div className="task-topic-spotlight-pills" style={{ marginTop: 12 }}>
                      <span className="task-overview-pill"><strong>{selectedTopicGroup?.tasks.length ?? 1}</strong> 个任务挂在这个话题下</span>
                      <span className="task-overview-pill"><strong>{selectedTopicActiveCount}</strong> 个任务仍在推进或等待确认</span>
                      <span className="task-overview-pill"><strong>{selectedTaskEdgeCount}</strong> 条星球关系直接连到当前任务</span>
                      <span className="task-overview-pill">
                        {selectedTask.topicId ? shortenMiddle(selectedTask.topicId, 20, 10) : '独立任务'}
                      </span>
                    </div>
                  </div>
                  <div className="task-topic-spotlight-aside">
                    <div className="task-topic-mini-grid">
                      <div className="task-topic-mini-card">
                        <strong>{selectedTopicGroup?.counts.running ?? 0}</strong>
                        <span>自动推进中</span>
                      </div>
                      <div className="task-topic-mini-card">
                        <strong>{selectedTopicGroup?.counts.waiting ?? 0}</strong>
                        <span>等待你确认</span>
                      </div>
                      <div className="task-topic-mini-card">
                        <strong>{selectedTopicGroup?.counts.done ?? 0}</strong>
                        <span>已经沉淀</span>
                      </div>
                      <div className="task-topic-mini-card">
                        <strong>{selectedTopicGroup?.counts.failed ?? 0}</strong>
                        <span>需要恢复处理</span>
                      </div>
                    </div>
                    <div className="task-topic-actions">
                      <button
                        type="button"
                        className="task-tool-btn"
                        onClick={() => navigate('/tasks')}
                      >
                        回到任务流
                      </button>
                      <button
                        type="button"
                        className="task-tool-btn"
                        onClick={() => navigate(`/universe?focus=${encodeURIComponent(selectedTask.id)}`)}
                      >
                        打开话题星图
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <div className="task-detail-grid">
                <main className="task-shell task-detail-main">
                    <div className="task-main-head">
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                        <div>
                          <h1 style={{ margin: 0, fontSize: 18 }}>任务内部视图</h1>
                        <div style={{ marginTop: 6, color: 'var(--task-dim)', fontSize: 13 }}>
                          这个视图围绕当前任务展开，同时把同一话题下的上下文也抬到了顶部，方便快速切换。
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
                          立体工位
                        </button>
                        <button
                          type="button"
                          className={`task-tool-btn ${interiorViewMode === '2d' ? 'active' : ''}`}
                          onClick={() => setInteriorViewMode('2d')}
                        >
                          2D 拓扑
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
	                      <h1 style={{ margin: 0, fontSize: 16 }}>阶段进度</h1>
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
	                      <h1 style={{ margin: 0, fontSize: 16 }}>机器人</h1>
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
	                      <h1 style={{ margin: 0, fontSize: 16 }}>最近事件</h1>
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
                        同话题任务{topicTasks.length > 0 ? ` (${topicTasks.length})` : ''}
                      </h1>
                    </div>
                    <div className="task-panel-body">
                      {topicTasks.length > 0 ? (
                        <div className="task-detail-tasklist">
                          {topicTasks.map((task) => (
                            <button
                              key={task.id}
                              type="button"
                              className={`task-item ${task.id === selectedTask.id ? 'active' : ''}`}
                              data-status={task.status}
                              onClick={() => navigate(`/tasks/${task.id}`)}
                            >
                              <div className="task-item-topline">
                                <div className="task-item-topline-left">
                                  <span className="task-item-kicker">
                                    {task.id === selectedTask.id ? '当前任务' : '同话题'}
                                  </span>
                                  <span className="task-topic-code">
                                    {task.topicId ? shortenMiddle(task.topicId, 16, 8) : '独立任务'}
                                  </span>
                                </div>
                                <div className="task-item-side">
                                  {formatTime(task.updatedAt)}
                                </div>
                              </div>
                              <div className="task-title">{task.title}</div>
                              <div className="task-meta">
                                {getKindLabel(task.kind)} · {getStatusLabel(task.status)} · {task.progress}%
                                {task.currentStageKey ? ` · ${getStageKeyLabel(task.currentStageKey)}` : ''}
                              </div>
                              {task.summary || task.sourceText ? (
                                <div className="task-item-summary">
                                  {task.summary || task.sourceText}
                                </div>
                              ) : null}
                              <div className="task-badges">
                                <span className={`badge ${task.status}`}>{task.progress}%</span>
                                {task.waitingFor ? <span className="badge waiting">等待：{task.waitingFor}</span> : null}
                                <span className="badge">{edgeLoadByTask.get(task.id) ?? 0} 条关系</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="task-empty">
	                          这个任务还没有形成更多话题关联。你可以在任务宇宙视图里手动连线，或继续围绕同一线程追问。
	                        </div>
	                      )}
	                    </div>
	                  </section>
	                </aside>
              </div>
            </>
          ) : (
            <section className="task-shell task-detail-hero">
              <h1 style={{ margin: 0, fontSize: 24 }}>任务不存在</h1>
              <div className="task-detail-meta">
                {loading ? '正在尝试加载任务详情…' : '这个任务链接可能已经失效，或者任务 id 不存在。'}
              </div>
            </section>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`${taskStyles}\n${taskDetailStyles}`}</style>
      <div className="task-page-topbar">
        <div className="task-page-topbar-left">
          <div className="task-page-topbar-dot"></div>
          <div className="task-page-topbar-title">任务空间 · 星球视图</div>
        </div>
        <div className="task-page-topbar-ver">LIVE · v1.8.7</div>
      </div>
      <div className="task-page-layout">
        <aside className="task-panel-left">
          <div className="task-panel-head">
            <h1>话题任务流</h1>
            <div className="task-dim-text">优先按 strict-by-thread 的 topic 聚合，方便一眼看到同一话题下的任务链。</div>
          </div>
          {error ? <div className="task-empty">任务加载失败：{error}</div> : null}
          {!error && tasks.length === 0 && !loading ? (
            <div className="task-empty">还没有任务。发起一次扫描、流水线或飞书复杂请求后，这里就会出现记录。</div>
          ) : null}
          {featuredTopicGroups.length > 0 ? (
            <div className="task-topic-strip">
              {featuredTopicGroups.map((group) => {
                const active = Boolean(selectedTopicGroup && selectedTopicGroup.key === group.key);
                const focusTask = group.tasks[0];
                return (
                  <button
                    key={group.key}
                    type="button"
                    className={`task-topic-card ${active ? 'active' : ''}`}
                    onClick={() => navigate(`/tasks/${focusTask.id}`)}
                  >
                    <div className="task-topic-card-top">
                      <span className={`task-status-badge ${group.counts.waiting > 0 ? 'warn' : 'info'}`}>
                        {group.topicId ? '线程话题' : '独立任务'}
                      </span>
                      <span className="badge">{group.tasks.length} 个任务</span>
                    </div>
                    <div className="task-topic-card-title">{group.label}</div>
                    <div className="task-topic-card-meta">{group.subtitle}</div>
                    <div className="task-topic-card-stats" style={{ marginTop: 10 }}>
                      <span className="badge running">{group.counts.running} 进行中</span>
                      <span className="badge waiting">{group.counts.waiting} 等待中</span>
                      <span className="badge done">{group.counts.done} 已完成</span>
                      {group.counts.failed > 0 ? <span className="badge failed">{group.counts.failed} 失败</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="task-list task-topic-groups">
            {topicGroups.map((group) => (
              <section key={group.key} className="task-topic-section">
                <div className="task-topic-tasklist" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {group.tasks.map((task) => (
                    <button
                      key={task.id}
                      className={`task-item ${task.id === selectedTask?.id ? 'active' : ''}`}
                      data-status={task.status}
                      type="button"
                      onClick={() => navigate(`/tasks/${task.id}`)}
                    >
                      <div className="task-item-topline">
                        <span className="task-item-tag t1">线程话题</span>
                        {task.status === 'running' || task.status === 'waiting' ? (
                          <span className="task-item-tag t2">线程动态</span>
                        ) : null}
                        <span className="task-item-count">{edgeLoadByTask.get(task.id) ?? 0} 关系</span>
                      </div>
                      <div className="task-title">{task.title}</div>
                      <div className="task-meta">{getTopicLabel(task.topicId)} · {getKindLabel(task.kind)}</div>
                      <div className="task-item-pls">
                        <span className="task-item-pl pp">{task.status === 'running' ? '1' : '0'} 进行中</span>
                        <span className="task-item-pl pw">{task.status === 'waiting' ? '1' : '0'} 等待中</span>
                        <span className="task-item-pl pd">{task.status === 'done' ? '1' : '0'} 已完成</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </aside>

        <div className="task-panel-center">
          <div className="task-universe-shell">
            <div className="task-universe-body">
              {loading && planets.length === 0 ? (
                <div className="task-empty">正在加载任务星图…</div>
              ) : overviewUse3d ? (
                <UniverseScene3D
                  planets={planets}
                  edges={edges}
                  selectedId={null}
                  mutedPlanetIds={[]}
                  highlightPlanetIds={selectedTask ? [selectedTask.id] : []}
                  onPlanetClick={(taskId) => { void handlePlanetClick(taskId); }}
                />
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

          <div className="task-main">
            <div className="task-main-head">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <h1>星球内部</h1>
                  <div className="task-dim-text">核心工位、阶段轨道、执行工位，以及实时事件时间线。</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <div className="task-view-switch">
                    <button
                      type="button"
                      className={`${interiorViewMode === '3d' && !disable3D ? 'active' : ''}`}
                      onClick={() => setInteriorViewMode('3d')}
                      disabled={disable3D}
                      title={disable3D ? '3D 视图在当前设备/内置浏览器环境下容易白屏，已默认切换到 2D。' : undefined}
                    >
                      像素办公室
                    </button>
                    <button
                      type="button"
                      className={`${interiorViewMode === '2d' ? 'active' : ''}`}
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
              {selectedTask ? (
                <div style={{ fontSize: '12px', color: 'var(--task-muted)', marginTop: '18px' }}>
                  对话星球 › <span style={{ color: 'var(--task-dim)', fontWeight: 500 }}>{interiorViewMode === '3d' ? '像素办公室' : '2D 环图'}</span>
                </div>
              ) : null}
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
          </div>
        </div>

        <aside className="task-panel-right">
          {selectedTask && interior && interiorTaskId === selectedTask.id ? (
            <>
              <div className="task-right-card">
                <div className="task-right-card-header">
                  <span className="task-right-card-title">任务摘要</span>
                  <span className={`task-right-card-badge ${selectedTask.status === 'done' ? 'done' : 'info'}`}>
                    {getStatusLabel(selectedTask.status)}
                  </span>
                </div>
                <div className="task-dim-text" style={{ fontSize: '12.5px', lineHeight: 1.7, color: 'var(--task-text)' }}>
                  {interior.summary ? interior.summary.split('\n').map((line, i) => (
                    <span key={i}>{line}<br /></span>
                  )) : '任务仍在生成最终结果。'}
                </div>
              </div>

              <div className="task-right-card">
                <div className="task-right-card-header">
                  <span className="task-right-card-title">执行工位</span>
                  <span className="task-right-card-badge info">{interior.agents.length} 个</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px' }}>
                  {interior.agents.map((agent) => (
                    <div key={agent.id} style={{ display: 'flex', flexDirection: 'column', gap: '3px', padding: '7px', border: '1px solid var(--task-border)', borderRadius: '8px', background: 'var(--task-bg)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {agent.name}
                        </div>
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0, background: agent.status === 'done' ? 'var(--task-accent)' : 'var(--task-muted)', opacity: agent.status === 'done' ? 1 : 0.4 }} />
                      </div>
                      <div style={{ fontSize: '9px', fontWeight: 600, color: agent.status === 'done' ? 'var(--task-accent)' : 'var(--task-muted)' }}>
                        {getAgentStatusLabel(agent.status)}
                      </div>
                      <div style={{ fontSize: '9px', color: 'var(--task-dim)', lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {agent.currentAction || '待命中。'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="task-right-card">
                <div className="task-right-card-header">
                  <span className="task-right-card-title">事件时间线</span>
                  <span className="task-right-card-badge error">{interior.events.length} 条</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {[...interior.events].reverse().slice(0, 10).map((event, i) => (
                    <div key={i} style={{ position: 'relative', padding: '11px 0 11px 20px', borderLeft: '2px solid var(--task-border)' }}>
                      <div style={{ position: 'absolute', left: '-5px', top: '15px', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--task-red)', boxShadow: '0 0 6px rgba(196, 113, 59, 0.3)' }} />
                      <div style={{ fontSize: '12px', color: 'var(--task-text)', lineHeight: 1.6, marginBottom: '4px' }}>
                        {event.message}
                      </div>
                      <div style={{ fontFamily: 'JetBrains Mono', fontSize: '10px', color: 'var(--task-muted)' }}>
                        {formatTime(event.time)} · {event.type}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="task-empty">
              {loading ? '正在加载...' : '请选择一个星球查看详情。'}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
