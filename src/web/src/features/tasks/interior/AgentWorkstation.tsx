import type { PlanetInteriorAgent } from '@features/tasks/types';

type AgentWorkstationProps = {
  agent: PlanetInteriorAgent;
  cx: number;
  cy: number;
  radius: number;
};

const ROLE_COLORS: Record<string, string> = {
  parser: '#60a5fa',
  analyzer: '#8b82f4',
  tester: '#34d399',
  healer: '#f87171',
  planner: '#fbbf24',
  reporter: '#38bdf8',
};

function polarToCartesian(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function renderShape(role: string, color: string) {
  switch (role) {
    case 'analyzer':
      return <rect x="-9" y="-9" width="18" height="18" transform="rotate(45)" rx="3" fill={color} />;
    case 'tester':
      return <rect x="-9" y="-9" width="18" height="18" rx="4" fill={color} />;
    case 'healer':
      return <path d="M 0 -10 L 10 9 L -10 9 Z" fill={color} />;
    case 'planner':
      return <polygon points="-9,-4 0,-11 9,-4 9,6 0,12 -9,6" fill={color} />;
    case 'reporter':
      return <rect x="-10" y="-7" width="20" height="14" rx="7" fill={color} />;
    default:
      return <circle r="9" fill={color} />;
  }
}

function shortName(name: string): string {
  return name.length > 6 ? `${name.slice(0, 5)}…` : name;
}

export default function AgentWorkstation({ agent, cx, cy, radius }: AgentWorkstationProps) {
  const point = polarToCartesian(cx, cy, radius, agent.angle);
  const color = ROLE_COLORS[agent.role] ?? '#94a3b8';
  const isActive = agent.status === 'working' || agent.status === 'thinking';
  const isBlocked = agent.status === 'error';

  return (
    <g className={`planet-workstation ${agent.status}`} transform={`translate(${point.x}, ${point.y})`}>
      {isActive ? (
        <circle r="18" fill={color} opacity="0.18" />
      ) : null}
      {isBlocked ? (
        <circle r="18" fill="#f87171" opacity="0.18" />
      ) : null}
      <circle r="14" fill="rgba(255, 252, 247, 0.96)" stroke="rgba(111, 98, 84, 0.18)" strokeWidth="1.5" />
      {renderShape(agent.role, color)}
      <text
        x="0"
        y="28"
        textAnchor="middle"
        fill="#6f6254"
        fontSize="9"
        fontWeight="600"
      >
        {shortName(agent.name)}
      </text>
    </g>
  );
}
