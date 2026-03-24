import AgentWorkstation from './AgentWorkstation';
import EventTimeline from './EventTimeline';
import StageSector from './StageSector';
import { getAgentStatusLabel, getKindLabel, getRoleLabel, getStageLabel, getStageStatusLabel, getStatusLabel } from '../labels';
import type { PlanetInteriorData, PlanetOverviewItem } from '@features/tasks/types';

type PlanetInteriorProps = {
  planet: PlanetOverviewItem;
  interior: PlanetInteriorData;
  formatTime: (ts?: number) => string;
};

const CORE_SIZE = 560;
const CORE_CENTER = CORE_SIZE / 2;
const CORE_RADIUS = 78;
const RING_INNER_RADIUS = 104;
const RING_OUTER_RADIUS = 178;
const WORKSTATION_RADIUS = 220;

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

export default function PlanetInterior({ planet, interior, formatTime }: PlanetInteriorProps) {
  return (
    <div className="planet-interior-shell">
      <section className="planet-hero-card">
        <div className="planet-hero-copy">
          <div className="planet-hero-kind">{getKindLabel(planet.kind)}星球</div>
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
          <div className="planet-visual-card">
            <svg className="planet-interior-svg" viewBox={`0 0 ${CORE_SIZE} ${CORE_SIZE}`} role="img" aria-label={`${planet.title} interior`}>
              <defs>
                <radialGradient id="planet-core-fill" cx="50%" cy="50%" r="60%">
                  <stop offset="0%" stopColor="rgba(86, 116, 143, 0.18)" />
                  <stop offset="100%" stopColor="rgba(255, 249, 241, 0.98)" />
                </radialGradient>
              </defs>

              <circle cx={CORE_CENTER} cy={CORE_CENTER} r={WORKSTATION_RADIUS + 26} fill="rgba(86, 116, 143, 0.04)" />

              {interior.stages.map((stage) => (
                <StageSector
                  key={stage.key}
                  stage={stage}
                  cx={CORE_CENTER}
                  cy={CORE_CENTER}
                  innerRadius={RING_INNER_RADIUS}
                  outerRadius={RING_OUTER_RADIUS}
                />
              ))}

              <circle
                cx={CORE_CENTER}
                cy={CORE_CENTER}
                r={CORE_RADIUS + 8}
                fill="none"
                stroke="rgba(111, 98, 84, 0.14)"
                strokeWidth="3"
              />
              <circle cx={CORE_CENTER} cy={CORE_CENTER} r={CORE_RADIUS} fill="url(#planet-core-fill)" stroke="rgba(86, 116, 143, 0.24)" strokeWidth="2" />
              <text x={CORE_CENTER} y={CORE_CENTER - 22} textAnchor="middle" fill="#7f7061" fontSize="12" fontWeight="700">
                任务核心
              </text>
              <text x={CORE_CENTER} y={CORE_CENTER + 8} textAnchor="middle" fill="#372d25" fontSize="34" fontWeight="800">
                {planet.progress}%
              </text>
              <text x={CORE_CENTER} y={CORE_CENTER + 32} textAnchor="middle" fill="#7b6c5b" fontSize="12">
                {planet.currentStageLabel ? getStageLabel(planet.currentStageLabel, planet.currentStageKey) : getStatusLabel(planet.status)}
              </text>

              {interior.agents.map((agent) => (
                <AgentWorkstation
                  key={agent.id}
                  agent={agent}
                  cx={CORE_CENTER}
                  cy={CORE_CENTER}
                  radius={WORKSTATION_RADIUS}
                />
              ))}
            </svg>
          </div>

          <div className="planet-stage-strip">
            {interior.stages.map((stage) => (
              <div key={stage.key} className={`planet-stage-card ${stage.status}`}>
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
