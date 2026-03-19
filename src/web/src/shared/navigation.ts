const ROUTE_CHANGE_EVENT = 'opencroc:route-change';

const LEGACY_ROUTE_ALIASES: Record<string, string> = {
  '/index.html': '/',
  '/index-studio.html': '/studio',
  '/index-v2-pixel.html': '/pixel',
};

const DYNAMIC_ROUTE_PREFIXES = ['/tasks'];

function splitPathSearchHash(input: string): { path: string; suffix: string } {
  const hashIndex = input.indexOf('#');
  const searchIndex = input.indexOf('?');
  let cutIndex = -1;

  if (searchIndex >= 0 && hashIndex >= 0) {
    cutIndex = Math.min(searchIndex, hashIndex);
  } else {
    cutIndex = Math.max(searchIndex, hashIndex);
  }

  if (cutIndex === -1) {
    return { path: input, suffix: '' };
  }

  return {
    path: input.slice(0, cutIndex),
    suffix: input.slice(cutIndex),
  };
}

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
  const { path, suffix } = splitPathSearchHash(to);
  const nextPath = normalizeAppPath(path);
  const nextUrl = `${nextPath}${suffix}`;
  const currentPath = getCurrentAppPath();
  const currentUrl = `${currentPath}${window.location.search}${window.location.hash}`;

  if (nextUrl !== currentUrl) {
    const method = options?.replace ? 'replaceState' : 'pushState';
    window.history[method]({}, '', nextUrl);
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
