/* eslint-disable no-useless-catch */
import type { Socket } from 'phoenix';
import { PhoenixConnectionManager } from './core/connection';
import { PhoenixChannelManager } from './core/channels';
import { phoenixEventManager } from './core/events';
import { phoenixStorage } from './core/storage';
import type { PhoenixEnv, ConnectionParams, PhoenixConfig } from './types';
import type { PhoenixEventType } from './core/events';
import type { ConnectionState } from './core/connection';

type SocketType = InstanceType<typeof Socket>;

// Resource stats types
interface ChannelResourceStats {
  channels: number;
  maxChannels: number;
  totalListeners: number;
  maxListenersPerEvent: number;
}

interface EventResourceStats {
  totalListeners: number;
  maxListenersPerEvent: number;
  eventsWithListeners: number;
}

interface ResourceStats {
  connection: ConnectionState;
  channels: ChannelResourceStats;
  events: EventResourceStats;
  totalResources: number;
  warnings: string[];
}

// Connection status type
interface ChannelStateInfo {
  topic: string;
  status: string;
  error?: Error;
  lastJoined?: Date;
  lastLeft?: Date;
  messageCount: number;
}

interface ConnectionInfo {
  lastConnected?: Date;
  lastDisconnected?: Date;
  reconnectAttempts: number;
  error?: string;
}

interface ConnectionStatus {
  connectionState: string;
  isConnected: boolean;
  canConnect: boolean;
  channelCount: number;
  config: PhoenixConfig;
  channels: ChannelStateInfo[];
  connectionInfo: ConnectionInfo;
}

/**
 * Optimized Phoenix WebSocket Client
 * - Modular architecture with separated concerns
 * - Single connection management
 * - Built-in Phoenix reconnection
 * - Efficient state management
 * - Memory leak prevention
 */
export class PhoenixClient {
  private connectionManager: PhoenixConnectionManager;
  private channelManager: PhoenixChannelManager;
  private env: PhoenixEnv;
  private config: PhoenixConfig;

  constructor(env: PhoenixEnv = {}) {
    this.env = env;
    this.config = {
      url: null,
      authParams: null,
      useLongPoll: false,
      disableLongPollFallback: false,
    };

    // Initialize managers
    this.connectionManager = new PhoenixConnectionManager({
      env: this.env,
      config: this.config,
      onStateChange: this.handleConnectionStateChange.bind(this),
    });

    this.channelManager = new PhoenixChannelManager(null);

    // Load stored configuration
    this.loadStoredConfig();

    // Setup global error handler
    this.setupGlobalErrorHandler();
  }

  // Configuration methods
  setWebSocketUrl(url: string): void {
    this.connectionManager.updateConfig({ url });
  }

  setAuthParams(authParams: Record<string, string | number | boolean> | null): void {
    this.connectionManager.updateConfig({
      authParams: authParams ? { ...authParams } : null,
    });
  }

  setLongPollSupport(enabled: boolean): void {
    this.connectionManager.updateConfig({
      useLongPoll: Boolean(enabled),
    });
  }

  disableLongPollFallback(): void {
    this.connectionManager.updateConfig({
      disableLongPollFallback: true,
    });
  }

  clearConfig(): void {
    // Clear the config from storage
    phoenixStorage.clearConfig();

    // Update the connection manager with default values
    this.connectionManager.updateConfig({
      url: null,
      authParams: null,
      useLongPoll: false,
      disableLongPollFallback: false,
    });
  }

  /**
   * Set environment configuration
   * @param env - Environment configuration
   */
  setEnvironment(env: PhoenixEnv): void {
    this.env = { ...this.env, ...env };
    // Update connection manager with new env
    this.connectionManager = new PhoenixConnectionManager({
      env: this.env,
      config: this.connectionManager.getConfig(),
      onStateChange: this.handleConnectionStateChange.bind(this),
    });
  }

