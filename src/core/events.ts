import { eventUtils } from '../utils';

/**
 * Phoenix Events and Event Management System
 * Centralized event handling for the Phoenix client
 */

export const PHOENIX_EVENTS = {
  CONNECT: 'phoenix_connect',
  DISCONNECT: 'phoenix_disconnect',
  ERROR: 'phoenix_error',
  RECONNECT: 'phoenix_reconnect',
  CHANNEL_JOIN: 'phoenix_channel_join',
  CHANNEL_LEAVE: 'phoenix_channel_leave',
  CHANNEL_ERROR: 'phoenix_channel_error',
} as const;

export type PhoenixEventType = (typeof PHOENIX_EVENTS)[keyof typeof PHOENIX_EVENTS];

/**
 * Event Manager for Phoenix Client
 * Handles all event emission and subscription
 */
export class PhoenixEventManager {
  private emitter = eventUtils.createEventEmitter();
  private maxListenersPerEvent: number = 20; // Prevent memory leaks from too many listeners
  private listenerCounts = new Map<string, number>();

  /**
   * Subscribe to an event
   */
  on(event: PhoenixEventType, handler: Function): void {
    const currentCount = this.listenerCounts.get(event) || 0;

    if (currentCount >= this.maxListenersPerEvent) {
      console.warn(
        `[EventManager] Maximum listeners (${this.maxListenersPerEvent}) exceeded for event: ${event}`
      );
      return;
    }

    this.emitter.on(event, handler);
    this.listenerCounts.set(event, currentCount + 1);
  }

  /**
   * Unsubscribe from an event
   */
  off(event: PhoenixEventType, handler: Function): void {
    this.emitter.off(event, handler);
    const currentCount = this.listenerCounts.get(event) || 0;
    if (currentCount > 0) {
      this.listenerCounts.set(event, currentCount - 1);
    }
  }

  /**
   * Emit an event with data
   */
  emit(event: PhoenixEventType, data?: any): void {
    this.emitter.emit(event, data);
  }

  /**
   * Get resource usage statistics
   */
  getResourceStats(): {
    totalListeners: number;
    maxListenersPerEvent: number;
    eventsWithListeners: number;
  } {
    let totalListeners = 0;
    for (const count of this.listenerCounts.values()) {
      totalListeners += count;
    }

    return {
      totalListeners,
      maxListenersPerEvent: this.maxListenersPerEvent,
      eventsWithListeners: this.listenerCounts.size,
    };
  }

  /**
   * Clear all event listeners
   */
  clear(): void {
    this.emitter.clear();
    this.listenerCounts.clear();
  }

  /**
   * Get the number of listeners for an event
   */
  listenerCount(event: PhoenixEventType): number {
    // This would require extending the event emitter to track counts
    return 0;
  }
}

/**
 * Event Data Types
 */
export interface PhoenixEventData {
  [PHOENIX_EVENTS.CONNECT]: { timestamp: number };
  [PHOENIX_EVENTS.DISCONNECT]: { reason?: string; timestamp: number };
  [PHOENIX_EVENTS.ERROR]: { error: Error; context?: string };
  [PHOENIX_EVENTS.RECONNECT]: { attempt: number; timestamp: number };
  [PHOENIX_EVENTS.CHANNEL_JOIN]: { topic: string; response?: any };
  [PHOENIX_EVENTS.CHANNEL_LEAVE]: { topic: string; response?: any };
  [PHOENIX_EVENTS.CHANNEL_ERROR]: { topic: string; error: Error };
}

/**
 * Type-safe event emitter
 */
export type EventEmitter<T extends Record<string, any>> = {
  on<K extends keyof T>(event: K, handler: (data: T[K]) => void): void;
  off<K extends keyof T>(event: K, handler: (data: T[K]) => void): void;
  emit<K extends keyof T>(event: K, data: T[K]): void;
};

/**
 * Create a type-safe event emitter for Phoenix events
 */
export function createPhoenixEventEmitter(): EventEmitter<PhoenixEventData> {
  const emitter = eventUtils.createEventEmitter();

  return {
    on: (event, handler) => emitter.on(event, handler),
    off: (event, handler) => emitter.off(event, handler),
    emit: (event, data) => emitter.emit(event, data),
  };
}

/**
 * Global Phoenix event manager instance
 */
export const phoenixEventManager = new PhoenixEventManager();
