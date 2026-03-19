import { startTransition, useDeferredValue, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { getKindLabel, getStageLabel, getTagLabel, getStatusLabel } from '@features/tasks/labels';
import type { PlanetEdge, PlanetListResponse, PlanetOverviewItem, TaskRecord } from '@features/tasks/types';
import UniverseCanvas from '@features/tasks/universe/UniverseCanvas';
import UniverseScene3D from '@features/tasks/universe/UniverseScene3D';
import { navigate, subscribeNavigation } from '@shared/navigation';

const universeStyles = `
:root {
  --universe-bg: #f6f1e8;
  --universe-panel: rgba(255, 251, 246, 0.9);
  --universe-card: rgba(255, 255, 255, 0.82);
  --universe-border: rgba(100, 83, 61, 0.14);
  --universe-text: #2d261f;
  --universe-dim: #6f6254;
  --universe-muted: #9a8a77;
  --universe-accent: #b78034;
  --universe-cyan: #56748f;
  --universe-green: #2e6b59;
  --universe-purple: #7b6a89;
  --universe-red: #b95a4a;
  --universe-shadow: 0 28px 90px rgba(84, 67, 48, 0.12);
}
html, body, #root { width: 100%; height: 100%; }
body {
  margin: 0;
  font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", "PingFang SC", "Hiragino Sans GB", serif;
  background:
    radial-gradient(circle at top left, rgba(46, 107, 89, 0.08), transparent 26%),
    radial-gradient(circle at 80% 12%, rgba(183, 128, 52, 0.1), transparent 24%),
    radial-gradient(circle at bottom right, rgba(86, 116, 143, 0.08), transparent 22%),
    linear-gradient(180deg, #fbf7f1, #f3ede2 72%);
  color: var(--universe-text);
}
.universe-page {
  min-height: 100%;
  padding: 20px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 18px;
}
.universe-main,
.universe-rail {
  border: 1px solid var(--universe-border);
  border-radius: 28px;
  background: var(--universe-panel);
  box-shadow: var(--universe-shadow);
  backdrop-filter: blur(20px);
  overflow: hidden;
}
.universe-main {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: calc(100vh - 40px);
}
.universe-topbar {
  padding: 20px 22px 18px;
  border-bottom: 1px solid var(--universe-border);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}
.universe-topbar h1 {
  margin: 0;
  font-size: 24px;
  letter-spacing: 0.02em;
}
.universe-copy {
  color: var(--universe-dim);
  margin-top: 8px;
  max-width: 760px;
  line-height: 1.7;
  font-size: 14px;
}
.universe-top-actions,
.universe-action-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.universe-view-switch {
  display: inline-flex;
  gap: 8px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(248, 242, 233, 0.88);
  border: 1px solid var(--universe-border);
}
.universe-btn {
  border: 1px solid var(--universe-border);
  border-radius: 999px;
  padding: 10px 14px;
  background: rgba(255, 251, 246, 0.92);
  color: var(--universe-text);
  font: inherit;
  cursor: pointer;
}
.universe-btn.primary {
  border-color: rgba(183, 128, 52, 0.32);
  background: rgba(183, 128, 52, 0.12);
}
.universe-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.universe-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 11px;
  border-radius: 999px;
  border: 1px solid rgba(100, 83, 61, 0.14);
  background: rgba(255, 251, 246, 0.92);
  color: var(--universe-dim);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}
.universe-status-badge.warn {
  border-color: rgba(183, 128, 52, 0.26);
  background: rgba(183, 128, 52, 0.14);
  color: #8b6327;
}
.universe-canvas-wrap {
  padding: 16px;
  min-height: 0;
}
.universe-filter-bar {
  margin: 16px 16px 0;
  border: 1px solid var(--universe-border);
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(255, 252, 247, 0.98), rgba(247, 240, 230, 0.94));
  padding: 14px;
}
.universe-filter-row,
.universe-filter-pills {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.universe-filter-row + .universe-filter-row,
.universe-filter-row + .universe-filter-pills,
.universe-filter-pills + .universe-filter-pills {
  margin-top: 10px;
}
.universe-search-input,
.universe-select {
  border-radius: 14px;
  border: 1px solid rgba(100, 83, 61, 0.14);
  background: rgba(255, 251, 246, 0.9);
  color: var(--universe-text);
  font: inherit;
}
.universe-search-input {
  flex: 1 1 280px;
  min-width: 180px;
  padding: 11px 14px;
}
.universe-select {
  padding: 10px 12px;
}
.universe-filter-chip {
  border-radius: 999px;
  border: 1px solid rgba(100, 83, 61, 0.14);
  background: rgba(248, 242, 233, 0.88);
  color: var(--universe-dim);
  padding: 7px 11px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.universe-filter-chip.active {
  color: var(--universe-text);
  border-color: rgba(86, 116, 143, 0.3);
  background: rgba(86, 116, 143, 0.12);
}
.universe-filter-meta {
  color: var(--universe-dim);
  font-size: 12px;
  line-height: 1.7;
}
.universe-filter-note {
  margin: 0 16px;
  color: var(--universe-dim);
  font-size: 12px;
  line-height: 1.7;
}
.task-universe-svg {
  width: 100%;
  height: 100%;
  display: block;
}
.task-planet {
  cursor: pointer;
  transition: transform 0.18s ease;
  transform-origin: center;
}
.task-planet:hover { transform: scale(1.03); }
.task-planet.running { animation: universe-planet-pulse 2.1s ease-in-out infinite; }
.task-planet.waiting { animation: universe-planet-blink 2.6s ease-in-out infinite; }
.task-planet-title {
  fill: #2d261f;
  font-size: 12px;
  font-weight: 700;
}
.task-planet-kind,
.task-planet-meta {
  fill: #6f6254;
  font-size: 11px;
  letter-spacing: 0.04em;
}
.task-planet-kind {
  fill: rgba(92, 76, 56, 0.9);
  font-weight: 600;
}
.universe-canvas-shell {
  position: relative;
  height: 100%;
}
.universe-canvas-stage {
  height: 100%;
  min-height: 620px;
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
  color: var(--universe-dim);
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
  color: var(--universe-text);
  font-size: 16px;
}
.universe-scene-hud span,
.universe-scene-note {
  display: block;
  color: var(--universe-dim);
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
  color: var(--universe-text);
  font: inherit;
  cursor: pointer;
}
.universe-rail {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.universe-card {
  border: 1px solid var(--universe-border);
  border-radius: 20px;
  background: var(--universe-card);
  padding: 14px 16px;
}
.universe-card h2,
.universe-card h3 {
  margin: 0;
  font-size: 14px;
}
.universe-stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}
.universe-stat {
  border-radius: 16px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(100, 83, 61, 0.1);
}
.universe-stat strong {
  display: block;
  margin-top: 6px;
  font-size: 22px;
}
.universe-stat span,
.universe-meta-row,
.universe-hint-list li {
  color: var(--universe-dim);
  font-size: 12px;
  line-height: 1.6;
}
.universe-planet-title {
  margin-top: 10px;
  font-size: 20px;
}
.universe-planet-summary {
  margin-top: 10px;
  color: var(--universe-dim);
  line-height: 1.7;
  font-size: 13px;
}
.universe-meta-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
}
.universe-meta-row strong {
  color: var(--universe-text);
}
.universe-chip-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.universe-chip {
  border-radius: 999px;
  padding: 5px 9px;
  font-size: 11px;
  border: 1px solid rgba(100, 83, 61, 0.12);
  background: rgba(248, 242, 233, 0.88);
  color: var(--universe-dim);
}
.universe-edge-copy {
  margin-top: 10px;
  color: var(--universe-dim);
  line-height: 1.7;
  font-size: 13px;
}
.universe-hint-list {
  margin: 10px 0 0;
  padding-left: 18px;
}
.universe-empty {
  color: var(--universe-dim);
  text-align: center;
  display: grid;
  place-items: center;
  height: 100%;
}
@keyframes universe-planet-pulse {
  0%, 100% { opacity: 0.88; }
  50% { opacity: 1; }
}
@keyframes universe-planet-blink {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}
@media (max-width: 1080px) {
  .universe-page {
    grid-template-columns: 1fr;
  }
  .universe-main {
    min-height: auto;
  }
  .universe-canvas-stage {
    min-height: 520px;
  }
}
@media (max-width: 720px) {
  .universe-page {
    padding: 12px;
  }
  .universe-topbar {
    flex-direction: column;
  }
  .universe-stat-grid {
    grid-template-columns: 1fr 1fr;
  }
  .universe-filter-row {
    flex-direction: column;
  }
}
`;

type UniverseDatePreset = 'all' | 'today' | '7d' | '30d';
type UniverseViewMode = '2d' | '3d';

const STATUS_OPTIONS: PlanetOverviewItem['status'][] = ['running', 'waiting', 'done', 'failed', 'queued', 'archived'];
const DATE_PRESET_OPTIONS: Array<{ value: UniverseDatePreset; label: string }> = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7d' },
  { value: '30d', label: 'Last 30d' },
];

