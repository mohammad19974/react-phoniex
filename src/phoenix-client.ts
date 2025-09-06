import { Socket, LongPoll } from 'phoenix';
import type { PhoenixEnv, ConnectionParams, PhoenixConfig } from './types';

// Import Socket as a type for TypeScript
type SocketType = InstanceType<typeof Socket>;

// Phoenix client events
export const PHOENIX_EVENTS = {
  CONNECT: 'phoenix_connect',
  DISCONNECT: 'phoenix_disconnect',
  ERROR: 'phoenix_error',
  RECONNECT: 'phoenix_reconnect',
};

// Reconnection intervals with exponential backoff
const RECONNECT_INTERVALS = [1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000];

/**
 * Optimized Phoenix WebSocket Client
 * - Single connection management
 * - Built-in Phoenix reconnection
 * - Efficient state management
 * - Memory leak prevention
 */
export class PhoenixClient {
  private socket: SocketType | null = null;
  private channels: Map<string, any> = new Map();
  private connectionState: string = 'disconnected';
  private eventHandlers: Map<string, Set<Function>> = new Map();
  private connectionParams: ConnectionParams | null = null;
  private env: PhoenixEnv;
  private config: PhoenixConfig = {
    url: null,
    authParams: null,
    useLongPoll: false,
    disableLongPollFallback: false,
  };

  constructor(env: PhoenixEnv = {}) {
    this.env = env;

    // Initialize from session storage if available
    this._restoreConfig();
    this._restoreConnectionParams();

    // Setup global error handler for unhandled Phoenix errors
    this._setupGlobalErrorHandler();
  }

  // Configuration methods
  setWebSocketUrl(url: string): void {
    this.config.url = url;
    this._persistConfig();
  }

  setAuthParams(authParams: any): void {
    this.config.authParams = authParams ? { ...authParams } : null;
    this._persistConfig();
  }

  setLongPollSupport(enabled: boolean): void {
    this.config.useLongPoll = Boolean(enabled);
    this._persistConfig();
  }

  disableLongPollFallback(): void {
    this.config.disableLongPollFallback = true;
    this._persistConfig();
  }

  clearConfig(): void {
    this.config = {
      url: null,
      authParams: null,
      useLongPoll: false,
      disableLongPollFallback: false,
    };
    this._clearPersistedConfig();
  }

  /**
   * Set environment configuration
   * @param env - Environment configuration
   */
  setEnvironment(env: PhoenixEnv): void {
    this.env = { ...this.env, ...env };
  }

  // Connection management
  connect(options: ConnectionParams = {}): SocketType | null {
    // Determine effective options by merging existing saved params with incoming ones
    const previous = this.connectionParams || {};
    const incoming = options || {};
    // Deep-merge only for the `params` key to avoid losing query params
    const mergedParams = {
      ...(previous.params || {}),
      ...(incoming.params || {}),
    };
    const effectiveOptions: ConnectionParams = {
      ...previous,
      ...incoming,
      params: mergedParams,
    };

    // Return existing socket if already connected
    if (this.isConnected()) {
      const shouldReconnect = this._hasConnectionParamsChanged(effectiveOptions);
      if (!shouldReconnect) {
        return this.socket;
      }

      // Disconnect if params changed
      this.disconnect();
    }

    // Prevent multiple connection attempts
    if (this.connectionState === 'connecting') {
      return this.socket;
    }

    this.connectionState = 'connecting';
    this.connectionParams = effectiveOptions;
    this._persistConnectionParams();

    try {
      const socketUrl = this._getSocketUrl(effectiveOptions);
      const socketParams = this._getSocketParams(effectiveOptions);

      // Create socket with optimized configuration
      this.socket = new Socket(socketUrl, {
        params: () => this._getSocketParams(this.connectionParams || effectiveOptions),
        reconnectAfterMs: tries => this._getReconnectDelay(tries),
        rejoinAfterMs: tries => {
          return [1000, 2000, 5000, 10000][tries - 1] || 10000;
        },
        transport: this.config.useLongPoll ? LongPoll : WebSocket,
        logger: (kind: string, msg: string, data: any) => {
          if (kind === 'error') {
            console.error('Phoenix Socket Error:', msg, data);
          }
        },
        ...(this.config.useLongPoll
          ? {
              longPollFallbackMs: undefined,
              debug: false,
              timeout: 10000,
              heartbeatIntervalMs: 30000,
            }
          : {}),
      });

      this._setupSocketHandlers();
      // Socket automatically connects when created, no need to call connect() manually

      return this.socket;
    } catch (error) {
      this.connectionState = 'error';
      this._emit(PHOENIX_EVENTS.ERROR, error);
      throw error;
    }
  }

