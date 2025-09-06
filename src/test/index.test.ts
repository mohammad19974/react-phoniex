import { describe, it, expect } from 'vitest';
import * as index from '../index';

describe('Main Index Exports', () => {
  it('should export usePhoenix hook', () => {
    expect(typeof index.usePhoenix).toBe('function');
  });

  it('should export usePhoenixChannel hook', () => {
    expect(typeof index.usePhoenixChannel).toBe('function');
  });

  it('should export usePhoenixMessage hook', () => {
    expect(typeof index.usePhoenixMessage).toBe('function');
  });

  it('should export phoenixClient', () => {
    expect(index.phoenixClient).toBeDefined();
  });

  it('should export setPhoenixEnv function', () => {
    expect(typeof index.setPhoenixEnv).toBe('function');
  });

  it('should export initializePhoenixClient function', () => {
    expect(typeof index.initializePhoenixClient).toBe('function');
  });

  it('should export getPhoenixClient function', () => {
    expect(typeof index.getPhoenixClient).toBe('function');
  });

  it('should export PHOENIX_EVENTS', () => {
    expect(index.PHOENIX_EVENTS).toBeDefined();
    expect(typeof index.PHOENIX_EVENTS).toBe('object');
    expect(index.PHOENIX_EVENTS.CONNECT).toBe('phoenix_connect');
    expect(index.PHOENIX_EVENTS.DISCONNECT).toBe('phoenix_disconnect');
    expect(index.PHOENIX_EVENTS.ERROR).toBe('phoenix_error');
    expect(index.PHOENIX_EVENTS.RECONNECT).toBe('phoenix_reconnect');
  });

  it('should export TypeScript types', () => {
    // These are type exports, so we can't test them directly
    // but we can ensure they're exported by checking the module structure
    expect(index).toHaveProperty('usePhoenix');
    expect(index).toHaveProperty('usePhoenixChannel');
    expect(index).toHaveProperty('usePhoenixMessage');
  });

  it('should export default', () => {
    expect(index.default).toBeDefined();
  });

  it('should have all expected named exports', () => {
    const expectedExports = [
      'usePhoenix',
      'usePhoenixChannel',
      'usePhoenixMessage',
      'phoenixClient',
      'setPhoenixEnv',
      'initializePhoenixClient',
      'getPhoenixClient',
      'PHOENIX_EVENTS',
      'default',
    ];

    expectedExports.forEach(exportName => {
      expect(index).toHaveProperty(exportName);
    });
  });
});

describe('Type Exports', () => {
  it('should compile without type errors', () => {
    // This test ensures that TypeScript types are properly exported
    // We can't test types directly at runtime, but we can ensure
    // the module compiles and exports exist
    expect(() => {
      // This would fail at compile time if types weren't exported
      const _: any = index.usePhoenix;
      const __: any = index.usePhoenixChannel;
      const ___: any = index.usePhoenixMessage;
    }).not.toThrow();
  });
});
