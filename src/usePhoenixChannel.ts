import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import phoenixClient from './phoenix-client';
import { usePhoenix } from './usePhoenix';
import type { UsePhoenixChannelOptions, UsePhoenixChannelReturn, PhoenixChannel } from './types';

/**
 * Optimized React hook for Phoenix channel management
 * @param topic - Channel topic
 * @param options - Channel options
 * @returns Channel utilities
 */
export const usePhoenixChannel = (
  topic: string,
  options: UsePhoenixChannelOptions = {}
): UsePhoenixChannelReturn => {
  const { params = {}, autoJoin = true, onJoin, onLeave, onError } = options;

  // State management with better typing
  const [channelState, setChannelState] =
    useState<UsePhoenixChannelReturn['channelState']>('disconnected');
  const [channelError, setChannelError] = useState<Error | null>(null);

  // Refs for stability and optimization
  const channelRef = useRef<PhoenixChannel | null>(null);
  const callbacksRef = useRef<{
    onJoin?: (response: any) => void;
    onLeave?: (response: any) => void;
    onError?: (error: Error) => void;
  }>({
    onJoin,
    onLeave,
    onError,
  });
  const hasJoinedRef = useRef<boolean>(false);
  const topicRef = useRef<string>(topic);

  // Update callbacks ref only when actually different
  useEffect(() => {
    const newCallbacks = { onJoin, onLeave, onError };
    const currentCallbacks = callbacksRef.current;

    // Shallow compare functions (reference equality)
    if (
      currentCallbacks.onJoin !== newCallbacks.onJoin ||
      currentCallbacks.onLeave !== newCallbacks.onLeave ||
      currentCallbacks.onError !== newCallbacks.onError
    ) {
      callbacksRef.current = newCallbacks;
    }
  }, [onJoin, onLeave, onError]);

  // Update topic ref
  useEffect(() => {
    topicRef.current = topic;
  }, [topic]);

  // Use Phoenix connection
  const { isConnected } = usePhoenix({
    autoConnect: true,
    params,
  });

  // Use ref to track connection state to prevent unnecessary re-renders
  const isConnectedRef = useRef(isConnected);
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  // Join channel function with better error handling
  const joinChannel = useCallback(
    async (joinParams: Record<string, string | number | boolean> = {}): Promise<any> => {
      if (!isConnectedRef.current) {
        const error = new Error('Phoenix client not connected');
        setChannelError(error);
        console.warn('[usePhoenixChannel] Cannot join channel: client not connected');
        return null;
      }

      // Check if already joining/joined with current topic
      if (
        channelRef.current &&
        channelRef.current.state === 'joined' &&
        topicRef.current === topic
      ) {
        return channelRef.current;
      }

      try {
        setChannelState('joining');
        setChannelError(null);

        // Join channel through phoenixClient
        const channel = await phoenixClient.joinChannel(topic, { ...params, ...joinParams });
        channelRef.current = channel;

        // Setup channel event handlers once
        if (!channel._channelHookHandlers) {
          channel.onError((error: Error) => {
            setChannelError(error);
            setChannelState('error');
            callbacksRef.current.onError?.(error);
          });

          channel.onClose(() => {
            setChannelState('disconnected');
            channelRef.current = null;
            hasJoinedRef.current = false;
            callbacksRef.current.onLeave?.({});
          });

          // Mark handlers as set to avoid duplicate setup
          (channel as any)._channelHookHandlers = true;
        }

        // Update state and callbacks
        setChannelState('joined');
        hasJoinedRef.current = true;
        callbacksRef.current.onJoin?.({ status: 'ok' });

        return channel;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        setChannelError(err);
        setChannelState('error');
        callbacksRef.current.onError?.(err);
        console.error('[usePhoenixChannel] Failed to join channel:', err);
        return null;
      }
    },
    [topic, params] // Removed isConnected to prevent unnecessary re-creations
  );

  // Leave channel function with better cleanup
  const leaveChannel = useCallback(() => {
    if (channelRef.current) {
      try {
        phoenixClient.leaveChannel(topic);
      } catch (error) {
        console.warn('[usePhoenixChannel] Error leaving channel:', error);
      }

      channelRef.current = null;
      hasJoinedRef.current = false;
      setChannelState('disconnected');
      setChannelError(null);
      callbacksRef.current.onLeave?.({ status: 'ok' });
    }
  }, [topic]);

  // Send message function with validation
  const sendMessage = useCallback(
    async (event: string, payload?: Record<string, unknown>) => {
      if (channelState !== 'joined') {
        throw new Error('Channel not joined');
      }

      if (!event || typeof event !== 'string') {
        throw new Error('Invalid event name');
      }

      return await phoenixClient.sendMessage(topic, event, payload);
    },
    [topic, channelState]
  );

  // Message listener functions with validation
  const onMessage = useCallback(
    (event: string, callback: Function) => {
      if (!channelRef.current) {
        console.warn('[usePhoenixChannel] Channel not joined, deferring message listener');
        return;
      }

      if (!event || typeof event !== 'string') {
        console.warn('[usePhoenixChannel] Invalid event name for message listener');
        return;
      }

      if (!callback || typeof callback !== 'function') {
        console.warn('[usePhoenixChannel] Invalid callback for message listener');
        return;
      }

      phoenixClient.onMessage(topic, event, callback);
    },
    [topic]
  );

  const offMessage = useCallback(
    (event: string, callback: Function) => {
      if (!event || typeof event !== 'string') {
        console.warn('[usePhoenixChannel] Invalid event name for message listener removal');
        return;
      }

      phoenixClient.offMessage(topic, event, callback);
    },
    [topic]
  );

  // Auto-join when connected (optimized to prevent infinite loops)
  useEffect(() => {
    if (autoJoin && isConnected && !hasJoinedRef.current && topicRef.current === topic) {
      // Use a small delay to prevent immediate re-triggering
      const timeoutId = setTimeout(() => {
        if (!hasJoinedRef.current) {
          joinChannel();
        }
      }, 0);

      return () => clearTimeout(timeoutId);
    }
  }, [autoJoin, isConnected, topic]); // Removed joinChannel from deps to prevent loops

  // Cleanup on unmount or topic change
  useEffect(() => {
    return () => {
      if (hasJoinedRef.current && topicRef.current === topic) {
        leaveChannel();
      }
    };
  }, [topic]); // Simplified deps to prevent unnecessary re-runs

  // Handle topic changes - leave old channel and prepare for new one
  useEffect(() => {
    if (hasJoinedRef.current && topicRef.current !== topic) {
      // Leave the old channel
      leaveChannel();
      hasJoinedRef.current = false;

      // Don't auto-join immediately to prevent resource exhaustion
      // Let the auto-join effect handle it on next render
    }
  }, [topic]); // Simplified deps

  // Computed states with memoization
  const computedStates = useMemo(
    () => ({
      isJoined: channelState === 'joined',
      isJoining: channelState === 'joining',
      canJoin: channelState === 'disconnected' || channelState === 'error',
    }),
    [channelState]
  );

  // Memoized return value to prevent unnecessary re-renders
  return useMemo<UsePhoenixChannelReturn>(
    () => ({
      // State
      channelState,
      error: channelError,
      channel: channelRef.current,

      // Computed states
      ...computedStates,
      isConnected: computedStates.isJoined, // Alias for backward compatibility

      // Functions
      join: joinChannel,
      leave: leaveChannel,
      sendMessage,
      onMessage,
      offMessage,
    }),
    [
      channelState,
      channelError,
      computedStates.isJoined,
      computedStates.isJoining,
      computedStates.canJoin,
      joinChannel,
      leaveChannel,
      sendMessage,
      onMessage,
      offMessage,
    ]
  );
};

export default usePhoenixChannel;
