import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import phoenixClient, { PHOENIX_EVENTS } from '.';
import type { UsePhoenixOptions, UsePhoenixReturn } from './types';

/**
 * Optimized React hook for Phoenix WebSocket connections
 * @param options - Configuration options
 * @param options.endpoint - Custom WebSocket endpoint
 * @param options.autoConnect - Auto-connect on mount (default: true)
 * @param options.params - Additional connection parameters
 * @param options.useLongPoll - Use long poll transport (default: false)
 * @returns Phoenix connection utilities
 */
export const usePhoenix = (options: UsePhoenixOptions = {}): UsePhoenixReturn => {
  const { endpoint, autoConnect = true, params, useLongPoll = false } = options;

  // State management
  const [connectionState, setConnectionState] = useState<string>(() =>
    phoenixClient.getConnectionState()
  );
  const [error, setError] = useState<any>(null);

  // Refs for stable callbacks
  const optionsRef = useRef<UsePhoenixOptions>({ endpoint, params });
  const hasInitializedRef = useRef<boolean>(false);

  // Update options ref when they change
  useEffect(() => {
    optionsRef.current = { endpoint, params };
  }, [endpoint, params]);

  // Stable event handlers
  const handleConnect = useCallback((): void => {
    setConnectionState('connected');
    setError(null);
  }, []);

  const handleDisconnect = useCallback((): void => {
    const clientState = phoenixClient.getConnectionState();
    setConnectionState(clientState);
  }, []);

  const handleError = useCallback((errorData: any): void => {
    setError(errorData);
    setConnectionState('error');
  }, []);

  const handleReconnect = useCallback((): void => {
    setConnectionState('connected');
    setError(null);
  }, []);

  // Connection management functions
  const connect = useCallback(async (connectOptions: UsePhoenixOptions = {}): Promise<void> => {
    if (!phoenixClient.canConnect()) {
      return;
    }

    try {
      setConnectionState('connecting');
      setError(null);

      const connectionOptions: UsePhoenixOptions = {
        ...optionsRef.current,
        ...connectOptions,
      };

      await phoenixClient.connect(connectionOptions);
    } catch (err) {
      setError(err);
      setConnectionState('error');
    }
  }, []);

  const disconnect = useCallback((): void => {
    phoenixClient.disconnect();
    setConnectionState('disconnected');
  }, []);

  const resetConnection = useCallback((): void => {
    phoenixClient.resetConnection();
    setConnectionState('disconnected');
    setError(null);
  }, []);

  // Configuration functions
  const setWebSocketUrl = useCallback((url: string): void => {
    phoenixClient.setWebSocketUrl(url);
  }, []);

  const setAuthParams = useCallback((authParams: any): void => {
    phoenixClient.setAuthParams(authParams);
  }, []);

  const clearConfig = useCallback((): void => {
    phoenixClient.clearConfig();
  }, []);

  // Setup event listeners
  useEffect(() => {
    // Add event listeners
    phoenixClient.addEventListener(PHOENIX_EVENTS.CONNECT, handleConnect);
    phoenixClient.addEventListener(PHOENIX_EVENTS.DISCONNECT, handleDisconnect);
    phoenixClient.addEventListener(PHOENIX_EVENTS.ERROR, handleError);
    phoenixClient.addEventListener(PHOENIX_EVENTS.RECONNECT, handleReconnect);

    // Sync initial state
    const currentState = phoenixClient.getConnectionState();
    if (currentState !== connectionState) {
      setConnectionState(currentState);
    }

    // Cleanup
    return () => {
      phoenixClient.removeEventListener(PHOENIX_EVENTS.CONNECT, handleConnect);
      phoenixClient.removeEventListener(PHOENIX_EVENTS.DISCONNECT, handleDisconnect);
      phoenixClient.removeEventListener(PHOENIX_EVENTS.ERROR, handleError);
      phoenixClient.removeEventListener(PHOENIX_EVENTS.RECONNECT, handleReconnect);
    };
  }, [handleConnect, handleDisconnect, handleError, handleReconnect, connectionState]);

  // Handle long poll setting
  useEffect(() => {
    phoenixClient.setLongPollSupport(useLongPoll);
  }, [useLongPoll]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect && !hasInitializedRef.current) {
      hasInitializedRef.current = true;

      if (phoenixClient.canConnect()) {
        phoenixClient.connect(optionsRef.current);
      }
    }
  }, [autoConnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoConnect) {
        disconnect();
      }
    };
  }, [autoConnect, disconnect]);

  // Memoized return value to prevent unnecessary re-renders
  return useMemo<UsePhoenixReturn>(
    () => ({
      // State
      connectionState,
      error,

      // Computed states
      isConnected: connectionState === 'connected',
      isConnecting: connectionState === 'connecting',
      isReconnecting: connectionState === 'reconnecting',
      canConnect: connectionState === 'disconnected' || connectionState === 'error',

      // Functions
      connect,
      disconnect,
      resetConnection,

      // Configuration
      setWebSocketUrl,
      setAuthParams,
      clearConfig,

      // Direct client access for advanced usage
      client: phoenixClient,
    }),
    [
      connectionState,
      error,
      connect,
      disconnect,
      resetConnection,
      setWebSocketUrl,
      setAuthParams,
      clearConfig,
    ]
  );
};

export default usePhoenix;