  /**
   * Get comprehensive resource usage statistics
   */
  getResourceStats(): ResourceStats {
    const channelStats = this.channelManager.getResourceStats();
    const eventStats = phoenixEventManager.getResourceStats();

    const warnings: string[] = [];
    let totalResources = 0;

    // Check channel usage
    if (channelStats.channels >= channelStats.maxChannels * 0.8) {
      warnings.push(`High channel usage: ${channelStats.channels}/${channelStats.maxChannels}`);
    }
    totalResources += channelStats.channels;

    // Check listener usage
    if (channelStats.totalListeners >= channelStats.maxListenersPerEvent * 10) {
      warnings.push(`High channel listeners: ${channelStats.totalListeners}`);
    }
    totalResources += channelStats.totalListeners;

    // Check event listeners
    if (eventStats.totalListeners >= eventStats.maxListenersPerEvent * 5) {
      warnings.push(`High event listeners: ${eventStats.totalListeners}`);
    }
    totalResources += eventStats.totalListeners;

    return {
      connection: this.connectionManager.getState(),
      channels: channelStats,
      events: eventStats,
      totalResources,
      warnings,
    };
  }

  // Connection management
  async connect(options: ConnectionParams = {}): Promise<SocketType | null> {
    try {
      const socket = await this.connectionManager.connect(options);

      // Update channel manager with new socket
      this.channelManager.setSocket(socket);

      return socket;
    } catch (error) {
      throw error;
    }
  }

  disconnect(): void {
    // Clean up channels first
    this.channelManager.cleanup();

    // Disconnect socket
    this.connectionManager.disconnect('Client disconnect');
  }

  resetConnection(): void {
    this.disconnect();
    this.connectionManager.reset();
    phoenixStorage.clearAll();
  }

  forceReconnect(): void {
    this.connectionManager.forceReconnect();
  }

  // Channel management
  async joinChannel(
    topic: string,
    params: Record<string, string | number | boolean> = {}
  ): Promise<any> {
    return await this.channelManager.joinChannel(topic, { params });
  }

  leaveChannel(topic: string): void {
    this.channelManager.leaveChannel(topic);
  }

  async sendMessage(
    topic: string,
    event: string,
    payload: Record<string, unknown> = {}
  ): Promise<any> {
    return await this.channelManager.sendMessage(topic, event, payload);
  }

  onMessage(topic: string, event: string, callback: Function): void {
    this.channelManager.onMessage(topic, event, callback);
  }

  offMessage(topic: string, event: string, callback: Function): void {
    this.channelManager.offMessage(topic, event, callback);
  }

  // State & Events
  getConnectionState(): string {
    return this.connectionManager.getState().status;
  }

  isConnected(): boolean {
    return this.connectionManager.isConnected();
  }

  canConnect(): boolean {
    return this.connectionManager.canConnect();
  }

  getConnectionStatus(): ConnectionStatus {
    const connectionState = this.connectionManager.getState();
    const channelStates = this.channelManager.getAllChannelStates();

    return {
      connectionState: connectionState.status,
      isConnected: this.isConnected(),
      canConnect: this.canConnect(),
      channelCount: this.channelManager.getChannelCount(),
      config: this.connectionManager.getConfig(),
      channels: Array.from(channelStates.entries()).map(([_topic, state]) => ({
        ...state,
      })),
      connectionInfo: {
        lastConnected: connectionState.lastConnected,
        lastDisconnected: connectionState.lastDisconnected,
        reconnectAttempts: connectionState.reconnectAttempts,
        error: connectionState.error?.message,
      },
    };
  }

  addEventListener(event: PhoenixEventType, handler: Function): void {
    phoenixEventManager.on(event, handler);
  }

  removeEventListener(event: PhoenixEventType, handler: Function): void {
    phoenixEventManager.off(event, handler);
  }

