import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import phoenixClient from './phoenix-client';
import { PHOENIX_EVENTS } from './core/events';
import type { UsePhoenixOptions, UsePhoenixReturn, PhoenixClient } from './types';

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

  // State management with better typing
  const [connectionState, setConnectionState] = useState<UsePhoenixReturn['connectionState']>(
    () => phoenixClient.getConnectionState() as UsePhoenixReturn['connectionState']
  );
  const [error, setError] = useState<Error | null>(null);

  // Refs for stable callbacks and optimization
  const optionsRef = useRef<UsePhoenixOptions>({ endpoint, params });
  const hasInitializedRef = useRef<boolean>(false);
  const eventHandlersRef = useRef<{
    connect: () => void;
    disconnect: () => void;
    error: (errorData: Error) => void;
    reconnect: () => void;
  } | null>(null);

  // Update options ref when they change (only when actually different)
  useEffect(() => {
    const newOptions = { endpoint, params };
    const currentOptions = optionsRef.current;

    // Deep compare to avoid unnecessary updates
    if (
      currentOptions.endpoint !== newOptions.endpoint ||
      JSON.stringify(currentOptions.params) !== JSON.stringify(newOptions.params)
    ) {
      optionsRef.current = newOptions;
    }
  }, [endpoint, params]);

  // Create stable event handlers once
  if (!eventHandlersRef.current) {
    eventHandlersRef.current = {
      connect: () => {
        setConnectionState('connected');
        setError(null);
      },
      disconnect: () => {
        const clientState = phoenixClient.getConnectionState();
        setConnectionState(clientState as UsePhoenixReturn['connectionState']);
      },
      error: (errorData: Error) => {
        setError(errorData);
        setConnectionState('error');
      },
      reconnect: () => {
        setConnectionState('connected');
        setError(null);
      },
    };
  }

  const {
    connect: handleConnect,
    disconnect: handleDisconnect,
    error: handleError,
    reconnect: handleReconnect,
  } = eventHandlersRef.current;

  // Connection management functions
  const connect = useCallback(async (connectOptions: UsePhoenixOptions = {}): Promise<void> => {
    if (!phoenixClient.canConnect()) {
      console.warn('[usePhoenix] Cannot connect: client is not in a connectable state');
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
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setConnectionState('error');
      console.error('[usePhoenix] Connection failed:', error);
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

  // Configuration functions with better type safety
  const setWebSocketUrl = useCallback((url: string): void => {
    if (!url || typeof url !== 'string') {
      console.warn('[usePhoenix] Invalid WebSocket URL provided');
      return;
    }
    phoenixClient.setWebSocketUrl(url);
  }, []);

  const setAuthParams = useCallback(
    (authParams: Record<string, string | number | boolean>): void => {
      if (authParams && typeof authParams === 'object') {
        phoenixClient.setAuthParams(authParams);
      } else {
        console.warn('[usePhoenix] Invalid auth params provided');
      }
    },
    []
  );

  const clearConfig = useCallback((): void => {
    phoenixClient.clearConfig();
  }, []);

  // Setup event listeners once
  useEffect(() => {
    // Add event listeners with stable handlers
    phoenixClient.addEventListener(PHOENIX_EVENTS.CONNECT, handleConnect);
    phoenixClient.addEventListener(PHOENIX_EVENTS.DISCONNECT, handleDisconnect);
    phoenixClient.addEventListener(PHOENIX_EVENTS.ERROR, handleError);
    phoenixClient.addEventListener(PHOENIX_EVENTS.RECONNECT, handleReconnect);

    // Sync initial state only once
    if (!hasInitializedRef.current) {
      const currentState = phoenixClient.getConnectionState();
      if (currentState !== connectionState) {
        setConnectionState(currentState as UsePhoenixReturn['connectionState']);
      }
    }

    // Cleanup function
    return () => {
      phoenixClient.removeEventListener(PHOENIX_EVENTS.CONNECT, handleConnect);
      phoenixClient.removeEventListener(PHOENIX_EVENTS.DISCONNECT, handleDisconnect);
      phoenixClient.removeEventListener(PHOENIX_EVENTS.ERROR, handleError);
      phoenixClient.removeEventListener(PHOENIX_EVENTS.RECONNECT, handleReconnect);
    };
  }, []); // Empty dependency array - handlers are stable

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

  // Computed states with memoization
  const computedStates = useMemo(
    () => ({
      isConnected: connectionState === 'connected',
      isConnecting: connectionState === 'connecting',
      isReconnecting: connectionState === 'reconnecting',
      canConnect: connectionState === 'disconnected' || connectionState === 'error',
    }),
    [connectionState]
  );

  // Memoized return value to prevent unnecessary re-renders
  return useMemo<UsePhoenixReturn>(
    () => ({
      // State
      connectionState,
      error,

      // Computed states
      ...computedStates,

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
      computedStates.isConnected,
      computedStates.isConnecting,
      computedStates.isReconnecting,
      computedStates.canConnect,
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
