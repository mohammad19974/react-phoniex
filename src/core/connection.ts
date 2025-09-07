import { Socket, LongPoll } from 'phoenix';
import { timingUtils, errorUtils } from '../utils';
import { phoenixEventManager, PHOENIX_EVENTS } from './events';
import { phoenixStorage } from './storage';
import type { ConnectionParams, PhoenixConfig, PhoenixEnv } from '../types';

/**
 * Connection Manager for Phoenix WebSocket Client
 * Handles WebSocket connection lifecycle and state management
 */

type SocketType = InstanceType<typeof Socket>;

export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  lastConnected?: Date;
  lastDisconnected?: Date;
  reconnectAttempts: number;
  error?: Error;
}

export interface ConnectionOptions {
  env: PhoenixEnv;
  config: PhoenixConfig;
  onStateChange?: (state: ConnectionState) => void;
}

/**
 * Connection Manager Class
 */
export class PhoenixConnectionManager {
  private socket: SocketType | null = null;
  private connectionState: ConnectionState = {
    status: 'disconnected',
    reconnectAttempts: 0,
  };
  private connectionParams: ConnectionParams | null = null;
  private options: ConnectionOptions;
  private lastReconnectTime: number = 0;
  private reconnectThrottleMs: number = 5000; // Minimum 5 seconds between force reconnects

  constructor(options: ConnectionOptions) {
    this.options = options;
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return { ...this.connectionState };
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.socket?.isConnected() === true && this.connectionState.status === 'connected';
  }

  /**
   * Check if connection is possible
   */
  canConnect(): boolean {
    return (
      this.connectionState.status === 'disconnected' || this.connectionState.status === 'error'
    );
  }

