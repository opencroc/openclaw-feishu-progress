import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

import { normalizeAppPath } from '@shared/navigation';

export type AppRoute = {
  id: string;
  path: string;
  title: string;
  navLabel: string;
  description: string;
  variant: 'office' | 'graph' | 'pixel';
  component: LazyExoticComponent<ComponentType>;
};

const OfficePage = lazy(() => import('@pages/office'));
const StudioPage = lazy(() => import('@pages/studio'));
const PixelPage = lazy(() => import('@pages/pixel'));
const TasksPage = lazy(() => import('@pages/tasks/page'));
const UniversePage = lazy(() => import('@pages/universe'));

export const appRoutes: AppRoute[] = [
  {
    id: 'office',
    path: '/',
    title: 'OpenCroc Studio',
    navLabel: '3D Office',
    description: 'OpenCroc Studio office runtime view',
    variant: 'office',
    component: OfficePage,
  },
  {
    id: 'studio',
    path: '/studio',
    title: 'OpenCroc Studio Graph',
    navLabel: 'Knowledge Graph',
    description: 'OpenCroc Studio knowledge graph view',
    variant: 'graph',
    component: StudioPage,
  },
  {
    id: 'pixel',
    path: '/pixel',
    title: 'OpenCroc Studio Pixel',
    navLabel: 'Pixel View',
    description: 'OpenCroc Studio pixel operations view',
    variant: 'pixel',
    component: PixelPage,
  },
  {
    id: 'tasks',
    path: '/tasks',
    title: 'OpenCroc Tasks',
    navLabel: 'Tasks',
    description: 'OpenCroc task progress view',
    variant: 'graph',
    component: TasksPage,
  },
  {
    id: 'universe',
    path: '/universe',
    title: 'OpenCroc Universe',
    navLabel: 'Universe',
    description: 'OpenCroc full-screen task universe view',
    variant: 'graph',
    component: UniversePage,
  },
];

export function resolveAppRoute(pathname: string): AppRoute {
  const normalizedPath = normalizeAppPath(pathname);
  const direct = appRoutes.find((route) => route.path === normalizedPath);
  if (direct) return direct;
  if (normalizedPath.startsWith('/tasks/')) {
    return appRoutes.find((route) => route.id === 'tasks') || appRoutes[0];
  }
  return appRoutes[0];
}
