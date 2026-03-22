import { useEffect, useState } from 'react';

export type RuntimeVersionInfo = {
  ok: true;
  name: string;
  version: string;
  commit?: string;
  shortCommit?: string;
  builtAt?: string;
  startedAt: string;
};

let cachedVersionInfo: RuntimeVersionInfo | null = null;
let inflightVersionRequest: Promise<RuntimeVersionInfo | null> | null = null;

async function loadRuntimeVersionInfo(): Promise<RuntimeVersionInfo | null> {
  if (cachedVersionInfo) return cachedVersionInfo;
  if (!inflightVersionRequest) {
    inflightVersionRequest = fetch('/api/version', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        return response.json() as Promise<RuntimeVersionInfo>;
      })
      .then((payload) => {
        cachedVersionInfo = payload;
        return payload;
      })
      .catch(() => null)
      .finally(() => {
        inflightVersionRequest = null;
      });
  }

  return inflightVersionRequest;
}

export function useRuntimeVersionInfo(): RuntimeVersionInfo | null {
  const [versionInfo, setVersionInfo] = useState<RuntimeVersionInfo | null>(cachedVersionInfo);

  useEffect(() => {
    let cancelled = false;

    void loadRuntimeVersionInfo().then((payload) => {
      if (!cancelled && payload) {
        setVersionInfo(payload);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return versionInfo;
}
