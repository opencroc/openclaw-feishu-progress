import { describe, it, expect, vi } from 'vitest';
import { createPluginRegistry, definePlugin } from './index.js';
import type { OpenCrocPlugin } from './types.js';

describe('Plugin System', () => {
  describe('createPluginRegistry', () => {
    it('should register and list plugins', () => {
      const registry = createPluginRegistry();
      registry.register({ name: 'a' });
      registry.register({ name: 'b' });
      expect(registry.list()).toEqual(['a', 'b']);
    });

    it('should reject duplicate plugin names', () => {
      const registry = createPluginRegistry();
      registry.register({ name: 'dup' });
      expect(() => registry.register({ name: 'dup' })).toThrow('already registered');
    });

    it('should reject plugin without name', () => {
      const registry = createPluginRegistry();
      expect(() => registry.register({ name: '' })).toThrow('must have a name');
    });

    it('should get plugin by name', () => {
      const registry = createPluginRegistry();
      const plugin: OpenCrocPlugin = { name: 'test-plugin' };
      registry.register(plugin);
      expect(registry.get('test-plugin')).toBe(plugin);
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('should unregister and call teardown', async () => {
      const teardown = vi.fn();
      const registry = createPluginRegistry();
      registry.register({ name: 'removable', teardown });
      await registry.unregister('removable');
      expect(teardown).toHaveBeenCalledOnce();
      expect(registry.list()).toEqual([]);
    });

    it('should silently ignore unregister of unknown plugin', async () => {
      const registry = createPluginRegistry();
      await registry.unregister('nope'); // should not throw
    });

    it('should invoke hooks in registration order', async () => {
      const order: string[] = [];
      const registry = createPluginRegistry();
      registry.register({
        name: 'first',
        beforePipeline: () => { order.push('first'); },
      });
      registry.register({
        name: 'second',
        beforePipeline: () => { order.push('second'); },
      });
      await registry.invoke('beforePipeline', { backendRoot: '.' });
      expect(order).toEqual(['first', 'second']);
    });

    it('should skip plugins without the invoked hook', async () => {
      const registry = createPluginRegistry();
      registry.register({ name: 'no-hooks' });
      // should not throw
      await registry.invoke('beforePipeline', { backendRoot: '.' });
    });

    it('should apply config transforms sequentially', async () => {
      const registry = createPluginRegistry();
      registry.register({
        name: 'add-outdir',
        transformConfig: (config) => ({ ...config, outDir: './custom' }),
      });
      registry.register({
        name: 'add-module',
        transformConfig: (config) => ({ ...config, modules: ['auth'] }),
      });
      const result = await registry.applyConfigTransforms({ backendRoot: '/app' });
      expect(result.outDir).toBe('./custom');
      expect(result.modules).toEqual(['auth']);
      expect(result.backendRoot).toBe('/app');
    });
  });

  describe('definePlugin', () => {
    it('should return the same plugin object', () => {
      const plugin = definePlugin({ name: 'my-plugin' });
      expect(plugin.name).toBe('my-plugin');
    });
  });
});
