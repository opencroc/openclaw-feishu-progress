import type { PlanetEdge, PlanetOverviewItem } from '@features/tasks/types';

type EdgeLineProps = {
  edge: PlanetEdge;
  fromPlanet?: PlanetOverviewItem;
  toPlanet?: PlanetOverviewItem;
  selected: boolean;
  muted?: boolean;
  onClick?: (edge: PlanetEdge) => void;
};

const EDGE_STYLES: Record<PlanetEdge['type'], { stroke: string; dasharray?: string; width: number }> = {
  'depends-on': { stroke: '#8b82f4', width: 1.8 },
  'related-to': { stroke: '#94a3b8', width: 1.2, dasharray: '5 5' },
  supersedes: { stroke: '#fb923c', width: 1.4, dasharray: '8 4' },
};

function clampOpacity(confidence: number): number {
  if (confidence >= 0.8) return 0.86;
  if (confidence >= 0.5) return 0.54;
  return 0.34;
}

export default function EdgeLine({ edge, fromPlanet, toPlanet, selected, muted = false, onClick }: EdgeLineProps) {
  if (!fromPlanet || !toPlanet) return null;

  const style = EDGE_STYLES[edge.type];
  const dx = toPlanet.position.x - fromPlanet.position.x;
  const dy = toPlanet.position.y - fromPlanet.position.y;
  const angle = Math.atan2(dy, dx);
  const startX = fromPlanet.position.x + Math.cos(angle) * (fromPlanet.radius + 14);
  const startY = fromPlanet.position.y + Math.sin(angle) * (fromPlanet.radius + 14);
  const endX = toPlanet.position.x - Math.cos(angle) * (toPlanet.radius + 14);
  const endY = toPlanet.position.y - Math.sin(angle) * (toPlanet.radius + 14);
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;

  const arrowAngleA = angle - Math.PI / 9;
  const arrowAngleB = angle + Math.PI / 9;
  const arrowSize = selected ? 11 : 8;
  const arrowX1 = endX + Math.cos(arrowAngleA + Math.PI) * arrowSize;
  const arrowY1 = endY + Math.sin(arrowAngleA + Math.PI) * arrowSize;
  const arrowX2 = endX + Math.cos(arrowAngleB + Math.PI) * arrowSize;
  const arrowY2 = endY + Math.sin(arrowAngleB + Math.PI) * arrowSize;

  const baseOpacity = muted ? 0.12 : clampOpacity(edge.confidence);

  return (
    <g
      className={`task-edge ${selected ? 'selected' : ''}`}
      onClick={() => onClick?.(edge)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke={selected ? '#f8fafc' : style.stroke}
        strokeWidth={selected ? style.width + 1.2 : style.width}
        strokeDasharray={style.dasharray}
        opacity={selected ? 0.95 : baseOpacity}
      />
      <polygon
        points={`${endX},${endY} ${arrowX1},${arrowY1} ${arrowX2},${arrowY2}`}
        fill={selected ? '#f8fafc' : style.stroke}
        opacity={selected ? 0.95 : baseOpacity}
      />
      {selected ? (
        <>
          <circle cx={midX} cy={midY} r="12" fill="rgba(255, 252, 247, 0.96)" stroke="rgba(90, 74, 55, 0.22)" strokeWidth="1.2" />
          <text x={midX} y={midY + 4} textAnchor="middle" fill="#4f4336" fontSize="9" fontWeight="700">
            {edge.type === 'depends-on' ? '依' : edge.type === 'supersedes' ? '替' : '关'}
          </text>
        </>
      ) : null}
    </g>
  );
}
