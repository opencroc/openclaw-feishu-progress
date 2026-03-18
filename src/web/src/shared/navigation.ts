const ROUTE_CHANGE_EVENT = 'opencroc:route-change';

const LEGACY_ROUTE_ALIASES: Record<string, string> = {
  '/index.html': '/',
  '/index-studio.html': '/studio',
  '/index-v2-pixel.html': '/pixel',
};

const DYNAMIC_ROUTE_PREFIXES = ['/tasks'];

export function normalizeAppPath(pathname: string): string {
  if (!pathname) {
    return '/';
  }

  const [pathOnly] = pathname.split('?');
  const withLeadingSlash = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
  const trimmed = withLeadingSlash.length > 1 && withLeadingSlash.endsWith('/')
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;

  if (DYNAMIC_ROUTE_PREFIXES.some((prefix) => trimmed === prefix || trimmed.startsWith(`${prefix}/`))) {
    return trimmed;
  }

  return LEGACY_ROUTE_ALIASES[trimmed] || trimmed;
}

export function getCurrentAppPath(): string {
  return normalizeAppPath(window.location.pathname);
}

export function navigate(to: string, options?: { replace?: boolean }): void {
  const nextPath = normalizeAppPath(to);
  const currentPath = getCurrentAppPath();

  if (nextPath !== currentPath) {
    const method = options?.replace ? 'replaceState' : 'pushState';
    window.history[method]({}, '', nextPath);
  }

  window.dispatchEvent(new Event(ROUTE_CHANGE_EVENT));
}

export function subscribeNavigation(callback: () => void): () => void {
  window.addEventListener('popstate', callback);
  window.addEventListener(ROUTE_CHANGE_EVENT, callback);

  return () => {
    window.removeEventListener('popstate', callback);
    window.removeEventListener(ROUTE_CHANGE_EVENT, callback);
  };
}
