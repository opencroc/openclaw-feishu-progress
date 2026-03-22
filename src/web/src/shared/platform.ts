export function isProbablyIOS(): boolean {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) return true;

  // iPadOS 13+ reports itself as Macintosh; detect by touch capability.
  const platform = navigator.platform || '';
  const touchPoints = (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints ?? 0;
  return platform === 'MacIntel' && touchPoints > 1;
}

export function isFeishuInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // Heuristic tokens seen in Feishu/Lark app webviews.
  return /feishu|lark|bytedancelark/i.test(ua);
}

export function supportsWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2')
      || canvas.getContext('webgl')
      || canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

/**
 * iOS in-app webviews are the most common source of "flash then white screen"
 * when heavy WebGL scenes initialize. Prefer 2D to keep the task detail usable.
 */
export function shouldPrefer2D(): boolean {
  if (isFeishuInAppBrowser()) return true;
  if (isProbablyIOS()) return true;
  return false;
}
