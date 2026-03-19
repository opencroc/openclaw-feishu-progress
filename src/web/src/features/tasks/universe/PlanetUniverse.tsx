import type { KeyboardEvent } from 'react';

import EdgeLine from './EdgeLine';
import { getKindLabel, getStageLabel, getStatusLabel } from '../labels';
import type { PlanetEdge, PlanetOverviewItem } from '@features/tasks/types';

export const PLANET_UNIVERSE_VIEW_BOX = { width: 860, height: 520 };

export type PlanetUniverseViewport = {
  centerX: number;
  centerY: number;
  zoom: number;
};

type PlanetUniverseProps = {
  planets: PlanetOverviewItem[];
  edges: PlanetEdge[];
  selectedId: string | null;
  selectedEdgeKey?: string | null;
  linkSourceId?: string | null;
  mutedPlanetIds?: string[];
  mutedEdgeKeys?: string[];
  highlightPlanetIds?: string[];
  viewport?: PlanetUniverseViewport;
  onPlanetClick: (id: string) => void;
  onEdgeClick?: (edge: PlanetEdge) => void;
};

const STATUS_STYLES: Record<PlanetOverviewItem['status'], { fill: string; stroke: string; glow: string | null }> = {
  queued: { fill: '#f1efe8', stroke: '#7b7466', glow: null },
  running: { fill: '#faeeda', stroke: '#8a5210', glow: '#ef9f27' },
  waiting: { fill: '#eeedfe', stroke: '#5a4fd1', glow: '#8b82f4' },
  done: { fill: '#e1f5ee', stroke: '#0f6e56', glow: null },
  failed: { fill: '#fcebea', stroke: '#b43b3b', glow: null },
  archived: { fill: '#e7e3d8', stroke: '#a8a293', glow: null },
};

function progressRing(radius: number, progress: number): { circumference: number; dashOffset: number } {
  const normalizedRadius = radius + 10;
  const circumference = 2 * Math.PI * normalizedRadius;
  return {
    circumference,
    dashOffset: circumference - (Math.max(0, Math.min(progress, 100)) / 100) * circumference,
  };
}

function handleKeyPress(event: KeyboardEvent<SVGGElement>, onClick: () => void): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onClick();
  }
}

function truncateTitle(title: string): string {
  return title.length > 16 ? `${title.slice(0, 15)}…` : title;
}

function edgeKey(edge: PlanetEdge): string {
  return `${edge.fromPlanetId}::${edge.toPlanetId}`;
}