  disconnect(): void {
    if (!this.socket) return;

    // Leave all channels
    this.channels.forEach(channel => {
      try {
        channel.leave();
      } catch (e) {
        // Ignore errors during cleanup
      }
    });
    this.channels.clear();

    // Disconnect socket
    try {
      this.socket.disconnect(() => {}, 1000, 'Client disconnect');
    } catch (e) {
      // Ignore errors during disconnect
    }

    this.socket = null;
    this.connectionState = 'disconnected';
  }

  resetConnection(): void {
    this.disconnect();
    this.connectionState = 'disconnected';
    this.connectionParams = null;
    this._clearPersistedConfig();
    this._clearPersistedConnectionParams();
  }

  forceReconnect(): void {
    console.log('[PhoenixClient] Force reconnecting...');
    const currentParams = this.connectionParams;

    // Clean disconnect
    this.disconnect();

    // Reset transport configuration
    this.config.useLongPoll = false;

    // Wait a moment then reconnect
    setTimeout(() => {
      if (currentParams) {
        this.connect(currentParams);
      }
    }, 1000);
  }

  // Channel management
  joinChannel(topic: string, params: any = {}): any {
    if (!this.socket) {
      console.error('[PhoenixClient] Cannot join channel: socket is not connected');
      throw new Error('Socket not connected. Call connect() first.');
    }

    // Return existing channel if already joined
    const existing = this.channels.get(topic);
    if (existing?.state === 'joined') {
      return existing;
    }

    // Create or reuse channel
    const channel = existing || this.socket.channel(topic, params);

    // Only setup join handlers once
    if (!existing) {
      channel
        .join()
        .receive('ok', (_response: any) => {
          console.log(`✅ Joined channel ${topic}`);
          this.channels.set(topic, channel);
        })
        .receive('error', (error: any) => {
          console.error(`❌ Failed to join channel ${topic}:`, error);
        })
        .receive('timeout', () => {
          console.error(`⏱️ Channel join timeout: ${topic}`);
        });
    }

    return channel;
  }

  leaveChannel(topic: string): void {
    const channel = this.channels.get(topic);
    if (channel) {
      channel.leave();
      this.channels.delete(topic);
    }
  }

  sendMessage(topic: string, event: string, payload: any = {}): Promise<any> {
    const channel = this.channels.get(topic);
    if (!channel) {
      throw new Error(`Channel ${topic} not found. Join the channel first.`);
    }

    return new Promise((resolve, reject) => {
      channel
        .push(event, payload)
        .receive('ok', resolve)
        .receive('error', reject)
        .receive('timeout', () => reject(new Error('Message timeout')));
    });
  }

  onMessage(topic: string, event: string, callback: Function): void {
    const channel = this.channels.get(topic);
    if (!channel) {
      throw new Error(`Channel ${topic} not found. Join the channel first.`);
    }
    channel.on(event, callback);
  }

  offMessage(topic: string, event: string, callback: Function): void {
    const channel = this.channels.get(topic);
    if (channel) {
      channel.off(event, callback);
    }
  }

  // State & Events
  getConnectionState(): string {
    return this.connectionState;
  }

  isConnected(): boolean {
    return this.socket?.isConnected() === true;
  }

  canConnect(): boolean {
    return !this.isConnected() && this.connectionState !== 'connecting';
  }

  getConnectionStatus(): any {
    return {
      connectionState: this.connectionState,
      isConnected: this.isConnected(),
      canConnect: this.canConnect(),
      channelCount: this.channels.size,
      config: { ...this.config },
    };
  }