function edgeKey(edge: Pick<PlanetEdge, 'fromPlanetId' | 'toPlanetId'>): string {
  return `${edge.fromPlanetId}::${edge.toPlanetId}`;
}

function formatTime(value?: number): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function findPlanetTitle(planets: PlanetOverviewItem[], planetId: string): string {
  return planets.find((planet) => planet.id === planetId)?.title ?? planetId;
}

function parseFocusPlanetId(search: string): string | null {
  const focus = new URLSearchParams(search).get('focus');
  return focus || null;
}

function parseViewMode(search: string): UniverseViewMode {
  const view = new URLSearchParams(search).get('view');
  return view === '2d' ? '2d' : '3d';
}

function buildUniverseUrl(focusPlanetId: string | null | undefined, viewMode: UniverseViewMode): string {
  const params = new URLSearchParams();
  if (focusPlanetId) {
    params.set('focus', focusPlanetId);
  }
  if (viewMode !== '3d') {
    params.set('view', viewMode);
  }
  const query = params.toString();
  return query ? `/universe?${query}` : '/universe';
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

function toggleFilter<T>(values: T[], nextValue: T): T[] {
  return values.includes(nextValue)
    ? values.filter((value) => value !== nextValue)
    : [...values, nextValue];
}

function getDateThreshold(preset: UniverseDatePreset): number | null {
  const now = new Date();
  if (preset === 'all') return null;
  if (preset === 'today') {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return startOfDay.getTime();
  }

  const dayCount = preset === '7d' ? 7 : 30;
  return now.getTime() - dayCount * 24 * 60 * 60 * 1000;
}

function buildPlanetSearchText(planet: PlanetOverviewItem): string {
  return [
    planet.title,
    planet.kind,
    planet.currentStageKey,
    planet.currentStageLabel,
    planet.sourceText,
    planet.summary,
    ...planet.tags,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();
}

function sortTasks(tasks: TaskRecord[]): TaskRecord[] {
  return [...tasks].sort((left, right) => right.updatedAt - left.updatedAt);
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

function upsertTask(tasks: TaskRecord[], nextTask: TaskRecord): TaskRecord[] {
  const index = tasks.findIndex((task) => task.id === nextTask.id);
  if (index === -1) return sortTasks([nextTask, ...tasks]);
  const next = [...tasks];
  next[index] = nextTask;
  return sortTasks(next);
}

export default function UniversePage() {
  const search = useSyncExternalStore(subscribeNavigation, () => window.location.search, () => '');
  const focusPlanetId = parseFocusPlanetId(search);
  const viewMode = parseViewMode(search);
  const [planets, setPlanets] = useState<PlanetOverviewItem[]>([]);
  const [edges, setEdges] = useState<PlanetEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fallbackMode, setFallbackMode] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedPlanetId, setSelectedPlanetId] = useState<string | null>(focusPlanetId);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilters, setStatusFilters] = useState<PlanetOverviewItem['status'][]>([]);
  const [kindFilters, setKindFilters] = useState<string[]>([]);
  const [datePreset, setDatePreset] = useState<UniverseDatePreset>('all');
  const [minComplexity, setMinComplexity] = useState(0);
  const deferredSearchText = useDeferredValue(searchText.trim().toLowerCase());

  useEffect(() => {
    if (focusPlanetId) {
      setSelectedPlanetId(focusPlanetId);
    }
  }, [focusPlanetId]);

  useEffect(() => {
    if (viewMode === '3d') {
      setSelectedEdgeKey(null);
    }
  }, [viewMode]);

  useEffect(() => {
    let cancelled = false;

    async function loadUniverse(): Promise<void> {
      setError(null);
      try {
        const data = await fetchJson<PlanetListResponse>('/api/planets?limit=120');
        if (cancelled) return;
        setPlanets((data.planets || []).sort((left, right) => right.updatedAt - left.updatedAt));
        setEdges(data.edges || []);
        setFallbackMode(false);
        setSelectedEdgeKey((current) => {
          if (!current) return null;
          return (data.edges || []).some((edge) => edgeKey(edge) === current) ? current : null;
        });
      } catch {
        try {
          const taskData = await fetchJson<{ ok: true; tasks: TaskRecord[] }>('/api/tasks?limit=120');
          if (cancelled) return;

          let nextTasks = sortTasks(taskData.tasks || []);
          if (focusPlanetId && !nextTasks.some((task) => task.id === focusPlanetId)) {
            try {
              const selected = await fetchJson<{ ok: true; task: TaskRecord }>(`/api/tasks/${focusPlanetId}`);
              if (!cancelled) {
                nextTasks = upsertTask(nextTasks, selected.task);
              }
            } catch {
              // Keep the fallback universe usable even if the focused task no longer exists.
            }
          }

          if (cancelled) return;
          setPlanets(buildFallbackPlanets(nextTasks));
          setEdges([]);
          setFallbackMode(true);
          setSelectedEdgeKey(null);
        } catch (loadError) {
          if (!cancelled) {
            setError(loadError instanceof Error ? loadError.message : String(loadError));
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadUniverse();

    return () => {
      cancelled = true;
    };
  }, [focusPlanetId, refreshTick]);

  useEffect(() => {
    const socket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`);

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'task:update') {
          startTransition(() => {
            setRefreshTick((current) => current + 1);
          });
        }
      } catch {
        // Ignore malformed messages.
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  useEffect(() => {
    if (selectedPlanetId && planets.some((planet) => planet.id === selectedPlanetId)) {
      return;
    }

    const fallback = focusPlanetId && planets.some((planet) => planet.id === focusPlanetId)
      ? focusPlanetId
      : planets.find((planet) => planet.status === 'running')
        ?.id || planets[0]?.id || null;

    setSelectedPlanetId(fallback);
  }, [focusPlanetId, planets, selectedPlanetId]);

  const selectedPlanet = useMemo(
    () => planets.find((planet) => planet.id === selectedPlanetId) ?? null,
    [planets, selectedPlanetId],
  );

  const selectedEdge = useMemo(
    () => edges.find((edge) => edgeKey(edge) === selectedEdgeKey) ?? null,
    [edges, selectedEdgeKey],
  );

  const kindOptions = useMemo(
    () => [...new Set(planets.map((planet) => planet.kind))].sort((left, right) => left.localeCompare(right)),
    [planets],
  );

  const filteredUniverse = useMemo(() => {
    const threshold = getDateThreshold(datePreset);
    const matchedPlanets = planets.filter((planet) => {
      if (statusFilters.length > 0 && !statusFilters.includes(planet.status)) return false;
      if (kindFilters.length > 0 && !kindFilters.includes(planet.kind)) return false;
      if (planet.complexity < minComplexity) return false;
      if (threshold !== null && planet.createdAt < threshold) return false;
      if (!deferredSearchText) return true;
      return buildPlanetSearchText(planet).includes(deferredSearchText);
    });

    const matchedPlanetIds = new Set(matchedPlanets.map((planet) => planet.id));
    const emphasizedPlanetIds = new Set(matchedPlanetIds);
    if (selectedPlanetId) emphasizedPlanetIds.add(selectedPlanetId);
    if (focusPlanetId) emphasizedPlanetIds.add(focusPlanetId);

    const visibleEdges = edges.filter((edge) => (
      emphasizedPlanetIds.has(edge.fromPlanetId) && emphasizedPlanetIds.has(edge.toPlanetId)
    ));

    const mutedPlanetIds = planets
      .filter((planet) => !emphasizedPlanetIds.has(planet.id))
      .map((planet) => planet.id);
    const mutedEdgeKeys = visibleEdges
      .filter((edge) => !(matchedPlanetIds.has(edge.fromPlanetId) && matchedPlanetIds.has(edge.toPlanetId)))
      .map((edge) => edgeKey(edge));

    const searchMatchedPlanetIds = deferredSearchText
      ? matchedPlanets.map((planet) => planet.id)
      : [];

    return {
      matchedPlanets,
      matchedPlanetIds,
      mutedPlanetIds,
      visibleEdges,
      mutedEdgeKeys,
      searchMatchedPlanetIds,
    };
  }, [datePreset, deferredSearchText, edges, focusPlanetId, kindFilters, minComplexity, planets, selectedPlanetId, statusFilters]);

  const activeFilterCount = useMemo(() => (
    (deferredSearchText ? 1 : 0)
    + (statusFilters.length > 0 ? 1 : 0)
    + (kindFilters.length > 0 ? 1 : 0)
    + (datePreset !== 'all' ? 1 : 0)
    + (minComplexity > 0 ? 1 : 0)
  ), [datePreset, deferredSearchText, kindFilters.length, minComplexity, statusFilters.length]);

  const selectedPlanetMatchesFilters = selectedPlanet
    ? filteredUniverse.matchedPlanetIds.has(selectedPlanet.id)
    : false;

  const stats = useMemo(() => ({
    total: planets.length,
    visible: filteredUniverse.matchedPlanets.length,
    running: planets.filter((planet) => planet.status === 'running').length,
    waiting: planets.filter((planet) => planet.status === 'waiting').length,
    done: planets.filter((planet) => planet.status === 'done').length,
    failed: planets.filter((planet) => planet.status === 'failed').length,
    manualEdges: edges.filter((edge) => edge.source === 'manual').length,
    autoEdges: edges.filter((edge) => edge.source === 'auto').length,
  }), [edges, filteredUniverse.matchedPlanets.length, planets]);

  return (
    <>
      <style>{universeStyles}</style>
      <div className="universe-page">
        <main className="universe-main">
          <header className="universe-topbar">
            <div>
              <h1>OpenCroc 星球宇宙</h1>
              <div className="universe-copy">
                {viewMode === '3d'
                  ? <>这是全屏 3D 任务宇宙。拖拽旋转，滚轮缩放，双击星球快速聚焦；如果你要更高的信息密度，可以随时切回 2D 图谱。</>
                  : <>这是全屏任务宇宙视图。滚轮缩放、拖拽平移，按 <code>F</code> 适配全部星球，按 <code>0</code> 回到默认视角。</>}
              </div>
            </div>
            <div className="universe-top-actions">
              <div className="universe-view-switch">
                <button
                  type="button"
                  className={`universe-btn ${viewMode === '3d' ? 'primary' : ''}`}
                  onClick={() => navigate(buildUniverseUrl(selectedPlanet?.id ?? focusPlanetId, '3d'))}
                >
                  3D 星图
                </button>
                <button
                  type="button"
                  className={`universe-btn ${viewMode === '2d' ? 'primary' : ''}`}
                  onClick={() => navigate(buildUniverseUrl(selectedPlanet?.id ?? focusPlanetId, '2d'))}
                >
                  2D 图谱
                </button>
              </div>
              {fallbackMode ? (
                <span className="universe-status-badge warn">仅任务接口</span>
              ) : null}
              <button type="button" className="universe-btn" onClick={() => navigate('/tasks')}>
                返回任务页
              </button>
              <button
                type="button"
                className="universe-btn primary"
                disabled={!selectedPlanet}
                onClick={() => selectedPlanet && navigate(`/tasks/${selectedPlanet.id}`)}
              >
                打开详情
              </button>
            </div>
          </header>

          <section className="universe-filter-bar">
            <div className="universe-filter-row">
              <input
                className="universe-search-input"
                type="search"
                value={searchText}
                placeholder="搜索标题、原始提问、标签或阶段..."
                onChange={(event) => setSearchText(event.target.value)}
              />
              <select
                className="universe-select"
                value={datePreset}
                onChange={(event) => setDatePreset(event.target.value as UniverseDatePreset)}
              >
              {DATE_PRESET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value === 'all' ? '全部时间' : option.value === 'today' ? '今天' : option.value === '7d' ? '最近 7 天' : '最近 30 天'}
                  </option>
                ))}
              </select>
              <select
                className="universe-select"
                value={String(minComplexity)}
                onChange={(event) => setMinComplexity(Number(event.target.value))}
              >
                <option value="0">任意复杂度</option>
                <option value="3">复杂度 3+</option>
                <option value="5">复杂度 5+</option>
                <option value="7">复杂度 7+</option>
              </select>
              <button
                type="button"
                className="universe-btn"
                disabled={activeFilterCount === 0}
                onClick={() => {
                  setSearchText('');
                  setStatusFilters([]);
                  setKindFilters([]);
                  setDatePreset('all');
                  setMinComplexity(0);
                }}
              >
                重置筛选
              </button>
            </div>
            <div className="universe-filter-pills">
              {STATUS_OPTIONS.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`universe-filter-chip ${statusFilters.includes(status) ? 'active' : ''}`}
                  onClick={() => setStatusFilters((current) => toggleFilter(current, status))}
                >
                  {getStatusLabel(status)}
                </button>
              ))}
            </div>
            {kindOptions.length > 0 ? (
              <div className="universe-filter-pills">
                {kindOptions.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={`universe-filter-chip ${kindFilters.includes(kind) ? 'active' : ''}`}
                    onClick={() => setKindFilters((current) => toggleFilter(current, kind))}
                  >
                    {getKindLabel(kind)}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="universe-filter-meta">
              当前命中 {filteredUniverse.matchedPlanets.length} 颗星球，共 {planets.length} 颗
              {activeFilterCount > 0 ? ` · 已启用 ${activeFilterCount} 组筛选` : ''}
              {deferredSearchText ? ` · 搜索：“${deferredSearchText}”` : ''}
              {fallbackMode ? ' · 已进入降级模式' : ''}
            </div>
          </section>

          <div className="universe-canvas-wrap">
            {loading && planets.length === 0 ? (
              <div className="universe-empty">正在加载星球宇宙…</div>
            ) : error && planets.length === 0 ? (
              <div className="universe-empty">星球宇宙加载失败：{error}</div>
            ) : (
              <>
                {filteredUniverse.matchedPlanets.length === 0 ? (
                  <div className="universe-filter-note">
                    当前筛选没有命中任何星球。其余星球会以弱化方式保留，方便你放宽条件后继续查看上下文。
                  </div>
                ) : null}
                {fallbackMode ? (
                  <div className="universe-filter-note">
                    当前服务器尚未提供 Planet API。现在展示的是由 `/api/tasks` 推导出的宇宙视图，因此连线关系和更丰富的星球元数据暂不可用。
                  </div>
                ) : null}
                {viewMode === '3d' ? (
                  <UniverseScene3D
                    planets={planets}
                    edges={filteredUniverse.visibleEdges}
                    selectedId={selectedPlanet?.id ?? null}
                    focusPlanetId={focusPlanetId}
                    mutedPlanetIds={filteredUniverse.mutedPlanetIds}
                    highlightPlanetIds={filteredUniverse.searchMatchedPlanetIds}
                    onPlanetClick={(planetId) => {
                      setSelectedPlanetId(planetId);
                      setSelectedEdgeKey(null);
                      navigate(buildUniverseUrl(planetId, '3d'));
                    }}
                  />
                ) : (
                  <UniverseCanvas
                    planets={planets}
                    edges={filteredUniverse.visibleEdges}
                    selectedId={selectedPlanet?.id ?? null}
                    selectedEdgeKey={selectedEdgeKey}
                    focusPlanetId={focusPlanetId}
                    mutedPlanetIds={filteredUniverse.mutedPlanetIds}
                    mutedEdgeKeys={filteredUniverse.mutedEdgeKeys}
                    highlightPlanetIds={filteredUniverse.searchMatchedPlanetIds}
                    onPlanetClick={(planetId) => {
                      setSelectedPlanetId(planetId);
                      setSelectedEdgeKey(null);
                      navigate(buildUniverseUrl(planetId, '2d'));
                    }}
                    onEdgeClick={(edge) => {
                      setSelectedEdgeKey(edgeKey(edge));
                    }}
                  />
                )}
              </>
            )}
          </div>
        </main>

        <aside className="universe-rail">
          <section className="universe-card">
            <h2>宇宙概览</h2>
            <div className="universe-stat-grid">
              <div className="universe-stat"><span>星球总数</span><strong>{stats.total}</strong></div>
              <div className="universe-stat"><span>筛选命中</span><strong style={{ color: 'var(--universe-cyan)' }}>{stats.visible}</strong></div>
              <div className="universe-stat"><span>执行中</span><strong style={{ color: 'var(--universe-accent)' }}>{stats.running}</strong></div>
              <div className="universe-stat"><span>待确认</span><strong style={{ color: 'var(--universe-purple)' }}>{stats.waiting}</strong></div>
              <div className="universe-stat"><span>已完成</span><strong style={{ color: 'var(--universe-green)' }}>{stats.done}</strong></div>
              <div className="universe-stat"><span>失败</span><strong style={{ color: 'var(--universe-red)' }}>{stats.failed}</strong></div>
              <div className="universe-stat"><span>可见连线</span><strong style={{ color: 'var(--universe-cyan)' }}>{filteredUniverse.visibleEdges.length}</strong></div>
            </div>
            <div className="universe-planet-summary" style={{ marginTop: 12 }}>
              {fallbackMode
                ? '当前为降级模式，待 planets API 部署后才会恢复自动关系推断。'
                : `自动关系 ${stats.autoEdges} 条 · 手动关系 ${stats.manualEdges} 条`}
            </div>
          </section>

          <section className="universe-card">
            <h2>当前星球</h2>
            {selectedPlanet ? (
              <>
                <div className="universe-planet-title">{selectedPlanet.title}</div>
                <div className="universe-planet-summary">
                  {getKindLabel(selectedPlanet.kind)} · {getStatusLabel(selectedPlanet.status)} · 完成度 {selectedPlanet.progress}%
                </div>
                {!selectedPlanetMatchesFilters ? (
                  <div className="universe-planet-summary">
                    这颗星球不在当前筛选结果内，但因为它正被选中或聚焦，所以仍然保留显示。
                  </div>
                ) : null}
                <div className="universe-meta-list">
                  <div className="universe-meta-row"><strong>阶段：</strong> {selectedPlanet.currentStageLabel ? getStageLabel(selectedPlanet.currentStageLabel, selectedPlanet.currentStageKey) : selectedPlanet.currentStageKey ? getStageLabel(undefined, selectedPlanet.currentStageKey) : '—'}</div>
                  <div className="universe-meta-row"><strong>最近更新：</strong> {formatTime(selectedPlanet.updatedAt)}</div>
                  <div className="universe-meta-row"><strong>创建时间：</strong> {formatTime(selectedPlanet.createdAt)}</div>
                  <div className="universe-meta-row"><strong>复杂度：</strong> {selectedPlanet.complexity} / 10</div>
                  <div className="universe-meta-row"><strong>半径：</strong> {selectedPlanet.radius}px</div>
                </div>
                <div className="universe-chip-row">
                  {selectedPlanet.tags.map((tag) => (
                    <span key={tag} className="universe-chip">{getTagLabel(tag)}</span>
                  ))}
                </div>
                <div className="universe-action-row" style={{ marginTop: 14 }}>
                  <button type="button" className="universe-btn primary" onClick={() => navigate(`/tasks/${selectedPlanet.id}`)}>
                    打开详情
                  </button>
                  <button type="button" className="universe-btn" onClick={() => navigate(buildUniverseUrl(selectedPlanet.id, viewMode))}>
                    保持聚焦
                  </button>
                </div>
              </>
            ) : (
              <div className="universe-planet-summary">还没有选中星球。</div>
            )}
          </section>

          <section className="universe-card">
            <h3>当前关系</h3>
            {fallbackMode ? (
              <div className="universe-planet-summary">当前只暴露了 `/api/tasks`，降级模式下无法查看关系详情。</div>
            ) : viewMode === '3d' ? (
              <div className="universe-planet-summary">3D 视图当前优先支持星球选择、聚焦和空间浏览；关系原因说明请切换到 2D 图谱查看。</div>
            ) : selectedEdge ? (
              <div className="universe-edge-copy">
                <strong>{findPlanetTitle(planets, selectedEdge.fromPlanetId)}</strong> → <strong>{findPlanetTitle(planets, selectedEdge.toPlanetId)}</strong><br />
                {selectedEdge.type === 'depends-on' ? '依赖' : selectedEdge.type === 'supersedes' ? '替代' : '相关'} · {selectedEdge.source === 'manual' ? '手动' : '自动'} · 置信度 {(selectedEdge.confidence * 100).toFixed(0)}%
                {selectedEdge.reason ? <><br />{selectedEdge.reason}</> : null}
              </div>
            ) : (
              <div className="universe-planet-summary">点击一条关系线，就能查看它为什么会存在。</div>
            )}
          </section>

          <section className="universe-card">
            <h3>画布操作</h3>
            <ul className="universe-hint-list">
              {viewMode === '3d' ? (
                <>
                  <li>拖拽画布会围绕宇宙中心旋转镜头。</li>
                  <li>滚轮缩放，右键或触控板双指可以平移。</li>
                  <li>双击星球快速聚焦，双击留白重新适配全局。</li>
                  <li>右下角工具条可切换自动旋转和手动聚焦。</li>
                </>
              ) : (
                <>
                  <li>鼠标滚轮或触控板滚动会围绕指针位置缩放。</li>
                  <li>拖拽空白画布可以在宇宙中平移视角。</li>
                  <li>双击空白背景或按 <code>F</code> 可以适配全部星球。</li>
                  <li>按 <code>0</code> 回到默认中心视角。</li>
                </>
              )}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