export default function PlanetUniverse({
  planets,
  edges,
  selectedId,
  selectedEdgeKey,
  linkSourceId,
  mutedPlanetIds = [],
  mutedEdgeKeys = [],
  highlightPlanetIds = [],
  viewport,
  onPlanetClick,
  onEdgeClick,
}: PlanetUniverseProps) {
  const planetMap = new Map(planets.map((planet) => [planet.id, planet]));
  const mutedPlanetSet = new Set(mutedPlanetIds);
  const mutedEdgeSet = new Set(mutedEdgeKeys);
  const highlightPlanetSet = new Set(highlightPlanetIds);
  const viewState = viewport ?? {
    centerX: PLANET_UNIVERSE_VIEW_BOX.width / 2,
    centerY: PLANET_UNIVERSE_VIEW_BOX.height / 2,
    zoom: 1,
  };
  const contentTransform = [
    `translate(${PLANET_UNIVERSE_VIEW_BOX.width / 2} ${PLANET_UNIVERSE_VIEW_BOX.height / 2})`,
    `scale(${viewState.zoom})`,
    `translate(${-viewState.centerX} ${-viewState.centerY})`,
  ].join(' ');

  return (
    <svg
      className="task-universe-svg"
      viewBox={`0 0 ${PLANET_UNIVERSE_VIEW_BOX.width} ${PLANET_UNIVERSE_VIEW_BOX.height}`}
      role="img"
      aria-label="Task planet universe"
    >
      <defs>
        <radialGradient id="task-universe-bg" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="rgba(96, 165, 250, 0.16)" />
          <stop offset="100%" stopColor="rgba(10, 16, 29, 0)" />
        </radialGradient>
        <filter id="task-planet-glow" x="-200%" y="-200%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="9" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width={PLANET_UNIVERSE_VIEW_BOX.width} height={PLANET_UNIVERSE_VIEW_BOX.height} rx="28" fill="url(#task-universe-bg)" />
      <circle cx="160" cy="84" r="120" fill="rgba(96, 165, 250, 0.08)" />
      <circle cx="718" cy="116" r="84" fill="rgba(52, 211, 153, 0.06)" />
      <circle cx="720" cy="412" r="120" fill="rgba(251, 191, 36, 0.04)" />

      <g transform={contentTransform}>
        {edges.map((edge) => (
          <EdgeLine
            key={edgeKey(edge)}
            edge={edge}
            fromPlanet={planetMap.get(edge.fromPlanetId)}
            toPlanet={planetMap.get(edge.toPlanetId)}
            selected={selectedEdgeKey === edgeKey(edge)}
            muted={mutedEdgeSet.has(edgeKey(edge))}
            onClick={onEdgeClick}
          />
        ))}

        {planets.map((planet) => {
          const colors = STATUS_STYLES[planet.status];
          const ring = progressRing(planet.radius, planet.progress);
          const active = planet.id === selectedId;
          const linking = planet.id === linkSourceId;
          const highlighted = highlightPlanetSet.has(planet.id);
          const muted = mutedPlanetSet.has(planet.id) && !active && !linking && !highlighted;

          return (
            <g
              key={planet.id}
              className={`task-planet ${planet.status === 'running' ? 'running' : ''} ${planet.status === 'waiting' ? 'waiting' : ''} ${linking ? 'link-source' : ''}`}
              transform={`translate(${planet.position.x}, ${planet.position.y})`}
              opacity={muted ? 0.16 : 1}
              role="button"
              tabIndex={0}
              aria-label={`${planet.title}, ${planet.status}, ${planet.progress}%`}
              onClick={() => onPlanetClick(planet.id)}
              onKeyDown={(event) => handleKeyPress(event, () => onPlanetClick(planet.id))}
            >
              {colors.glow ? (
                <circle
                  r={planet.radius + 15}
                  fill={colors.glow}
                  opacity={planet.status === 'running' ? 0.24 : 0.18}
                  filter="url(#task-planet-glow)"
                />
              ) : null}

              <circle
                r={planet.radius + 10}
                fill="none"
                stroke="rgba(148, 163, 184, 0.14)"
                strokeWidth="3"
              />
              {highlighted ? (
                <circle
                  r={planet.radius + 18}
                  fill="none"
                  stroke="#5bd7d2"
                  strokeWidth="2.5"
                  opacity="0.72"
                  strokeDasharray="6 7"
                />
              ) : null}
              <circle
                r={planet.radius + 10}
                fill="none"
                stroke={planet.status === 'failed' ? '#f87171' : '#60a5fa'}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={ring.circumference}
                strokeDashoffset={ring.dashOffset}
                transform="rotate(-90)"
                opacity={planet.status === 'queued' || planet.status === 'archived' ? 0.18 : 0.92}
              />
              <circle
                r={planet.radius}
                fill={colors.fill}
                stroke={linking ? '#fbbf24' : active ? '#34d399' : colors.stroke}
                strokeWidth={linking ? 4.5 : active ? 4 : 2.5}
              />
              <circle
                r={Math.max(8, planet.radius * 0.28)}
                fill="rgba(255, 255, 255, 0.18)"
                opacity={planet.status === 'archived' ? 0.2 : 0.42}
              />
              <text className="task-planet-kind" textAnchor="middle" y={-planet.radius - 18}>
                {getKindLabel(planet.kind)}
              </text>
              <text className="task-planet-title" textAnchor="middle" y="5">
                {truncateTitle(planet.title)}
              </text>
              <text className="task-planet-meta" textAnchor="middle" y={planet.radius + 22}>
                {planet.status === 'waiting'
                  ? '待确认'
                  : `${planet.progress}% · ${planet.currentStageLabel ? getStageLabel(planet.currentStageLabel, planet.currentStageKey) : getStatusLabel(planet.status)}`}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