  addEventListener(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  removeEventListener(event: string, handler: Function): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(event);
      }
    }
  }

  // Private methods
  private _setupSocketHandlers(): void {
    if (!this.socket) {
      console.warn('[PhoenixClient] Cannot setup socket handlers: socket is null');
      return;
    }

    const safeSocketHandler = (handlerName: string, handler: Function) => {
      return (...args: any[]) => {
        try {
          return handler(...args);
        } catch (error) {
          console.error(`[PhoenixClient] Error in ${handlerName}:`, error);
          this._emit(PHOENIX_EVENTS.ERROR, error);
        }
      };
    };

    this.socket.onOpen(
      safeSocketHandler('onOpen', () => {
        const wasReconnecting = this.connectionState === 'reconnecting';
        this.connectionState = 'connected';
        this._emit(wasReconnecting ? PHOENIX_EVENTS.RECONNECT : PHOENIX_EVENTS.CONNECT);
      })
    );

    this.socket.onClose(
      safeSocketHandler('onClose', () => {
        if (this.connectionState === 'connected') {
          this.connectionState = 'reconnecting';
        } else if (this.connectionState === 'connecting') {
          this.connectionState = 'disconnected';
        }
        this._emit(PHOENIX_EVENTS.DISCONNECT);
      })
    );

    this.socket.onError(
      safeSocketHandler('onError', (error: any) => {
        const errorMessage = error?.message || error?.toString() || 'Unknown error';

        if (
          errorMessage.includes('unhandled poll status') ||
          errorMessage.includes('poll status undefined')
        ) {
          this._handlePollStatusError(error);
          return;
        }

        if (this.connectionState !== 'reconnecting') {
          this.connectionState = 'error';
        }
        this._emit(PHOENIX_EVENTS.ERROR, error);
      })
    );
  }

  private _setupGlobalErrorHandler(): void {
    if (typeof window !== 'undefined' && !window.__phoenixErrorHandlerSetup) {
      (window as any).__phoenixErrorHandlerSetup = true;

      const originalConsoleError = console.error;
      console.error = (...args: any[]) => {
        const errorString = args.join(' ');
        if (errorString.includes('unhandled poll status undefined')) {
          console.warn('[PhoenixClient] Caught global poll status error, attempting recovery...');
          this._handlePollStatusError(new Error(errorString));
          return;
        }
        originalConsoleError.apply(console, args);
      };

      window.addEventListener('unhandledrejection', event => {
        const error = event.reason;
        if (error && error.message && error.message.includes('unhandled poll status')) {
          console.warn('[PhoenixClient] Caught unhandled promise rejection for poll status error');
          this._handlePollStatusError(error);
          event.preventDefault();
        }
      });
    }
  }

  private _handlePollStatusError(error: any): void {
    console.warn('[PhoenixClient] Poll status error detected, attempting recovery...', error);

    this.config.useLongPoll = false;
    this.connectionState = 'reconnecting';

    try {
      if (this.socket) {
        this.socket.disconnect(() => {}, 1000, 'Poll status recovery disconnect');
      }
    } catch (e) {
      console.warn('[PhoenixClient] Error during disconnect in poll status recovery:', e);
    }

    this.socket = null;

    setTimeout(() => {
      if (this.connectionParams) {
        console.log('[PhoenixClient] Attempting recovery from poll status error...');
        try {
          this.connect(this.connectionParams);
        } catch (recoveryError) {
          console.error('[PhoenixClient] Recovery from poll status error failed:', recoveryError);
          this._emit(PHOENIX_EVENTS.ERROR, recoveryError);
        }
      }
    }, 2000);
  }

  private _emit(event: string, data?: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  private _getSocketUrl(options: ConnectionParams): string {
    if (options.endpoint) return options.endpoint;
    if (this.config.url) return this.config.url;

    const baseUrl = this.env.EDGE_URL || this.env.SOCKET_EDGE_URL;
    if (!baseUrl) {
      throw new Error('No WebSocket URL configured');
    }

    let wsUrl = baseUrl.replace(/^https?/, 'wss');
    wsUrl = wsUrl.replace(/\/api\/v1$/, '').replace(/\/$/, '');
    return `${wsUrl}/socket`;
  }

  private _getSocketParams(options: ConnectionParams): any {
    const authParams = this.config.authParams || this._getDefaultAuthParams();
    const optionParams = options.params || {};

    return {
      ...authParams,
      ...optionParams,
    };
  }

  private _getDefaultAuthParams(): any {
    return {};
  }

  private _getReconnectDelay(tries: number): number {
    const index = Math.min(tries - 1, RECONNECT_INTERVALS.length - 1);
    return RECONNECT_INTERVALS[Math.max(0, index)];
  }

  private _hasConnectionParamsChanged(options: ConnectionParams): boolean {
    if (!this.connectionParams) return false;

    const currentEndpoint = this.connectionParams.endpoint || this.config.url;
    const newEndpoint = options.endpoint;
    if (newEndpoint && currentEndpoint !== newEndpoint) {
      return true;
    }

    const currentParams = this.connectionParams.params || {};
    const newParams = options.params || {};

    const keys = new Set([...Object.keys(currentParams), ...Object.keys(newParams)]);
    for (const key of keys) {
      if (currentParams[key] !== newParams[key]) {
        return true;
      }
    }

    return false;
  }

  private _persistConfig(): void {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        sessionStorage.setItem('phoenix_config', JSON.stringify(this.config));
      } catch (e) {
        // Ignore storage errors
      }
    }
  }

  private _restoreConfig(): void {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const stored = sessionStorage.getItem('phoenix_config');
        if (stored) {
          this.config = { ...this.config, ...JSON.parse(stored) };
        }
      } catch (e) {
        // Ignore storage errors
      }
    }
  }

  private _clearPersistedConfig(): void {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        sessionStorage.removeItem('phoenix_config');
      } catch (e) {
        // Ignore storage errors
      }
    }
  }

  private _persistConnectionParams(): void {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const serializable = this.connectionParams
          ? {
              endpoint: this.connectionParams.endpoint || null,
              params: this.connectionParams.params || null,
            }
          : null;
        if (serializable) {
          sessionStorage.setItem('phoenix_connection_params', JSON.stringify(serializable));
        }
      } catch (e) {
        // Ignore storage errors
      }
    }
  }

  private _restoreConnectionParams(): void {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const stored = sessionStorage.getItem('phoenix_connection_params');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && (parsed.endpoint || parsed.params)) {
            this.connectionParams = parsed;
          }
        }
      } catch (e) {
        // Ignore storage errors
      }
    }
  }

  private _clearPersistedConnectionParams(): void {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        sessionStorage.removeItem('phoenix_connection_params');
      } catch (e) {
        // Ignore storage errors
      }
    }
  }
}

