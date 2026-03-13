import type { OpenCrocConfig, PipelineRunResult, PipelineStep } from '../types.js';

/**
 * Plugin lifecycle hooks.
 *
 * All hooks are optional. Async hooks are awaited in registration order.
 */
export interface OpenCrocPlugin {
  /** Unique plugin name (used for logging and deduplication) */
  name: string;

  /** Called once when the plugin is registered */
  setup?(): void | Promise<void>;

  /** Transform config before pipeline starts (return modified config) */
  transformConfig?(config: OpenCrocConfig): OpenCrocConfig | Promise<OpenCrocConfig>;

  /** Called before the full pipeline run */
  beforePipeline?(config: OpenCrocConfig): void | Promise<void>;

  /** Called after pipeline completes (receives result) */
  afterPipeline?(result: PipelineRunResult, config: OpenCrocConfig): void | Promise<void>;

  /** Called before each pipeline step */
  beforeStep?(step: PipelineStep, config: OpenCrocConfig): void | Promise<void>;

  /** Called after each pipeline step */
  afterStep?(step: PipelineStep, result: PipelineRunResult, config: OpenCrocConfig): void | Promise<void>;

  /** Called on pipeline error */
  onError?(error: Error, step?: PipelineStep): void | Promise<void>;

  /** Called once when the plugin is unregistered / teardown */
  teardown?(): void | Promise<void>;
}

/**
 * Plugin registry interface.
 */
export interface PluginRegistry {
  /** Register a plugin. Duplicate names are rejected. */
  register(plugin: OpenCrocPlugin): void;

  /** Unregister a plugin by name. Calls teardown if defined. */
  unregister(name: string): Promise<void>;

  /** Get a registered plugin by name */
  get(name: string): OpenCrocPlugin | undefined;

  /** List all registered plugin names */
  list(): string[];

  /** Invoke a hook across all plugins in registration order */
  invoke<K extends keyof OpenCrocPlugin>(
    hook: K,
    ...args: Parameters<NonNullable<OpenCrocPlugin[K]> extends (...a: infer P) => unknown ? (...a: P) => unknown : never>
  ): Promise<void>;

  /** Invoke transformConfig — applies transforms sequentially and returns final config */
  applyConfigTransforms(config: OpenCrocConfig): Promise<OpenCrocConfig>;
}
