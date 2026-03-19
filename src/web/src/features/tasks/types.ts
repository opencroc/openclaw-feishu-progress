export type TaskStage = {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  detail?: string;
  startedAt?: number;
  completedAt?: number;
};

export type TaskEvent = {
  type: string;
  message: string;
  progress?: number;
  time: number;
  level?: string;
  stageKey?: string;
};

export type TaskRecord = {
  id: string;
  kind: string;
  title: string;
  sourceText?: string;
  status: 'queued' | 'running' | 'waiting' | 'done' | 'failed';
  progress: number;
  currentStageKey?: string;
  stages: TaskStage[];
  summary?: string;
  waitingFor?: string;
  updatedAt: number;
  createdAt: number;
  completedAt?: number;
  events: TaskEvent[];
};

export type PlanetOverviewItem = {
  id: string;
  title: string;
  sourceText?: string;
  summary?: string;
  kind: string;
  status: 'queued' | 'running' | 'waiting' | 'done' | 'failed' | 'archived';
  progress: number;
  complexity: number;
  radius: number;
  position: { x: number; y: number };
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  currentStageKey?: string;
  currentStageLabel?: string;
  waitingFor?: string;
  taskUrl: string;
  tags: string[];
};

export type PlanetListResponse = {
  ok: true;
  planets: PlanetOverviewItem[];
  edges: PlanetEdge[];
};

export type PlanetEdge = {
  fromPlanetId: string;
  toPlanetId: string;
  type: 'depends-on' | 'related-to' | 'supersedes';
  confidence: number;
  source: 'auto' | 'manual';
  reason?: string;
};

export type PlanetInteriorStage = {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  progress: number;
  detail?: string;
  startedAt?: number;
  completedAt?: number;
  arcStart: number;
  arcEnd: number;
  midAngle: number;
};

export type PlanetInteriorAgent = {
  id: string;
  name: string;
  role: string;
  sprite: string;
  status: 'idle' | 'working' | 'thinking' | 'done' | 'error';
  stageKey: string;
  stageLabel: string;
  progress?: number;
  currentAction?: string;
  angle: number;
};

export type PlanetInteriorData = {
  stages: PlanetInteriorStage[];
  agents: PlanetInteriorAgent[];
  events: TaskEvent[];
  summary?: string;
  waitingFor?: string;
};

export type PlanetInteriorResponse = {
  ok: true;
  planet: PlanetOverviewItem;
  interior: PlanetInteriorData;
};