// Create instances and exports
let phoenixClientInstance: PhoenixClient | null = null;

export const initializePhoenixClient = (env: PhoenixEnv): PhoenixClient => {
  if (!phoenixClientInstance) {
    phoenixClientInstance = new PhoenixClient(env);
  }
  return phoenixClientInstance;
};

export const getPhoenixClient = (): PhoenixClient => {
  if (!phoenixClientInstance) {
    throw new Error('Phoenix client not initialized. Call initializePhoenixClient(env) first.');
  }
  return phoenixClientInstance;
};

const defaultPhoenixClient = new PhoenixClient();

export const setPhoenixEnv = (env: PhoenixEnv): void => {
  defaultPhoenixClient.setEnvironment(env);
};

export const phoenixClient = defaultPhoenixClient;

// Convenience exports
export const connectPhoenix = (options?: ConnectionParams): SocketType | null =>
  phoenixClient.connect(options);
export const disconnectPhoenix = (): void => phoenixClient.disconnect();
export const resetPhoenixConnection = (): void => phoenixClient.resetConnection();
export const forcePhoenixReconnect = (): void => phoenixClient.forceReconnect();
export const joinChannel = (topic: string, params?: any): any =>
  phoenixClient.joinChannel(topic, params);
export const leaveChannel = (topic: string): void => phoenixClient.leaveChannel(topic);
export const sendMessage = (topic: string, event: string, payload?: any): Promise<any> =>
  phoenixClient.sendMessage(topic, event, payload);
export const onMessage = (topic: string, event: string, callback: Function): void =>
  phoenixClient.onMessage(topic, event, callback);
export const offMessage = (topic: string, event: string, callback: Function): void =>
  phoenixClient.offMessage(topic, event, callback);
export const setPhoenixWebSocketUrl = (url: string): void => phoenixClient.setWebSocketUrl(url);
export const setPhoenixAuthParams = (params: any): void => phoenixClient.setAuthParams(params);
export const setPhoenixLongPollSupport = (enabled: boolean): void =>
  phoenixClient.setLongPollSupport(enabled);
export const disablePhoenixLongPollFallback = (): void => phoenixClient.disableLongPollFallback();
export const clearPhoenixConfig = (): void => phoenixClient.clearConfig();
export const getPhoenixConnectionStatus = (): any => phoenixClient.getConnectionStatus();
export const canConnect = (): boolean => phoenixClient.canConnect();

export const debugPhoenixConnection = (): any => {
  const status = phoenixClient.getConnectionStatus();
  console.log('🔍 Phoenix Connection Status:', status);
  return status;
};

export default phoenixClient;
