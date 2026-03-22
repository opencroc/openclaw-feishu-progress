import { useMemo } from 'react';

import { useRuntimeVersionInfo } from '@shared/runtime-version';

function formatTimestamp(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export default function RuntimeVersionBadge() {
  const versionInfo = useRuntimeVersionInfo();

  const title = useMemo(() => {
    if (!versionInfo) return '';
    const lines = [
      `${versionInfo.name} v${versionInfo.version}`,
      versionInfo.commit ? `commit ${versionInfo.commit}` : undefined,
      versionInfo.builtAt ? `build ${formatTimestamp(versionInfo.builtAt)}` : undefined,
      `live ${formatTimestamp(versionInfo.startedAt) ?? versionInfo.startedAt}`,
    ].filter(Boolean);
    return lines.join('\n');
  }, [versionInfo]);

  if (!versionInfo) {
    return null;
  }

  return (
    <div
      className="app-version-badge"
      title={title}
      aria-label={title}
    >
      <span className="app-version-kicker">Live</span>
      <span className="app-version-label">
        v{versionInfo.version}
        {versionInfo.shortCommit ? ` @ ${versionInfo.shortCommit}` : ''}
      </span>
    </div>
  );
}
