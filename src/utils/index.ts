/**
 * Utility functions for React Phoenix library
 * Common patterns, error handling, validation, and helpers
 */

// Error handling utilities
export const errorUtils = {
  /**
   * Create a standardized error object
   */
  createError: (message: string, code?: string, originalError?: any): Error => {
    const error = new Error(message);
    (error as any).code = code;
    (error as any).originalError = originalError;
    return error;
  },

  /**
   * Handle async operations with error recovery
   */
  withErrorRecovery: async <T>(
    operation: () => Promise<T>,
    fallbackValue: T,
    errorHandler?: (error: any) => void
  ): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      errorHandler?.(error);
      return fallbackValue;
    }
  },

  /**
   * Safe callback execution
   */
  safeCallback: (callback: Function | undefined, ...args: any[]): void => {
    if (callback && typeof callback === 'function') {
      try {
        callback(...args);
      } catch (error) {
        console.warn('[ReactPhoenix] Callback error:', error);
      }
    }
  },
};

// Validation utilities
export const validationUtils = {
  /**
   * Validate topic format
   */
  isValidTopic: (topic: string): boolean => {
    return typeof topic === 'string' && topic.length > 0 && topic.includes(':');
  },

  /**
   * Validate WebSocket URL
   */
  isValidWebSocketUrl: (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
    } catch {
      return false;
    }
  },

  /**
   * Validate connection parameters
   */
  validateConnectionParams: (params: Record<string, any>): boolean => {
    if (typeof params !== 'object' || params === null) return false;
    return true;
  },
};

// Timing utilities
export const timingUtils = {
  /**
   * Exponential backoff calculator
   */
  calculateBackoffDelay: (attempt: number, baseDelay: number = 1000): number => {
    return Math.min(baseDelay * Math.pow(2, attempt), 30000); // Max 30 seconds
  },

  /**
   * Debounce function
   */
  debounce: <T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): ((...args: Parameters<T>) => void) => {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  },

  /**
   * Throttle function
   */
  throttle: <T extends (...args: any[]) => any>(
    func: T,
    limit: number
  ): ((...args: Parameters<T>) => void) => {
    let inThrottle: boolean;
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  },
};

// Storage utilities
export const storageUtils = {
  /**
   * Safe sessionStorage operations
   */
  sessionStorage: {
    get: <T>(key: string, defaultValue: T): T => {
      if (typeof window === 'undefined' || !window.sessionStorage) {
        return defaultValue;
      }
      try {
        const item = sessionStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
      } catch {
        return defaultValue;
      }
    },

    set: (key: string, value: any): boolean => {
      if (typeof window === 'undefined' || !window.sessionStorage) {
        return false;
      }
      try {
        sessionStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },

    remove: (key: string): boolean => {
      if (typeof window === 'undefined' || !window.sessionStorage) {
        return false;
      }
      try {
        sessionStorage.removeItem(key);
        return true;
      } catch {
        return false;
      }
    },
  },
};

// Event utilities
export const eventUtils = {
  /**
   * Create event emitter pattern
   */
  createEventEmitter: () => {
    const listeners = new Map<string, Set<Function>>();

    return {
      on: (event: string, handler: Function) => {
        if (!listeners.has(event)) {
          listeners.set(event, new Set());
        }
        listeners.get(event)!.add(handler);
      },

      off: (event: string, handler: Function) => {
        const handlers = listeners.get(event);
        if (handlers) {
          handlers.delete(handler);
          if (handlers.size === 0) {
            listeners.delete(event);
          }
        }
      },

      emit: (event: string, data?: any) => {
        const handlers = listeners.get(event);
        if (handlers) {
          handlers.forEach(handler => {
            try {
              handler(data);
            } catch (error) {
              console.error(`[EventEmitter] Error in ${event} handler:`, error);
            }
          });
        }
      },

      clear: () => {
        listeners.clear();
      },
    };
  },
};

// State utilities
export const stateUtils = {
  /**
   * Deep merge objects
   */
  deepMerge: <T extends Record<string, any>>(target: T, source: Partial<T>): T => {
    const result = { ...target };

    Object.keys(source).forEach(key => {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
        result[key] =
          targetValue && typeof targetValue === 'object'
            ? stateUtils.deepMerge(targetValue, sourceValue)
            : sourceValue;
      } else {
        result[key] = sourceValue;
      }
    });

    return result;
  },

  /**
   * Check if objects are deeply equal
   */
  deepEqual: (a: any, b: any): boolean => {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== typeof b) return false;

    if (typeof a === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);

      if (keysA.length !== keysB.length) return false;

      for (const key of keysA) {
        if (!keysB.includes(key)) return false;
        if (!stateUtils.deepEqual(a[key], b[key])) return false;
      }

      return true;
    }

    return false;
  },
};

// Channel utilities
export const channelUtils = {
  /**
   * Generate unique channel key
   */
  createChannelKey: (topic: string, params?: Record<string, any>): string => {
    const paramsKey = params ? JSON.stringify(params) : '';
    return `${topic}:${paramsKey}`;
  },

  /**
   * Parse channel key
   */
  parseChannelKey: (key: string): { topic: string; params?: Record<string, any> } => {
    const [topic, paramsStr] = key.split(':', 2);
    let params: Record<string, any> | undefined;

    if (paramsStr) {
      try {
        params = JSON.parse(paramsStr);
      } catch {
        // Ignore parsing errors
      }
    }

    return { topic, params };
  },
};
