import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';

import PlanetUniverse, { PLANET_UNIVERSE_VIEW_BOX, type PlanetUniverseViewport } from './PlanetUniverse';
import type { PlanetEdge, PlanetOverviewItem } from '@features/tasks/types';

type UniverseCanvasProps = {
  planets: PlanetOverviewItem[];
  edges: PlanetEdge[];
  selectedId: string | null;
  selectedEdgeKey?: string | null;
  linkSourceId?: string | null;
  focusPlanetId?: string | null;
  mutedPlanetIds?: string[];
  mutedEdgeKeys?: string[];
  highlightPlanetIds?: string[];
  onPlanetClick: (id: string) => void;
  onEdgeClick?: (edge: PlanetEdge) => void;
};

const DEFAULT_VIEWPORT: PlanetUniverseViewport = {
  centerX: PLANET_UNIVERSE_VIEW_BOX.width / 2,
  centerY: PLANET_UNIVERSE_VIEW_BOX.height / 2,
  zoom: 1,
};

function clampZoom(value: number): number {
  return Math.max(0.35, Math.min(2.8, value));
}

function fitPlanets(planets: PlanetOverviewItem[]): PlanetUniverseViewport {
  if (planets.length === 0) {
    return DEFAULT_VIEWPORT;
  }

  const bounds = planets.reduce((acc, planet) => ({
    minX: Math.min(acc.minX, planet.position.x - planet.radius - 36),
    maxX: Math.max(acc.maxX, planet.position.x + planet.radius + 36),
    minY: Math.min(acc.minY, planet.position.y - planet.radius - 52),
    maxY: Math.max(acc.maxY, planet.position.y + planet.radius + 44),
  }), {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  });

  const width = Math.max(120, bounds.maxX - bounds.minX);
  const height = Math.max(120, bounds.maxY - bounds.minY);
  const zoom = clampZoom(Math.min(
    PLANET_UNIVERSE_VIEW_BOX.width / width,
    PLANET_UNIVERSE_VIEW_BOX.height / height,
  ) * 0.9);

  return {
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerY: (bounds.minY + bounds.maxY) / 2,
    zoom,
  };
}

function focusPlanet(planet: PlanetOverviewItem): PlanetUniverseViewport {
  return {
    centerX: planet.position.x,
    centerY: planet.position.y,
    zoom: Math.max(1.35, Math.min(2.2, 92 / Math.max(planet.radius, 1))),
  };
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('.task-planet, .task-edge'));
}

