// TypeScript interfaces for Phoenix client and hooks

export interface PhoenixEnv {
  EDGE_URL?: string;
  SOCKET_EDGE_URL?: string;
  API_KEY?: string;
  AUTH_TOKEN?: string;
  [key: string]: string | undefined;
}

export interface ConnectionParams {
  endpoint?: string;
  params?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface PhoenixConfig {
  url: string | null;
  authParams: Record<string, string | number | boolean> | null;
  useLongPoll: boolean;
  disableLongPollFallback: boolean;
}

export interface UsePhoenixOptions {
  endpoint?: string;
  autoConnect?: boolean;
  params?: Record<string, string | number | boolean>;
  useLongPoll?: boolean;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface UsePhoenixReturn {
  // State
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  error: Error | null;

  // Computed states
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  canConnect: boolean;

  // Functions
  connect: (options?: UsePhoenixOptions) => Promise<void>;
  disconnect: () => void;
  resetConnection: () => void;

  // Configuration
  setWebSocketUrl: (url: string) => void;
  setAuthParams: (authParams: Record<string, string | number | boolean>) => void;
  clearConfig: () => void;

  // Direct client access for advanced usage
  client: PhoenixClient;
}

export interface UsePhoenixChannelOptions {
  params?: Record<string, string | number | boolean>;
  autoJoin?: boolean;
  onJoin?: (response: ChannelJoinResponse) => void;
  onLeave?: (response: ChannelLeaveResponse) => void;
  onError?: (error: Error) => void;
}

export interface UsePhoenixChannelReturn {
  channelState: 'disconnected' | 'joining' | 'joined' | 'error';
  channel: PhoenixChannel | null;
  error: Error | null;
  isJoined: boolean;
  isJoining: boolean;
  canJoin: boolean;
  join: (joinParams?: Record<string, string | number | boolean>) => Promise<ChannelJoinResponse>;
  leave: () => void;
  sendMessage: (event: string, payload?: Record<string, unknown>) => Promise<MessageResponse>;
  onMessage: (event: string, callback: MessageCallback) => void;
  offMessage: (event: string, callback: MessageCallback) => void;
}

// Phoenix-specific types
export interface ChannelJoinResponse {
  status: 'ok';
  response?: Record<string, unknown>;
}

export interface ChannelLeaveResponse {
  status: 'ok';
  response?: Record<string, unknown>;
}

export interface MessageResponse {
  status: 'ok';
  response?: Record<string, unknown>;
}

export type MessageCallback = (payload: Record<string, unknown>) => void;

// Phoenix channel type
export interface PhoenixChannel {
  state: 'closed' | 'errored' | 'joined' | 'joining' | 'leaving';
  join(): PhoenixChannel;
  leave(): void;
  on(event: string, callback: MessageCallback): void;
  off(event: string, callback?: MessageCallback): void;
  push(event: string, payload?: Record<string, unknown>): PhoenixChannel;
  receive(status: string, callback: (response?: any) => void): PhoenixChannel;
  onError(callback: (error: any) => void): void;
  onClose(callback: () => void): void;
}

// Phoenix client class forward declaration
export declare class PhoenixClient {
  constructor(env?: PhoenixEnv);
  connect(options?: ConnectionParams): Promise<SocketType | null>;
  disconnect(): void;
  resetConnection(): void;
  forceReconnect(): void;
  joinChannel(topic: string, params?: any): Promise<any>;
  leaveChannel(topic: string): void;
  sendMessage(topic: string, event: string, payload?: any): Promise<any>;
  onMessage(topic: string, event: string, callback: Function): void;
  offMessage(topic: string, event: string, callback: Function): void;
  getConnectionState(): string;
  isConnected(): boolean;
  canConnect(): boolean;
  getConnectionStatus(): any;
  addEventListener(event: string, handler: Function): void;
  removeEventListener(event: string, handler: Function): void;
  setWebSocketUrl(url: string): void;
  setAuthParams(authParams: any): void;
  setLongPollSupport(enabled: boolean): void;
  disableLongPollFallback(): void;
  clearConfig(): void;
  setEnvironment(env: PhoenixEnv): void;
}

// Socket type from Phoenix
export type SocketType = InstanceType<typeof import('phoenix').Socket>;

// Extend Window interface for custom properties
declare global {
  interface Window {
    __phoenixErrorHandlerSetup?: boolean;
  }
}
