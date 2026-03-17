import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

type BootstrapOptions = {
  app: ReactElement;
  missingMessage: string;
  containerId?: string;
};

export function bootstrapApp({
  app,
  missingMessage,
  containerId = 'root',
}: BootstrapOptions): void {
  const container = document.getElementById(containerId);

  if (!container) {
    throw new Error(missingMessage);
  }

  createRoot(container).render(app);
}
