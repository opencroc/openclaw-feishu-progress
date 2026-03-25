/*
 * @Author: wangchunji
 * @Date: 2026-03-19 09:57:44
 * @LastEditors: wangchunji
 * @LastEditTime: 2026-03-25 10:54:50
 * @Description: 
 */
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
    if (pathname !== '/') {
      return;
    }

    let cancelled = false;

    async function redirectToLatestTask(): Promise<void> {
      try {
        const response = await fetch('/api/tasks?limit=1');
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }

        const payload = await response.json() as { tasks?: Array<{ id?: string | null }> };
        if (cancelled) return;

        const latestTaskId = payload.tasks?.[0]?.id;
        navigate(latestTaskId ? `/tasks/${latestTaskId}` : '/tasks', { replace: true });
      } catch {
        if (cancelled) return;
        navigate('/tasks', { replace: true });
      }
    }

    void redirectToLatestTask();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    document.title = route.title;

    const routeMatchesPath = route.path === '/'
      ? pathname === '/'
      : pathname === route.path || pathname.startsWith(`${route.path}/`);

    if (!routeMatchesPath) {
      navigate(route.path, { replace: true });
    }
  }, [pathname, route.path, route.title]);

  if (pathname === '/') {
    return <RouterFallback />;
  }

  return (
    <Suspense fallback={<RouterFallback />}>
      <AppLayout route={route}>
        <RouteComponent />
      </AppLayout>
    </Suspense>
  );
}
