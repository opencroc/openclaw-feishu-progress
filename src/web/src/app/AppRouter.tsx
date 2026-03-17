import { Suspense, useEffect, useSyncExternalStore } from 'react';

import { getCurrentAppPath, navigate, subscribeNavigation } from '@shared/navigation';
import AppLayout from './AppLayout';
import { resolveAppRoute } from './routes';
import '../styles/app-layout.css';

function RouterFallback() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        background: '#050510',
        color: '#f1f5f9',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      Loading OpenCroc Studio...
    </div>
  );
}

export default function AppRouter() {
  const pathname = useSyncExternalStore(subscribeNavigation, getCurrentAppPath, () => '/');
  const route = resolveAppRoute(pathname);
  const RouteComponent = route.component;

  useEffect(() => {
    document.title = route.title;

    if (route.path !== pathname) {
      navigate(route.path, { replace: true });
    }
  }, [pathname, route.path, route.title]);

  return (
    <Suspense fallback={<RouterFallback />}>
      <AppLayout route={route}>
        <RouteComponent />
      </AppLayout>
    </Suspense>
  );
}