export default function UniverseCanvas({
  planets,
  edges,
  selectedId,
  selectedEdgeKey,
  linkSourceId,
  focusPlanetId,
  mutedPlanetIds,
  mutedEdgeKeys,
  highlightPlanetIds,
  onPlanetClick,
  onEdgeClick,
}: UniverseCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragPointerRef = useRef<number | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const hasInteractedRef = useRef(false);
  const appliedFocusRef = useRef<string | null>(null);
  const [viewport, setViewport] = useState<PlanetUniverseViewport>(DEFAULT_VIEWPORT);

  useEffect(() => {
    if (planets.length === 0 || hasInteractedRef.current || focusPlanetId) return;
    setViewport(fitPlanets(planets));
  }, [focusPlanetId, planets]);

  useEffect(() => {
    if (!focusPlanetId) {
      appliedFocusRef.current = null;
      return;
    }
    if (appliedFocusRef.current === focusPlanetId) return;
    const target = planets.find((planet) => planet.id === focusPlanetId);
    if (!target) return;
    appliedFocusRef.current = focusPlanetId;
    setViewport(focusPlanet(target));
  }, [focusPlanetId, planets]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key.toLowerCase() === 'f') {
        hasInteractedRef.current = true;
        setViewport(fitPlanets(planets));
        return;
      }

      if (event.key === '0') {
        hasInteractedRef.current = true;
        setViewport(DEFAULT_VIEWPORT);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [planets]);

  function adjustZoom(nextZoom: number, clientX?: number, clientY?: number): void {
    const zoom = clampZoom(nextZoom);
    if (!containerRef.current) {
      setViewport((current) => ({ ...current, zoom }));
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const pointerX = typeof clientX === 'number'
      ? ((clientX - rect.left) / Math.max(rect.width, 1)) * PLANET_UNIVERSE_VIEW_BOX.width
      : PLANET_UNIVERSE_VIEW_BOX.width / 2;
    const pointerY = typeof clientY === 'number'
      ? ((clientY - rect.top) / Math.max(rect.height, 1)) * PLANET_UNIVERSE_VIEW_BOX.height
      : PLANET_UNIVERSE_VIEW_BOX.height / 2;

    setViewport((current) => {
      const worldX = current.centerX + (pointerX - PLANET_UNIVERSE_VIEW_BOX.width / 2) / current.zoom;
      const worldY = current.centerY + (pointerY - PLANET_UNIVERSE_VIEW_BOX.height / 2) / current.zoom;
      return {
        centerX: worldX - (pointerX - PLANET_UNIVERSE_VIEW_BOX.width / 2) / zoom,
        centerY: worldY - (pointerY - PLANET_UNIVERSE_VIEW_BOX.height / 2) / zoom,
        zoom,
      };
    });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return;
    hasInteractedRef.current = true;
    dragPointerRef.current = event.pointerId;
    lastPointRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (dragPointerRef.current !== event.pointerId || !lastPointRef.current) return;
    const dx = event.clientX - lastPointRef.current.x;
    const dy = event.clientY - lastPointRef.current.y;
    lastPointRef.current = { x: event.clientX, y: event.clientY };

    setViewport((current) => ({
      ...current,
      centerX: current.centerX - dx / current.zoom,
      centerY: current.centerY - dy / current.zoom,
    }));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    if (dragPointerRef.current !== event.pointerId) return;
    dragPointerRef.current = null;
    lastPointRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>): void {
    event.preventDefault();
    hasInteractedRef.current = true;
    const multiplier = event.deltaY > 0 ? 0.9 : 1.1;
    adjustZoom(viewport.zoom * multiplier, event.clientX, event.clientY);
  }

  return (
    <div className="universe-canvas-shell">
      <div
        ref={containerRef}
        className="universe-canvas-stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onDoubleClick={(event) => {
          if (isInteractiveTarget(event.target)) return;
          hasInteractedRef.current = true;
          setViewport(fitPlanets(planets));
        }}
      >
        <PlanetUniverse
          planets={planets}
          edges={edges}
          selectedId={selectedId}
          selectedEdgeKey={selectedEdgeKey}
          linkSourceId={linkSourceId}
          mutedPlanetIds={mutedPlanetIds}
          mutedEdgeKeys={mutedEdgeKeys}
          highlightPlanetIds={highlightPlanetIds}
          viewport={viewport}
          onPlanetClick={onPlanetClick}
          onEdgeClick={onEdgeClick}
        />
      </div>

      <div className="universe-canvas-toolbar">
        <button type="button" onClick={() => adjustZoom(viewport.zoom * 1.12)}>+</button>
        <button type="button" onClick={() => adjustZoom(viewport.zoom / 1.12)}>-</button>
        <button type="button" onClick={() => {
          hasInteractedRef.current = true;
          setViewport(fitPlanets(planets));
        }}
        >
          适配
        </button>
        <button type="button" onClick={() => {
          hasInteractedRef.current = true;
          setViewport(DEFAULT_VIEWPORT);
        }}
        >
          重置
        </button>
        {selectedId ? (
          <button
            type="button"
            onClick={() => {
              const target = planets.find((planet) => planet.id === selectedId);
              if (!target) return;
              hasInteractedRef.current = true;
              setViewport(focusPlanet(target));
            }}
          >
            聚焦
          </button>
        ) : null}
      </div>
    </div>
  );
}
