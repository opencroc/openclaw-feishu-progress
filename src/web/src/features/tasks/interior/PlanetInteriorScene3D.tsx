import { useEffect, useMemo, useRef, useState } from 'react';

import {
  getAgentStatusLabel,
  getKindLabel,
  getRoleLabel,
  getStageLabel,
  getStageStatusLabel,
  getStatusLabel,
} from '../labels';
import type {
  PlanetInteriorData,
  PlanetOverviewItem,
} from '@features/tasks/types';
import {
  mountInteriorScene3D,
  type InteriorScene3DHandle,
  type PlanetInteriorHoverState,
} from '@features/tasks/runtime/interior3d';

type PlanetInteriorScene3DProps = {
  planet: PlanetOverviewItem;
  interior: PlanetInteriorData;
  formatTime: (ts?: number) => string;
};

function renderSummary(summary?: string) {
  if (!summary) return <div className="task-empty">还没有摘要，任务仍在生成最终结果。</div>;
  return summary.split(/\n{2,}/).map((block, index) => (
    <p key={`planet-summary-${index}`}>
      {block.split('\n').map((line, lineIndex, lines) => (
        <span key={`planet-summary-${index}-${lineIndex}`}>
          {line}
          {lineIndex < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </p>
  ));
}

function describeTimeRange(stage: PlanetInteriorData['stages'][number], formatTime: (ts?: number) => string): string {
  if (stage.startedAt && stage.completedAt) {
    return `${formatTime(stage.startedAt)} 至 ${formatTime(stage.completedAt)}`;
  }
  if (stage.startedAt) {
    return `开始于 ${formatTime(stage.startedAt)}`;
  }
  if (stage.completedAt) {
    return `结束于 ${formatTime(stage.completedAt)}`;
  }
  return '暂无时间记录';
}

function isSameHoverState(left: PlanetInteriorHoverState | null, right: PlanetInteriorHoverState | null): boolean {
  if (!left || !right) return left === right;
  if (left.kind !== right.kind) return false;
  if (left.kind === 'stage' && right.kind === 'stage') return left.stageKey === right.stageKey;
  if (left.kind === 'agent' && right.kind === 'agent') return left.agentId === right.agentId;
  return true;
}

export default function PlanetInteriorScene3D({ planet, interior, formatTime }: PlanetInteriorScene3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<InteriorScene3DHandle | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [hoverState, setHoverState] = useState<PlanetInteriorHoverState | null>(null);

  const spotlightStageKey = useMemo(() => {
    if (hoverState?.kind === 'stage') return hoverState.stageKey;
    if (hoverState?.kind === 'agent') {
      return interior.agents.find((agent) => agent.id === hoverState.agentId)?.stageKey ?? planet.currentStageKey ?? interior.stages[0]?.key;
    }
    return planet.currentStageKey ?? interior.stages.find((stage) => stage.status === 'running')?.key ?? interior.stages[0]?.key;
  }, [hoverState, interior.agents, interior.stages, planet.currentStageKey]);

  const hoveredAgentId = hoverState?.kind === 'agent' ? hoverState.agentId : null;
  const spotlightStage = interior.stages.find((stage) => stage.key === spotlightStageKey) ?? interior.stages[0] ?? null;
  const hoveredAgent = hoveredAgentId
    ? interior.agents.find((agent) => agent.id === hoveredAgentId) ?? null
    : null;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const runtime = mountInteriorScene3D({
      container,
      canvas,
      onHoverStateChange(nextHoverState) {
        setHoverState((current) => (isSameHoverState(current, nextHoverState) ? current : nextHoverState));
      },
    });
    runtimeRef.current = runtime;

    return () => {
      runtime.dispose();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    runtimeRef.current?.setData({ planet, interior });
  }, [interior, planet]);

  useEffect(() => {
    setHoverState(null);
  }, [planet.id]);

  useEffect(() => {
    runtimeRef.current?.setAutoRotate(autoRotate);
  }, [autoRotate]);

  useEffect(() => {
    runtimeRef.current?.setHighlight({
      spotlightStageKey,
      hoveredAgentId,
    });
  }, [hoveredAgentId, spotlightStageKey]);

  const hudTitle = hoveredAgent
    ? hoveredAgent.name
    : spotlightStage
      ? getStageLabel(spotlightStage.label, spotlightStage.key)
      : planet.title;

  const hudMeta = hoveredAgent
    ? `${getRoleLabel(hoveredAgent.role)} · ${getAgentStatusLabel(hoveredAgent.status)} · ${getStageLabel(hoveredAgent.stageLabel, hoveredAgent.stageKey)}`
    : spotlightStage
      ? `${getStageStatusLabel(spotlightStage.status)} · 进度 ${spotlightStage.progress}%`
      : `${getKindLabel(planet.kind)} · ${getStatusLabel(planet.status)} · ${planet.progress}%`;

  const hudDetail = hoveredAgent
    ? (hoveredAgent.currentAction || '当前没有公开的执行动作。')
    : spotlightStage
      ? (spotlightStage.detail || describeTimeRange(spotlightStage, formatTime))
      : (interior.summary || '这是当前任务的核心剖面。');

  return (
    <div className="planet-interior-shell pixel-office-interior">
      <section className="planet-hero-card pixel-office-panel">
        <div className="planet-hero-copy">
          <div className="planet-hero-kind">{getKindLabel(planet.kind)}星球 · 像素办公室</div>
          <h2>{planet.title}</h2>
          <div className="planet-hero-meta">
            {getStatusLabel(planet.status)} · {planet.progress}% · 复杂度 {planet.complexity}
            {planet.currentStageLabel ? ` · ${getStageLabel(planet.currentStageLabel, planet.currentStageKey)}` : ''}
          </div>
          <div className="task-badges" style={{ marginTop: 12 }}>
            <span className={`badge ${planet.status}`}>{getStatusLabel(planet.status)}</span>
            <span className="badge">创建于 {formatTime(planet.createdAt)}</span>
            <span className="badge">更新于 {formatTime(planet.updatedAt)}</span>
            {interior.waitingFor ? <span className="badge waiting">等待：{interior.waitingFor}</span> : null}
          </div>
        </div>
      </section>

      <div className="planet-interior-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div className="planet-visual-stack">
          <div className="planet-visual-card planet-visual-card-3d pixel-office-panel">
            <div ref={containerRef} className="planet-interior-scene">
              <canvas ref={canvasRef} className="planet-interior-canvas" />

              <div className="planet-interior-scene-overlay">
                <div className="planet-interior-badge">像素办公室</div>
                <div className="planet-interior-hud">
                  <strong>{hudTitle}</strong>
                  <span>{hudMeta}</span>
                  <span>{hudDetail}</span>
                </div>
              </div>

              <div className="planet-interior-toolbar">
                <button type="button" onClick={() => runtimeRef.current?.zoom(1.14)}>+</button>
                <button type="button" onClick={() => runtimeRef.current?.zoom(1 / 1.14)}>-</button>
                <button type="button" onClick={() => runtimeRef.current?.fitAll()}>适配</button>
                <button type="button" onClick={() => runtimeRef.current?.focusCore()}>核心</button>
                <button type="button" onClick={() => setAutoRotate((current) => !current)}>
                  {autoRotate ? '停转' : '旋转'}
                </button>
              </div>
            </div>
          </div>

          <div className="planet-stage-strip">
            {interior.stages.map((stage) => (
              <div
                key={stage.key}
                className={`planet-stage-card pixel-office-panel ${stage.status} ${stage.key === spotlightStageKey ? 'active' : ''}`}
              >
                <div className="planet-stage-top">
                  <strong>{getStageLabel(stage.label, stage.key)}</strong>
                  <span>{stage.progress}%</span>
                </div>
                <div className={`planet-stage-status ${stage.status}`}>{getStageStatusLabel(stage.status)}</div>
                <p>{stage.detail || '暂无阶段说明。'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
