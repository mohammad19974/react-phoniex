import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import phoenixClient from '.';
import { usePhoenix } from './usePhoenix';
import type { UsePhoenixChannelOptions, UsePhoenixChannelReturn } from './types';

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

  // State management
  const [channelState, setChannelState] = useState<string>('disconnected');
  const [channelError, setChannelError] = useState<any>(null);

  // Refs for stability
  const channelRef = useRef<any>(null);
  const callbacksRef = useRef<{ onJoin?: Function; onLeave?: Function; onError?: Function }>({
    onJoin,
    onLeave,
    onError,
  });
  const hasJoinedRef = useRef<boolean>(false);

  // Update callbacks ref
  useEffect(() => {
    callbacksRef.current = { onJoin, onLeave, onError };
  }, [onJoin, onLeave, onError]);

  // Use Phoenix connection
  const { isConnected } = usePhoenix({
    autoConnect: true,
    params,
  });

  // Join channel function
  const joinChannel = useCallback(
    async (joinParams: Record<string, any> = {}): Promise<any> => {
      if (!isConnected) {
        setChannelError(new Error('Phoenix client not connected'));
        return null;
      }

      // Check if already joining/joined
      if (channelRef.current && channelRef.current.state === 'joined') {
        return channelRef.current;
      }

      try {
        setChannelState('joining');
        setChannelError(null);

        // Join channel through phoenixClient
        const channel = phoenixClient.joinChannel(topic, { ...params, ...joinParams });
        channelRef.current = channel;

        // Setup channel event handlers
        if (!channel._channelHookHandlers) {
          channel.onError(error => {
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

          // Mark handlers as set
          channel._channelHookHandlers = true;
        }

        // Wait for join confirmation
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Channel join timeout'));
          }, 10000);

          // Check if already joined
          if (channel.state === 'joined') {
            clearTimeout(timeout);
            resolve(channel);
            return;
          }

          // Setup one-time join handlers
          const handleJoin = (response: any) => {
            clearTimeout(timeout);
            setChannelState('connected');
            hasJoinedRef.current = true;
            callbacksRef.current.onJoin?.(response);
            resolve(channel);
          };

          const handleError = (error: any) => {
            clearTimeout(timeout);
            setChannelError(error);
            setChannelState('error');
            callbacksRef.current.onError?.(error);
            reject(error);
          };

          // Phoenix handles the actual join internally when we called joinChannel
          // We just need to check the state
          const checkState = setInterval(() => {
            if (channel.state === 'joined') {
              clearInterval(checkState);
              handleJoin({});
            } else if (channel.state === 'errored') {
              clearInterval(checkState);
              handleError(new Error('Channel join failed'));
            }
          }, 100);

          // Cleanup on timeout
          setTimeout(() => {
            clearInterval(checkState);
          }, 10000);
        });

        return channel;
      } catch (error) {
        setChannelError(error);
        setChannelState('error');
        return null;
      }
    },
    [topic, params, isConnected]
  );

  // Leave channel function
  const leaveChannel = useCallback(() => {
    if (channelRef.current) {
      phoenixClient.leaveChannel(topic);
      channelRef.current = null;
      hasJoinedRef.current = false;
      setChannelState('disconnected');
      setChannelError(null);
    }
  }, [topic]);

  // Send message function
  const sendMessage = useCallback(
    (event, payload) => {
      if (channelState !== 'connected') {
        throw new Error('Channel not connected');
      }
      return phoenixClient.sendMessage(topic, event, payload);
    },
    [topic, channelState]
  );

  // Message listener functions
  const onMessage = useCallback(
    (event, callback) => {
      if (!channelRef.current) {
        console.warn('Channel not joined, deferring message listener');
        return;
      }
      phoenixClient.onMessage(topic, event, callback);
    },
    [topic]
  );

  const offMessage = useCallback(
    (event, callback) => {
      phoenixClient.offMessage(topic, event, callback);
    },
    [topic]
  );

  // Auto-join when connected
  useEffect(() => {
    if (autoJoin && isConnected && !hasJoinedRef.current) {
      joinChannel();
    }
  }, [autoJoin, isConnected, joinChannel]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hasJoinedRef.current) {
        leaveChannel();
      }
    };
  }, [leaveChannel]);
  const checkChannelState = useCallback((): void => {
    const channel = channelRef.current;
    if (!channel) return;

    // Update state based on channel state
    switch (channel.state) {
      case 'joined':
        if (channelState !== 'connected') {
          setChannelState('connected');
        }
        break;
      case 'joining':
        if (channelState !== 'joining') {
          setChannelState('joining');
        }
        break;
      case 'errored':
        if (channelState !== 'error') {
          setChannelState('error');
        }
        break;
      case 'closed':
      case 'leaving':
        if (channelState !== 'disconnected') {
          setChannelState('disconnected');
        }
        break;
    }
  }, [channelState]);
  // Monitor channel state changes
  useEffect(() => {
    if (!channelRef.current) return;

    const interval = setInterval(checkChannelState, 1000);
    return () => clearInterval(interval);
  }, [channelState]);

  // Memoized return value
  return useMemo<UsePhoenixChannelReturn>(
    () => ({
      // State
      channelState,
      error: channelError,
      channel: channelRef.current,

      // Computed states
      isJoined: channelState === 'connected',
      isJoining: channelState === 'joining',
      isConnected: channelState === 'connected',
      canJoin: channelState === 'disconnected' || channelState === 'error',

      // Functions
      join: joinChannel,
      leave: leaveChannel,
      sendMessage,
      onMessage,
      offMessage,
    }),
    [channelState, channelError, joinChannel, leaveChannel, sendMessage, onMessage, offMessage]
  );
};

export default usePhoenixChannel;
