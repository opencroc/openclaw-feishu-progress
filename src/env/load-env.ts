import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_FILES = ['.env', '.env.local'] as const;

function stripInlineComment(value: string): string {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (char === '#' && !inSingle && !inDouble) {
      return value.slice(0, i).trimEnd();
    }
  }

  return value.trim();
}

function normalizeValue(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const inner = trimmed.slice(1, -1);
    return trimmed.startsWith('"')
      ? inner
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
      : inner;
  }
  return stripInlineComment(trimmed);
}

function parseEnvFile(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separatorIndex = normalized.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = normalized.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) continue;

    const value = normalizeValue(normalized.slice(separatorIndex + 1));
    parsed[key] = value;
  }

  return parsed;
}

export function loadEnvFiles(searchFrom = process.cwd()): void {
  const root = resolve(searchFrom);
  const originalKeys = new Set(Object.keys(process.env));

  for (const file of ENV_FILES) {
    const fullPath = resolve(root, file);
    if (!existsSync(fullPath)) continue;

    const parsed = parseEnvFile(readFileSync(fullPath, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (originalKeys.has(key)) continue;
      process.env[key] = value;
    }
  }
}
