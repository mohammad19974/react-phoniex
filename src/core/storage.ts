import { storageUtils } from '../utils';
import type { ConnectionParams, PhoenixConfig } from '../types';

/**
 * Storage Manager for Phoenix Client
 * Handles persistence of configuration and connection parameters
 */

const STORAGE_KEYS = {
  CONFIG: 'phoenix_config',
  CONNECTION_PARAMS: 'phoenix_connection_params',
} as const;

/**
 * Storage Manager Class
 */
export class PhoenixStorageManager {
  private readonly configKey = STORAGE_KEYS.CONFIG;
  private readonly connectionParamsKey = STORAGE_KEYS.CONNECTION_PARAMS;

  /**
   * Save configuration to storage
   */
  saveConfig(config: PhoenixConfig): boolean {
    return storageUtils.sessionStorage.set(this.configKey, {
      url: config.url,
      authParams: config.authParams,
      useLongPoll: config.useLongPoll,
      disableLongPollFallback: config.disableLongPollFallback,
    });
  }

  /**
   * Load configuration from storage
   */
  loadConfig(): Partial<PhoenixConfig> | null {
    const stored = storageUtils.sessionStorage.get(this.configKey, null);
    return stored as Partial<PhoenixConfig> | null;
  }

  /**
   * Clear configuration from storage
   */
  clearConfig(): boolean {
    return storageUtils.sessionStorage.remove(this.configKey);
  }

  /**
   * Save connection parameters to storage
   */
  saveConnectionParams(params: ConnectionParams | null): boolean {
    if (!params) return true;

    const serializable = {
      endpoint: params.endpoint || null,
      params: params.params || null,
    };

    return storageUtils.sessionStorage.set(this.connectionParamsKey, serializable);
  }

  /**
   * Load connection parameters from storage
   */
  loadConnectionParams(): ConnectionParams | null {
    const stored = storageUtils.sessionStorage.get(this.connectionParamsKey, null);

    if (
      stored &&
      typeof stored === 'object' &&
      stored !== null &&
      ('endpoint' in stored || 'params' in stored)
    ) {
      return stored as ConnectionParams;
    }

    return null;
  }

  /**
   * Clear connection parameters from storage
   */
  clearConnectionParams(): boolean {
    return storageUtils.sessionStorage.remove(this.connectionParamsKey);
  }

  /**
   * Clear all stored data
   */
  clearAll(): void {
    this.clearConfig();
    this.clearConnectionParams();
  }

  /**
   * Check if storage is available
   */
  isStorageAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.sessionStorage;
  }
}

/**
 * Global storage manager instance
 */
export const phoenixStorage = new PhoenixStorageManager();

/**
 * Storage operation result types
 */
export interface StorageResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
}

/**
 * Storage utilities for specific use cases
 */
export const storageHelpers = {
  /**
   * Safely merge stored config with defaults
   */
  mergeWithDefaults: (
    stored: Partial<PhoenixConfig> | null,
    defaults: PhoenixConfig
  ): PhoenixConfig => {
    if (!stored) return defaults;

    return {
      url: stored.url ?? defaults.url,
      authParams: stored.authParams ?? defaults.authParams,
      useLongPoll: stored.useLongPoll ?? defaults.useLongPoll,
      disableLongPollFallback: stored.disableLongPollFallback ?? defaults.disableLongPollFallback,
    };
  },

  /**
   * Type-safe storage operations
   */
  safeSet: <T>(key: string, value: T): boolean => {
    try {
      return storageUtils.sessionStorage.set(key, value);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(`[Storage] Failed to save ${key}:`, error);
      return false;
    }
  },

  safeGet: <T>(key: string, defaultValue: T): T => {
    try {
      return storageUtils.sessionStorage.get(key, defaultValue);
    } catch (error) {
      console.warn(`[Storage] Failed to load ${key}:`, error);
      return defaultValue;
    }
  },

  /**
   * Detailed result storage operations
   */
  safeSetWithResult: <T>(key: string, value: T): StorageResult<T> => {
    try {
      const success = storageUtils.sessionStorage.set(key, value);
      return { success, data: success ? value : undefined };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  safeGetWithResult: <T>(key: string, defaultValue: T): StorageResult<T> => {
    try {
      const data = storageUtils.sessionStorage.get(key, defaultValue);
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        data: defaultValue,
      };
    }
  },

  /**
   * Validate stored connection parameters
   */
  validateConnectionParams: (params: unknown): params is ConnectionParams => {
    if (!params || typeof params !== 'object') return false;

    const obj = params as Record<string, unknown>;

    const hasEndpoint = obj.endpoint && typeof obj.endpoint === 'string';
    const hasParams =
      obj.params !== undefined && typeof obj.params === 'object' && obj.params !== null;

    return Boolean(hasEndpoint || hasParams);
  },

  /**
   * Create storage key for channel-specific data
   */
  createChannelStorageKey: (topic: string): string => {
    return `phoenix_channel_${topic.replace(/[^a-zA-Z0-9]/g, '_')}`;
  },

  /**
   * Type guards for storage validation
   */
  isValidConfig: (config: unknown): config is PhoenixConfig => {
    if (!config || typeof config !== 'object') return false;

    const obj = config as Record<string, unknown>;
    return (
      (obj.url === null || typeof obj.url === 'string') &&
      (obj.authParams === null ||
        (typeof obj.authParams === 'object' && obj.authParams !== null)) &&
      typeof obj.useLongPoll === 'boolean' &&
      typeof obj.disableLongPollFallback === 'boolean'
    );
  },

  isValidConnectionParams: (params: unknown): params is ConnectionParams => {
    if (!params || typeof params !== 'object') return false;

    const obj = params as Record<string, unknown>;
    return (
      (obj.endpoint === undefined || typeof obj.endpoint === 'string') &&
      (obj.params === undefined || (typeof obj.params === 'object' && obj.params !== null)) &&
      (obj.headers === undefined || (typeof obj.headers === 'object' && obj.headers !== null)) &&
      (obj.timeout === undefined || typeof obj.timeout === 'number')
    );
  },

  /**
   * Storage cleanup utilities
   */
  clearByPattern: (pattern: RegExp): number => {
    if (typeof window === 'undefined' || !window.sessionStorage) return 0;

    let cleared = 0;
    try {
      const keys = Object.keys(window.sessionStorage);
      for (const key of keys) {
        if (pattern.test(key)) {
          window.sessionStorage.removeItem(key);
          cleared++;
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[Storage] Error during pattern cleanup:', error);
    }

    return cleared;
  },

  clearPhoenixData: (): number => {
    return storageHelpers.clearByPattern(/^phoenix_/);
  },
};
