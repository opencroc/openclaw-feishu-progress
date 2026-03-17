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
];

export function resolveAppRoute(pathname: string): AppRoute {
  const normalizedPath = normalizeAppPath(pathname);
  return appRoutes.find((route) => route.path === normalizedPath) || appRoutes[0];
}
