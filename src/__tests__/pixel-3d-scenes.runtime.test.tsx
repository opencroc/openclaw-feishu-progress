import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import * as React from 'react';

const navigationSpy = vi.fn();

vi.mock('@shared/assets', () => ({
  publicAsset: (value: string) => `/${value}`,
}));

vi.mock('@shared/navigation', () => ({
  navigate: (value: string) => navigationSpy(value),
}));

vi.mock('three/addons/libs/meshopt_decoder.module.js', () => ({
  MeshoptDecoder: {},
}));

vi.mock('three/addons/loaders/DRACOLoader.js', () => ({
  DRACOLoader: class {
    setDecoderPath(): this {
      return this;
    }

    dispose(): void {}
  },
}));

vi.mock('three/addons/controls/PointerLockControls.js', async () => {
  const listeners = new Map<string, Array<() => void>>();
  return {
    PointerLockControls: class {
      camera: { position?: { x: number; y: number; z: number } };
      isLocked = false;

      constructor(camera: { position?: { x: number; y: number; z: number } }) {
        this.camera = camera;
      }

      addEventListener(name: string, handler: () => void): void {
        const bucket = listeners.get(name) ?? [];
        bucket.push(handler);
        listeners.set(name, bucket);
      }

      lock(): void {
        this.isLocked = true;
        for (const handler of listeners.get('lock') ?? []) handler();
      }

      unlock(): void {
        this.isLocked = false;
        for (const handler of listeners.get('unlock') ?? []) handler();
      }

      disconnect(): void {}

      getDirection(target: { set: (x: number, y: number, z: number) => void }): void {
        target.set(0, 0, -1);
      }
    },
  };
});

vi.mock('three/addons/loaders/GLTFLoader.js', async (importOriginal) => {
  const actualThree = await import('three');
  function createOfficeScene() {
    const scene = new actualThree.Scene();
    const spawn = new actualThree.Object3D();
    spawn.name = 'spawn';
    spawn.position.set(0, 0, 3.8);
    const interact = new actualThree.Object3D();
    interact.name = 'interact';
    interact.position.set(0, 0, 3.8);
    const exit = new actualThree.Object3D();
    exit.name = 'exit';
    exit.position.set(0, 0, 4.6);
    scene.add(spawn, interact, exit);
    for (const lodName of ['office_scene_LOD0', 'office_scene_LOD1', 'office_scene_LOD2']) {
      const group = new actualThree.Group();
      group.name = lodName;
      group.add(new actualThree.Mesh(
        new actualThree.BoxGeometry(1, 1, 1),
        new actualThree.MeshStandardMaterial({ color: 0x6fb0ad }),
      ));
      scene.add(group);
    }
    return scene;
  }

  function createStarAtlasScene() {
    const scene = new actualThree.Scene();
    for (const lodName of ['star_L0', 'star_L1', 'star_L2', 'star_L3', 'star_L4']) {
      const mesh = new actualThree.Mesh(
        new actualThree.BoxGeometry(1, 1, 1),
        new actualThree.MeshStandardMaterial({ color: 0xffffff }),
      );
      mesh.name = lodName;
      scene.add(mesh);
    }
    return scene;
  }

  return {
    ...(await importOriginal<object>()),
    GLTFLoader: class {
      setDRACOLoader(): this {
        return this;
      }

      setMeshoptDecoder(): this {
        return this;
      }

      load(url: string, onLoad: (gltf: { scene: InstanceType<typeof actualThree.Scene> }) => void, onProgress?: () => void): void {
        onProgress?.();
        onLoad({ scene: createOfficeScene() });
      }

      async loadAsync(url: string): Promise<{ scene: InstanceType<typeof actualThree.Scene> }> {
        return { scene: url.includes('starfield') ? createStarAtlasScene() : createOfficeScene() };
      }
    },
  };
});

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class MockWebGLRenderer {
    domElement = document.createElement('canvas');
    outputColorSpace: unknown;
    toneMapping: unknown;
    toneMappingExposure = 1;

    constructor(public options: unknown) {}

    setPixelRatio(): void {}
    setClearColor(): void {}
    setSize(): void {}
    render(): void {}
    dispose(): void {}
  }

  class MockCubeTextureLoader {
    async loadAsync(): Promise<InstanceType<typeof actual.CubeTexture>> {
      return new actual.CubeTexture();
    }
  }

  class MockRaycaster {
    setFromCamera(): void {}

    intersectObjects(objects: Array<{ userData?: { entries?: unknown[] } }>): Array<{ object: object; instanceId: number }> {
      if (objects.length === 0) return [];
      return [{ object: objects[0], instanceId: 0 }];
    }
  }

  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
    CubeTextureLoader: MockCubeTextureLoader,
    Raycaster: MockRaycaster,
  };
});

const sampleCatalog = [
  {
    id: 'STAR-00001',
    name: 'Sirius',
    ra: 101.2872,
    dec: -16.7161,
    distanceLy: 8.6,
    spectralType: 'A1V',
    magnitude: -1.46,
    level: 0,
    encyclopediaUrl: 'https://example.com/sirius',
  },
  {
    id: 'STAR-00002',
    name: 'Rigel',
    ra: 78.6345,
    dec: -8.2016,
    distanceLy: 863,
    spectralType: 'B8Ia',
    magnitude: 0.13,
    level: 1,
    encyclopediaUrl: 'https://example.com/rigel',
  },
] as const;

function createIndexedDbStub() {
  return undefined;
}

describe('pixel 3d runtime scenes', () => {
  let container: HTMLDivElement;
  let root: Root;
  let animationFrames: FrameRequestCallback[];

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    navigationSpy.mockReset();
    animationFrames = [];
    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => sampleCatalog,
    })));
    vi.stubGlobal('indexedDB', createIndexedDbStub());
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('mounts office scene and handles movement hotkeys and navigation', async () => {
    const { default: OfficeScene } = await import('../web/src/scenes/OfficeScene');

    await act(async () => {
      root.render(React.createElement(OfficeScene));
    });

    expect(container.textContent).toContain('像素办公室');
    expect(container.textContent).toContain('当前 LOD');

    const firstFrame = animationFrames.shift();
    firstFrame?.(16);

    await act(async () => {
      window.dispatchEvent(new MouseEvent('click'));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    });

    expect(container.textContent).toContain('已完成 1 次终端交互');
    expect(navigationSpy).toHaveBeenCalledWith('/tasks');

    const buttons = Array.from(container.querySelectorAll('button'));
    await act(async () => {
      buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(navigationSpy).toHaveBeenCalledWith('/starmap');
  });

  it('mounts star map scene and renders selected star card with controls', async () => {
    const { default: StarMapScene } = await import('../web/src/scenes/StarMapScene');

    await act(async () => {
      root.render(React.createElement(StarMapScene));
    });

    expect(container.textContent).toContain('3D 星图');
    expect(container.textContent).toContain('2 颗星');

    const firstFrame = animationFrames.shift();
    firstFrame?.(16);

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();

    await act(async () => {
      canvas?.dispatchEvent(new WheelEvent('wheel', { deltaY: 300, bubbles: true }));
      canvas?.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
      canvas?.dispatchEvent(new PointerEvent('pointerup', { clientX: 10, clientY: 10, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    });

    expect(container.textContent).toContain('Sirius');
    expect(container.textContent).toContain('A1V');
    expect(container.textContent).toMatch(/FOV \d+°/);
    expect(navigationSpy).toHaveBeenCalledWith('/tasks');

    const buttons = Array.from(container.querySelectorAll('button'));
    await act(async () => {
      buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(navigationSpy).toHaveBeenCalledWith('/office');
  });
});
