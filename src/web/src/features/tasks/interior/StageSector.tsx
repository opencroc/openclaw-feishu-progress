import type { PlanetInteriorStage } from '@features/tasks/types';
import { getStageLabel } from '../labels';

type StageSectorProps = {
  stage: PlanetInteriorStage;
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
};

const STAGE_STYLES: Record<PlanetInteriorStage['status'], { fill: string; stroke: string; text: string }> = {
  pending: { fill: 'rgba(100, 116, 139, 0.18)', stroke: 'rgba(148, 163, 184, 0.18)', text: '#94a3b8' },
  running: { fill: 'rgba(251, 191, 36, 0.28)', stroke: 'rgba(245, 158, 11, 0.92)', text: '#fde68a' },
  done: { fill: 'rgba(52, 211, 153, 0.24)', stroke: 'rgba(52, 211, 153, 0.88)', text: '#bbf7d0' },
  failed: { fill: 'rgba(248, 113, 113, 0.26)', stroke: 'rgba(248, 113, 113, 0.92)', text: '#fecaca' },
};

function polarToCartesian(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function describeArc(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  const startOuter = polarToCartesian(cx, cy, outerRadius, endAngle);
  const endOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
  const startInner = polarToCartesian(cx, cy, innerRadius, startAngle);
  const endInner = polarToCartesian(cx, cy, innerRadius, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    'M', startOuter.x, startOuter.y,
    'A', outerRadius, outerRadius, 0, largeArc, 0, endOuter.x, endOuter.y,
    'L', startInner.x, startInner.y,
    'A', innerRadius, innerRadius, 0, largeArc, 1, endInner.x, endInner.y,
    'Z',
  ].join(' ');
}

export default function StageSector({ stage, cx, cy, innerRadius, outerRadius }: StageSectorProps) {
  const style = STAGE_STYLES[stage.status];
  const arcPath = describeArc(cx, cy, innerRadius, outerRadius, stage.arcStart, stage.arcEnd);
  const labelPoint = polarToCartesian(cx, cy, (innerRadius + outerRadius) / 2, stage.midAngle);

  return (
    <g className={`planet-sector planet-sector-${stage.status}`}>
      <path d={arcPath} fill={style.fill} stroke={style.stroke} strokeWidth="2" />
      <text
        x={labelPoint.x}
        y={labelPoint.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={style.text}
        fontSize="10"
        fontWeight="700"
      >
        {getStageLabel(stage.label, stage.key)}
      </text>
    </g>
  );
}
