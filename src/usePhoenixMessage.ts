import { useEffect, useRef } from 'react';
import phoenixClient from './phoenix-client';
import { PHOENIX_EVENTS } from './core/events';
import type { MessageCallback } from './types';

/**
 * Optimized hook for listening to Phoenix channel messages
 * @param topic - Channel topic
 * @param event - Event name to listen for
 * @param callback - Message handler
 * @param deps - Dependencies for callback (optional)
 */
export const usePhoenixMessage = (
  topic: string,
  event: string,
  callback: MessageCallback,
  deps: React.DependencyList = []
): void => {
  const callbackRef = useRef<MessageCallback>(callback);
  const setupCompleteRef = useRef<boolean>(false);
  const handlerRef = useRef<MessageCallback | null>(null);
  const topicRef = useRef<string>(topic);
  const eventRef = useRef<string>(event);

  // Update refs when props change
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    topicRef.current = topic;
  }, [topic]);

  useEffect(() => {
    eventRef.current = event;
  }, [event]);

  useEffect(() => {
    // Validation
    if (!topic || !event || !callback) {
      console.warn('[usePhoenixMessage] Invalid parameters provided');
      return;
    }

    // Cleanup previous handler if exists
    if (handlerRef.current && setupCompleteRef.current) {
      try {
        phoenixClient.offMessage(topicRef.current, eventRef.current, handlerRef.current);
        setupCompleteRef.current = false;
      } catch (error) {
        console.warn(`[usePhoenixMessage] Failed to remove previous message listener`, error);
      }
    }

    // Create new stable callback wrapper
    const messageHandler: MessageCallback = payload => {
      try {
        callbackRef.current(payload);
      } catch (error) {
        console.error(`[usePhoenixMessage] Error in message handler for ${topic}:${event}:`, error);
      }
    };

    // Store the handler reference for cleanup
    handlerRef.current = messageHandler;

    // Setup listener
    try {
      phoenixClient.onMessage(topic, event, messageHandler);
      setupCompleteRef.current = true;
    } catch (error) {
      console.warn(
        `[usePhoenixMessage] Failed to setup message listener for ${topic}:${event}`,
        error
      );
    }

    // Cleanup function
    return () => {
      if (setupCompleteRef.current && handlerRef.current) {
        try {
          phoenixClient.offMessage(topicRef.current, eventRef.current, handlerRef.current);
          setupCompleteRef.current = false;
        } catch (error) {
          console.warn(`[usePhoenixMessage] Failed to remove message listener`, error);
        }
      }
    };
  }, [topic, event, ...deps]);
};

export default usePhoenixMessage;
