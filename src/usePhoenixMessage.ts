import { useEffect, useRef } from 'react';
import phoenixClient, { PHOENIX_EVENTS } from '.';

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
  callback: Function,
  deps: any[] = []
): void => {
  const callbackRef = useRef<Function>(callback);
  const setupCompleteRef = useRef<boolean>(false);
  const handlerRef = useRef<Function | null>(null);

  // Update callback ref when it changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    // Cleanup previous handler if exists
    if (handlerRef.current && setupCompleteRef.current) {
      try {
        phoenixClient.offMessage(topic, event, handlerRef.current);
        setupCompleteRef.current = false;
      } catch (error) {
        console.warn(`Failed to remove previous message listener for ${topic}:${event}`, error);
      }
    }

    // Create new stable callback wrapper
    const messageHandler = (payload: any): void => {
      callbackRef.current(payload);
    };

    // Store the handler reference for cleanup
    handlerRef.current = messageHandler;

    // Function to setup listener
    const setupListener = (): boolean => {
      try {
        // Use phoenixClient's public methods instead of accessing private channels
        // We'll check if we can setup the listener by attempting to add it
        // If the channel doesn't exist or isn't joined, phoenixClient will handle it

        // Setup listener with the current handler
        if (handlerRef.current) {
          phoenixClient.onMessage(topic, event, handlerRef.current);
        }
        setupCompleteRef.current = true;

        return true;
      } catch (error) {
        console.warn(`Failed to setup message listener for ${topic}:${event}`, error);
        return false;
      }
    };

    // Function to cleanup listener
    const cleanupListener = () => {
      if (setupCompleteRef.current && handlerRef.current) {
        try {
          phoenixClient.offMessage(topic, event, handlerRef.current);
          setupCompleteRef.current = false;
        } catch (error) {
          console.warn(`Failed to remove message listener for ${topic}:${event}`, error);
        }
      }
    };

    // Try immediate setup
    if (setupListener()) {
      // Return cleanup function immediately
      return cleanupListener;
    }

    // If immediate setup failed, wait for connection/channel events
    let retryCount = 0;
    const maxRetries = 50; // 5 seconds with 100ms intervals
    let retryInterval: NodeJS.Timeout | null = null;

    const retrySetup = () => {
      if (setupListener()) {
        if (retryInterval) {
          clearInterval(retryInterval);
          retryInterval = null;
        }
        return;
      }

      retryCount++;
      if (retryCount >= maxRetries) {
        if (retryInterval) {
          clearInterval(retryInterval);
          retryInterval = null;
        }
      }
    };

    // Setup retry interval
    retryInterval = setInterval(retrySetup, 100);

    // Also listen for Phoenix events that might indicate channel is ready
    const handlePhoenixEvent = (): void => {
      if (!setupCompleteRef.current) {
        if (setupListener() && retryInterval) {
          clearInterval(retryInterval);
          retryInterval = null;
        }
      }
    };

    phoenixClient.addEventListener(PHOENIX_EVENTS.CONNECT, handlePhoenixEvent);
    phoenixClient.addEventListener(PHOENIX_EVENTS.RECONNECT, handlePhoenixEvent);

    // Cleanup function
    return () => {
      // Clear retry interval
      if (retryInterval) {
        clearInterval(retryInterval);
      }

      // Remove Phoenix event listeners
      phoenixClient.removeEventListener(PHOENIX_EVENTS.CONNECT, handlePhoenixEvent);
      phoenixClient.removeEventListener(PHOENIX_EVENTS.RECONNECT, handlePhoenixEvent);

      // Clean up message listener
      cleanupListener();
    };
  }, [topic, event, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
};

export default usePhoenixMessage;
