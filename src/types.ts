// TypeScript interfaces for Phoenix client and hooks

export interface PhoenixEnv {
  EDGE_URL?: string;
  SOCKET_EDGE_URL?: string;
  [key: string]: any;
}

export interface ConnectionParams {
  endpoint?: string;
  params?: Record<string, any>;
  [key: string]: any;
}

export interface PhoenixConfig {
  url: string | null;
  authParams: Record<string, any> | null;
  useLongPoll: boolean;
  disableLongPollFallback: boolean;
}

export interface UsePhoenixOptions {
  endpoint?: string;
  autoConnect?: boolean;
  params?: Record<string, any>;
  useLongPoll?: boolean;
}

export interface UsePhoenixReturn {
  // State
  connectionState: string;
  error: any;

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
  setAuthParams: (authParams: any) => void;
  clearConfig: () => void;

  // Direct client access for advanced usage
  client: any;
}

export interface UsePhoenixChannelOptions {
  params?: Record<string, any>;
  autoJoin?: boolean;
  onJoin?: (response: any) => void;
  onLeave?: (response: any) => void;
  onError?: (error: any) => void;
}

export interface UsePhoenixChannelReturn {
  channelState: string;
  channel: any;
  error: any;
  isJoined: boolean;
  isJoining: boolean;
  canJoin: boolean;
  join: (joinParams?: Record<string, any>) => Promise<any>;
  leave: () => void;
  sendMessage: (event: string, payload?: any) => Promise<any>;
  onMessage: (event: string, callback: Function) => void;
  offMessage: (event: string, callback: Function) => void;
}

// Extend Window interface for custom properties
declare global {
  interface Window {
    __phoenixErrorHandlerSetup?: boolean;
  }
}
