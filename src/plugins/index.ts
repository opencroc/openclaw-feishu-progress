import type { OpenCrocConfig } from '../types.js';
import type { OpenCrocPlugin, PluginRegistry } from './types.js';

export type { OpenCrocPlugin, PluginRegistry } from './types.js';

/**
 * Create a plugin registry.
 *
 * @example
 * ```ts
 * const registry = createPluginRegistry();
 * registry.register({ name: 'my-plugin', beforePipeline() { console.log('go!'); } });
 * await registry.invoke('beforePipeline', config);
 * ```
 */
export function createPluginRegistry(): PluginRegistry {
  const plugins: OpenCrocPlugin[] = [];

  function register(plugin: OpenCrocPlugin): void {
    if (!plugin.name) {
      throw new Error('Plugin must have a name');
    }
    if (plugins.some((p) => p.name === plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }
    plugins.push(plugin);
  }

  async function unregister(name: string): Promise<void> {
    const idx = plugins.findIndex((p) => p.name === name);
    if (idx === -1) return;
    const plugin = plugins[idx];
    if (plugin.teardown) {
      await plugin.teardown();
    }
    plugins.splice(idx, 1);
  }

  function get(name: string): OpenCrocPlugin | undefined {
    return plugins.find((p) => p.name === name);
  }

  function list(): string[] {
    return plugins.map((p) => p.name);
  }

  async function invoke<K extends keyof OpenCrocPlugin>(
    hook: K,
    ...args: unknown[]
  ): Promise<void> {
    for (const plugin of plugins) {
      const fn = plugin[hook];
      if (typeof fn === 'function') {
        await (fn as (...a: unknown[]) => unknown).apply(plugin, args);
      }
    }
  }

  async function applyConfigTransforms(config: OpenCrocConfig): Promise<OpenCrocConfig> {
    let result = config;
    for (const plugin of plugins) {
      if (plugin.transformConfig) {
        result = await plugin.transformConfig(result);
      }
    }
    return result;
  }

  return { register, unregister, get, list, invoke, applyConfigTransforms };
}

/**
 * Helper to define a plugin with type safety.
 */
export function definePlugin(plugin: OpenCrocPlugin): OpenCrocPlugin {
  return plugin;
}
