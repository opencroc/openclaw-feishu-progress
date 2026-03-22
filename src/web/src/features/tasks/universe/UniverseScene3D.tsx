import { useEffect, useRef, useState } from 'react';

import { getKindLabel, getStageLabel, getStatusLabel } from '@features/tasks/labels';
import type { PlanetEdge, PlanetOverviewItem } from '@features/tasks/types';
import {
  mountUniverseScene3D,
  type UniverseScene3DHandle,
} from '@features/tasks/runtime/universe3d';

type UniverseScene3DProps = {
  planets: PlanetOverviewItem[];
  edges: PlanetEdge[];
  selectedId: string | null;
  focusPlanetId?: string | null;
  mutedPlanetIds?: string[];
  highlightPlanetIds?: string[];
  onPlanetClick: (id: string) => void;
};

function describePlanet(planet: PlanetOverviewItem): string {
  const stageCopy = planet.currentStageLabel
    ? getStageLabel(planet.currentStageLabel, planet.currentStageKey)
    : planet.currentStageKey
      ? getStageLabel(undefined, planet.currentStageKey)
      : getStatusLabel(planet.status);

  return `${getKindLabel(planet.kind)} · ${getStatusLabel(planet.status)} · ${planet.progress}% · ${stageCopy}`;
}

export default function UniverseScene3D({
  planets,
  edges,
  selectedId,
  focusPlanetId,
  mutedPlanetIds = [],
  highlightPlanetIds = [],
  onPlanetClick,
}: UniverseScene3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<UniverseScene3DHandle | null>(null);
  const onPlanetClickRef = useRef(onPlanetClick);
  const [hoveredPlanetId, setHoveredPlanetId] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);

  onPlanetClickRef.current = onPlanetClick;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const runtime = mountUniverseScene3D({
      container,
      canvas,
      onPlanetClick: (planetId) => onPlanetClickRef.current(planetId),
      onHoverPlanetIdChange: setHoveredPlanetId,
    });
    runtimeRef.current = runtime;

    return () => {
      runtime.dispose();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    runtimeRef.current?.setData({
      planets,
      edges,
      selectedId,
      focusPlanetId,
      mutedPlanetIds,
      highlightPlanetIds,
    });
  }, [edges, focusPlanetId, highlightPlanetIds, mutedPlanetIds, planets, selectedId]);

  useEffect(() => {
    runtimeRef.current?.setAutoRotate(autoRotate);
  }, [autoRotate]);

  const hoveredPlanet = hoveredPlanetId
    ? planets.find((planet) => planet.id === hoveredPlanetId) ?? null
    : null;
  const selectedPlanet = selectedId
    ? planets.find((planet) => planet.id === selectedId) ?? null
    : null;
  const overlayPlanet = hoveredPlanet ?? selectedPlanet;

  return (
    <div className="universe-canvas-shell">
      <div ref={containerRef} className="universe-canvas-stage universe-canvas-stage-3d">
        <canvas ref={canvasRef} className="universe-scene-canvas" />

        <div className="universe-scene-overlay">
          <div className="universe-scene-badge">3D 星图</div>
          {overlayPlanet ? (
            <div className="universe-scene-hud">
              <strong>{overlayPlanet.title}</strong>
              <span>{describePlanet(overlayPlanet)}</span>
              {overlayPlanet.summary ? <span>{overlayPlanet.summary}</span> : null}
            </div>
          ) : (
            <div className="universe-scene-note">
              拖拽旋转星图，滚轮缩放，双击星球聚焦，双击留白适配全局。
            </div>
          )}
        </div>
      </div>

      <div className="universe-canvas-toolbar">
        <button type="button" onClick={() => runtimeRef.current?.zoom(1.16)}>+</button>
        <button type="button" onClick={() => runtimeRef.current?.zoom(1 / 1.16)}>-</button>
        <button type="button" onClick={() => runtimeRef.current?.fitAll()}>适配</button>
        <button
          type="button"
          onClick={() => runtimeRef.current?.focusSelected()}
          disabled={!selectedId && !focusPlanetId}
        >
          聚焦
        </button>
        <button type="button" onClick={() => setAutoRotate((current) => !current)}>
          {autoRotate ? '停转' : '旋转'}
        </button>
      </div>
    </div>
  );
}
