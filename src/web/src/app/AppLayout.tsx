import { useEffect, type PropsWithChildren } from 'react';

import type { AppRoute } from './routes';
import RuntimeVersionBadge from './RuntimeVersionBadge';

type AppLayoutProps = PropsWithChildren<{
  route: AppRoute;
}>;

export default function AppLayout({ route, children }: AppLayoutProps) {
  useEffect(() => {
    document.body.dataset.appRoute = route.id;
    document.body.dataset.routeVariant = route.variant;
    document.documentElement.dataset.appRoute = route.id;
    document.documentElement.dataset.routeVariant = route.variant;

    return () => {
      delete document.body.dataset.appRoute;
      delete document.body.dataset.routeVariant;
      delete document.documentElement.dataset.appRoute;
      delete document.documentElement.dataset.routeVariant;
    };
  }, [route.id, route.variant]);

  return (
    <div
      className="app-layout"
      data-route-id={route.id}
      data-route-variant={route.variant}
      aria-label={route.description}
    >
      {children}
      <RuntimeVersionBadge />
    </div>
  );
}