  // Private methods
  private handleConnectionStateChange(state: ConnectionState): void {
    // Update channel manager socket when connection state changes
    if (state.status === 'connected') {
      // Get socket from connection manager (would need to expose this)
      // this.channelManager.setSocket(socket);
    }
  }

  private loadStoredConfig(): void {
    const storedConfig = phoenixStorage.loadConfig();
    if (storedConfig) {
      this.config = { ...this.config, ...storedConfig };
    }
  }

  private setupGlobalErrorHandler(): void {
    if (typeof window !== 'undefined' && !(window as any).__phoenixErrorHandlerSetup) {
      (window as any).__phoenixErrorHandlerSetup = true;

      // eslint-disable-next-line no-console
      const originalConsoleError = console.error;
      // eslint-disable-next-line no-console
      console.error = (...args: unknown[]) => {
        const errorString = args.join(' ');
        if (errorString.includes('unhandled poll status undefined')) {
          // eslint-disable-next-line no-console
          console.warn('[PhoenixClient] Caught global poll status error, attempting recovery...');
          this.connectionManager.forceReconnect();
          return;
        }
        originalConsoleError.apply(console, args);
      };

      window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
        const error = event.reason;
        if (
          error &&
          error.message &&
          typeof error.message === 'string' &&
          error.message.includes('unhandled poll status')
        ) {
          // eslint-disable-next-line no-console
          console.warn('[PhoenixClient] Caught unhandled promise rejection for poll status error');
          this.connectionManager.forceReconnect();
          event.preventDefault();
        }
      });
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
export const connectPhoenix = async (options?: ConnectionParams): Promise<SocketType | null> =>
  await phoenixClient.connect(options);
export const disconnectPhoenix = (): void => phoenixClient.disconnect();
export const resetPhoenixConnection = (): void => phoenixClient.resetConnection();
export const forcePhoenixReconnect = (): void => phoenixClient.forceReconnect();
export const joinChannel = (
  topic: string,
  params?: Record<string, string | number | boolean>
): Promise<any> => phoenixClient.joinChannel(topic, params);
export const leaveChannel = (topic: string): void => phoenixClient.leaveChannel(topic);
export const sendMessage = (
  topic: string,
  event: string,
  payload?: Record<string, unknown>
): Promise<any> => phoenixClient.sendMessage(topic, event, payload);
export const onMessage = (topic: string, event: string, callback: Function): void =>
  phoenixClient.onMessage(topic, event, callback);
export const offMessage = (topic: string, event: string, callback: Function): void =>
  phoenixClient.offMessage(topic, event, callback);
export const setPhoenixWebSocketUrl = (url: string): void => phoenixClient.setWebSocketUrl(url);
export const setPhoenixAuthParams = (
  params: Record<string, string | number | boolean> | null
): void => phoenixClient.setAuthParams(params);
export const setPhoenixLongPollSupport = (enabled: boolean): void =>
  phoenixClient.setLongPollSupport(enabled);
export const disablePhoenixLongPollFallback = (): void => phoenixClient.disableLongPollFallback();
export const clearPhoenixConfig = (): void => phoenixClient.clearConfig();
export const getPhoenixConnectionStatus = (): ConnectionStatus =>
  phoenixClient.getConnectionStatus();
export const getPhoenixResourceStats = (): ResourceStats => phoenixClient.getResourceStats();
export const canConnect = (): boolean => phoenixClient.canConnect();

export const debugPhoenixConnection = (): ConnectionStatus => {
  const status = phoenixClient.getConnectionStatus();
  // eslint-disable-next-line no-console
  console.log('🔍 Phoenix Connection Status:', status);
  return status;
};

export const debugPhoenixResources = (): ResourceStats => {
  const stats = phoenixClient.getResourceStats();
  // eslint-disable-next-line no-console
  console.log('📊 Phoenix Resource Usage:', stats);

  if (stats.warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.warn('⚠️ Resource Warnings:', stats.warnings);
  }

  return stats;
};

export default phoenixClient;