  /**
   * Connect to Phoenix WebSocket
   */
  async connect(params: ConnectionParams = {}): Promise<SocketType | null> {
    if (!this.canConnect()) {
      return this.socket;
    }

    this.updateState({ status: 'connecting', error: undefined });

    try {
      // Merge connection parameters
      const effectiveParams = this.mergeConnectionParams(params);

      // Create socket URL and parameters
      const socketUrl = this.buildSocketUrl(effectiveParams);
      const socketParams = this.buildSocketParams(effectiveParams);

      // Create socket instance
      this.socket = this.createSocket(socketUrl, socketParams);

      // Setup event handlers
      this.setupSocketHandlers();

      // Store connection parameters
      this.connectionParams = effectiveParams;
      phoenixStorage.saveConnectionParams(effectiveParams);

      // Connect (Phoenix handles this automatically when socket is created)
      await this.waitForConnection();

      return this.socket;
    } catch (error) {
      this.handleConnectionError(error as Error);
      throw error;
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(reason?: string): void {
    if (!this.socket) return;

    try {
      this.socket.disconnect(() => {}, 1000, reason || 'Client disconnect');
    } catch (error) {
      console.warn('[ConnectionManager] Error during disconnect:', error);
    }

    this.socket = null;
    this.updateState({
      status: 'disconnected',
      lastDisconnected: new Date(),
    });
  }

  /**
   * Force reconnect with cleanup and throttling
   */
  forceReconnect(): void {
    const now = Date.now();

    // Throttle force reconnects to prevent resource exhaustion
    if (now - this.lastReconnectTime < this.reconnectThrottleMs) {
      console.warn('[ConnectionManager] Force reconnect throttled - too frequent');
      return;
    }

    console.log('[ConnectionManager] Force reconnecting...');
    this.lastReconnectTime = now;

    // Clean disconnect
    this.disconnect('Force reconnect');

    // Reset connection state
    this.connectionState.reconnectAttempts = 0;

    // Wait before reconnecting
    setTimeout(() => {
      if (this.connectionParams) {
        this.connect(this.connectionParams);
      }
    }, 1000);
  }

  /**
   * Reset connection completely
   */
  reset(): void {
    this.disconnect('Reset');
    this.connectionState = {
      status: 'disconnected',
      reconnectAttempts: 0,
    };
    this.connectionParams = null;
    phoenixStorage.clearConnectionParams();
  }

  /**
   * Update connection configuration
   */
  updateConfig(config: Partial<PhoenixConfig>): void {
    this.options.config = { ...this.options.config, ...config };
    phoenixStorage.saveConfig(this.options.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): PhoenixConfig {
    return { ...this.options.config };
  }

  /**
   * Private Methods
   */

  private updateState(updates: Partial<ConnectionState>): void {
    this.connectionState = { ...this.connectionState, ...updates };
    this.options.onStateChange?.(this.connectionState);
  }

  private mergeConnectionParams(params: ConnectionParams): ConnectionParams {
    const stored = phoenixStorage.loadConnectionParams();
    const previous = stored || {};

    // Deep merge params
    const mergedParams = {
      ...(previous.params || {}),
      ...(params.params || {}),
    };

    return {
      ...previous,
      ...params,
      params: mergedParams,
    };
  }

  private buildSocketUrl(params: ConnectionParams): string {
    if (params.endpoint) return params.endpoint;
    if (this.options.config.url) return this.options.config.url;

    const baseUrl = this.options.env.EDGE_URL || this.options.env.SOCKET_EDGE_URL;
    if (!baseUrl) {
      throw errorUtils.createError('No WebSocket URL configured');
    }

    let wsUrl = baseUrl.replace(/^https?/, 'wss');
    wsUrl = wsUrl.replace(/\/api\/v1$/, '').replace(/\/$/, '');
    return `${wsUrl}/socket`;
  }

  private buildSocketParams(params: ConnectionParams): Record<string, any> {
    const authParams = this.options.config.authParams || {};
    const optionParams = params.params || {};

    return {
      ...authParams,
      ...optionParams,
    };
  }

  private createSocket(url: string, params: Record<string, any>): SocketType {
    const socket = new Socket(url, {
      params: () => params,
      reconnectAfterMs: tries => timingUtils.calculateBackoffDelay(tries),
      transport: this.options.config.useLongPoll ? LongPoll : WebSocket,
      logger: (kind: string, msg: string, data: any) => {
        if (kind === 'error') {
          console.error('Phoenix Socket Error:', msg, data);
        }
      },
      ...(this.options.config.useLongPoll
        ? {
            longPollFallbackMs: undefined,
            debug: false,
            timeout: 10000,
            heartbeatIntervalMs: 30000,
          }
        : {}),
    });

    return socket;
  }

  private setupSocketHandlers(): void {
    if (!this.socket) return;

    const safeHandler = (handlerName: string, handler: Function) => {
      return (...args: any[]) => {
        try {
          return handler(...args);
        } catch (error) {
          console.error(`[ConnectionManager] Error in ${handlerName}:`, error);
          phoenixEventManager.emit(PHOENIX_EVENTS.ERROR, {
            error: error as Error,
            context: handlerName,
          });
        }
      };
    };

    this.socket.onOpen(
      safeHandler('onOpen', () => {
        const wasReconnecting = this.connectionState.status === 'reconnecting';
        this.updateState({
          status: 'connected',
          lastConnected: new Date(),
          reconnectAttempts: 0,
          error: undefined,
        });

        phoenixEventManager.emit(
          wasReconnecting ? PHOENIX_EVENTS.RECONNECT : PHOENIX_EVENTS.CONNECT,
          { timestamp: Date.now() }
        );
      })
    );

    this.socket.onClose(
      safeHandler('onClose', () => {
        if (this.connectionState.status === 'connected') {
          this.updateState({
            status: 'reconnecting',
            lastDisconnected: new Date(),
          });
        } else if (this.connectionState.status === 'connecting') {
          this.updateState({
            status: 'disconnected',
            lastDisconnected: new Date(),
          });
        }

        phoenixEventManager.emit(PHOENIX_EVENTS.DISCONNECT, {
          reason: 'Socket closed',
          timestamp: Date.now(),
        });
      })
    );

    this.socket.onError(
      safeHandler('onError', (error: any) => {
        this.handleSocketError(error);
      })
    );
  }

  private async waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not initialized'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);

      let attempts = 0;
      const maxAttempts = 100; // Prevent infinite loops
      const checkInterval = 50; // Check every 50ms instead of 100ms

      const checkConnection = () => {
        attempts++;

        if (attempts >= maxAttempts) {
          clearTimeout(timeout);
          reject(new Error('Connection check limit exceeded'));
          return;
        }

        if (this.socket?.isConnected()) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkConnection, checkInterval);
        }
      };

      checkConnection();
    });
  }

  private handleConnectionError(error: Error): void {
    this.updateState({
      status: 'error',
      error,
      reconnectAttempts: this.connectionState.reconnectAttempts + 1,
    });

    phoenixEventManager.emit(PHOENIX_EVENTS.ERROR, {
      error,
      context: 'connection',
    });
  }

  private handleSocketError(error: any): void {
    const errorMessage = error?.message || error?.toString() || 'Unknown error';

    // Handle specific poll status errors
    if (errorMessage.includes('unhandled poll status')) {
      this.handlePollStatusError(error);
      return;
    }

    if (this.connectionState.status !== 'reconnecting') {
      this.updateState({ status: 'error', error });
    }

    phoenixEventManager.emit(PHOENIX_EVENTS.ERROR, {
      error: error instanceof Error ? error : new Error(errorMessage),
      context: 'socket',
    });
  }

  private handlePollStatusError(error: any): void {
    console.warn('[ConnectionManager] Poll status error detected, attempting recovery...', error);

    // Switch to WebSocket transport
    this.updateConfig({ useLongPoll: false });

    this.updateState({ status: 'reconnecting' });

    // Disconnect and reconnect
    this.disconnect('Poll status recovery');
    this.socket = null;

    setTimeout(() => {
      if (this.connectionParams) {
        this.connect(this.connectionParams);
      }
    }, 2000);
  }
}
