import { phoenixEventManager, PHOENIX_EVENTS } from './events';
import { channelUtils, errorUtils } from '../utils';
import type { ConnectionParams } from '../types';

/**
 * Channel Manager for Phoenix Client
 * Handles channel lifecycle, messaging, and state management
 */

type PhoenixChannel = any; // Phoenix channel type

export interface ChannelState {
  topic: string;
  status: 'disconnected' | 'joining' | 'joined' | 'error';
  error?: Error;
  lastJoined?: Date;
  lastLeft?: Date;
  messageCount: number;
}

export interface ChannelOptions {
  params?: Record<string, any>;
  onJoin?: (response: any) => void;
  onLeave?: (response: any) => void;
  onError?: (error: any) => void;
  onMessage?: (event: string, payload: any) => void;
}

export interface ChannelMessage {
  event: string;
  payload: any;
  timestamp: number;
}

/**
 * Channel Manager Class
 */
export class PhoenixChannelManager {
  private channels = new Map<string, PhoenixChannel>();
  private channelStates = new Map<string, ChannelState>();
  private messageListeners = new Map<string, Map<string, Set<Function>>>();
  private socket: any = null;
  private maxChannels: number = 50; // Prevent excessive channel creation
  private maxListenersPerEvent: number = 10; // Prevent memory leaks from too many listeners

  constructor(socket: any) {
    this.socket = socket;
  }

  /**
   * Update socket reference
   */
  setSocket(socket: any): void {
    this.socket = socket;
  }

  /**
   * Join a channel
   */
  async joinChannel(topic: string, options: ChannelOptions = {}): Promise<PhoenixChannel> {
    if (!this.socket) {
      throw errorUtils.createError('Socket not connected', 'SOCKET_NOT_CONNECTED');
    }

    // Resource protection: prevent excessive channel creation
    if (this.channels.size >= this.maxChannels) {
      throw errorUtils.createError(
        `Maximum channels limit (${this.maxChannels}) exceeded`,
        'MAX_CHANNELS_EXCEEDED'
      );
    }

    // Check if already joined
    const existingChannel = this.channels.get(topic);
    if (existingChannel?.state === 'joined') {
      return existingChannel;
    }

    // Update state
    this.updateChannelState(topic, { status: 'joining' });

    try {
      // Create or reuse channel
      const channel = existingChannel || this.socket.channel(topic, options.params || {});
      this.channels.set(topic, channel);

      // Setup event handlers
      this.setupChannelHandlers(topic, channel, options);

      // Join the channel
      await this.performChannelJoin(topic, channel, options);

      return channel;
    } catch (error) {
      this.updateChannelState(topic, {
        status: 'error',
        error: error as Error,
      });

      phoenixEventManager.emit(PHOENIX_EVENTS.CHANNEL_ERROR, {
        topic,
        error: error as Error,
      });

      throw error;
    }
  }

  /**
   * Leave a channel
   */
  leaveChannel(topic: string): void {
    const channel = this.channels.get(topic);
    if (!channel) return;

    try {
      channel.leave();
    } catch (error) {
      console.warn(`[ChannelManager] Error leaving channel ${topic}:`, error);
    }

    // Clean up
    this.channels.delete(topic);
    this.messageListeners.delete(topic);
    this.updateChannelState(topic, {
      status: 'disconnected',
      lastLeft: new Date(),
    });

    phoenixEventManager.emit(PHOENIX_EVENTS.CHANNEL_LEAVE, {
      topic,
      response: {},
    });
  }

  /**
   * Send message to channel
   */
  async sendMessage(topic: string, event: string, payload: any = {}): Promise<any> {
    const channel = this.channels.get(topic);
    if (!channel) {
      throw errorUtils.createError(`Channel ${topic} not found`, 'CHANNEL_NOT_FOUND');
    }

    return new Promise((resolve, reject) => {
      channel
        .push(event, payload)
        .receive('ok', (response: any) => {
          this.incrementMessageCount(topic);
          resolve(response);
        })
        .receive('error', (error: any) => {
          reject(errorUtils.createError(`Message failed: ${error}`, 'MESSAGE_ERROR', error));
        })
        .receive('timeout', () => {
          reject(errorUtils.createError('Message timeout', 'MESSAGE_TIMEOUT'));
        });
    });
  }

  /**
   * Listen for messages on a channel
   */
  onMessage(topic: string, event: string, callback: Function): void {
    const channel = this.channels.get(topic);
    if (!channel) {
      console.warn(`[ChannelManager] Channel ${topic} not joined, deferring message listener`);
      return;
    }

    // Initialize listeners map for topic
    if (!this.messageListeners.has(topic)) {
      this.messageListeners.set(topic, new Map());
    }

    const topicListeners = this.messageListeners.get(topic)!;

    // Initialize listeners set for event
    if (!topicListeners.has(event)) {
      topicListeners.set(event, new Set());
    }

    const eventListeners = topicListeners.get(event)!;

    // Resource protection: prevent excessive listeners
    if (eventListeners.size >= this.maxListenersPerEvent) {
      console.warn(
        `[ChannelManager] Maximum listeners (${this.maxListenersPerEvent}) exceeded for ${topic}:${event}`
      );
      return;
    }

    // Add callback if not already present
    if (!eventListeners.has(callback)) {
      eventListeners.add(callback);

      // Setup Phoenix listener
      channel.on(event, callback);
    }
  }

  /**
   * Stop listening for messages on a channel
   */
  offMessage(topic: string, event: string, callback: Function): void {
    const topicListeners = this.messageListeners.get(topic);
    if (!topicListeners) return;

    const eventListeners = topicListeners.get(event);
    if (!eventListeners) return;

    // Remove callback
    eventListeners.delete(callback);

    // Remove Phoenix listener
    const channel = this.channels.get(topic);
    if (channel) {
      try {
        channel.off(event, callback);
      } catch (error) {
        console.warn(`[ChannelManager] Error removing message listener:`, error);
      }
    }

    // Clean up empty sets
    if (eventListeners.size === 0) {
      topicListeners.delete(event);
    }
    if (topicListeners.size === 0) {
      this.messageListeners.delete(topic);
    }
  }

  /**
   * Get channel state
   */
  getChannelState(topic: string): ChannelState | null {
    return this.channelStates.get(topic) || null;
  }

  /**
   * Get all channel states
   */
  getAllChannelStates(): Map<string, ChannelState> {
    return new Map(this.channelStates);
  }

  /**
   * Check if channel is joined
   */
  isChannelJoined(topic: string): boolean {
    const state = this.channelStates.get(topic);
    return state?.status === 'joined';
  }

  /**
   * Get channel count
   */
  getChannelCount(): number {
    return this.channels.size;
  }

  /**
   * Get resource usage statistics
   */
  getResourceStats(): {
    channels: number;
    maxChannels: number;
    totalListeners: number;
    maxListenersPerEvent: number;
  } {
    let totalListeners = 0;
    for (const topicListeners of this.messageListeners.values()) {
      for (const eventListeners of topicListeners.values()) {
        totalListeners += eventListeners.size;
      }
    }

    return {
      channels: this.channels.size,
      maxChannels: this.maxChannels,
      totalListeners,
      maxListenersPerEvent: this.maxListenersPerEvent,
    };
  }

  /**
   * Clean up all channels
   */
  cleanup(): void {
    for (const [topic] of this.channels) {
      this.leaveChannel(topic);
    }

    this.channels.clear();
    this.channelStates.clear();
    this.messageListeners.clear();
  }

  /**
   * Private Methods
   */

  private updateChannelState(topic: string, updates: Partial<ChannelState>): void {
    const currentState = this.channelStates.get(topic) || {
      topic,
      status: 'disconnected',
      messageCount: 0,
    };

    const newState = { ...currentState, ...updates };
    this.channelStates.set(topic, newState);
  }

  private incrementMessageCount(topic: string): void {
    const state = this.channelStates.get(topic);
    if (state) {
      state.messageCount++;
    }
  }

  private setupChannelHandlers(
    topic: string,
    channel: PhoenixChannel,
    options: ChannelOptions
  ): void {
    // Prevent duplicate handler setup
    if ((channel as any)._channelManagerHandlers) return;
    (channel as any)._channelManagerHandlers = true;

    // Error handler
    channel.onError((error: any) => {
      this.updateChannelState(topic, {
        status: 'error',
        error,
      });

      options.onError?.(error);
      phoenixEventManager.emit(PHOENIX_EVENTS.CHANNEL_ERROR, {
        topic,
        error,
      });
    });

    // Close handler
    channel.onClose(() => {
      this.updateChannelState(topic, {
        status: 'disconnected',
        lastLeft: new Date(),
      });

      options.onLeave?.({});
      phoenixEventManager.emit(PHOENIX_EVENTS.CHANNEL_LEAVE, {
        topic,
        response: {},
      });
    });
  }

  private async performChannelJoin(
    topic: string,
    channel: PhoenixChannel,
    options: ChannelOptions
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(errorUtils.createError('Channel join timeout', 'JOIN_TIMEOUT'));
      }, 10000);

      // Setup join response handlers
      channel
        .join()
        .receive('ok', (response: any) => {
          clearTimeout(timeout);
          this.updateChannelState(topic, {
            status: 'joined',
            lastJoined: new Date(),
            error: undefined,
          });

          options.onJoin?.(response);
          phoenixEventManager.emit(PHOENIX_EVENTS.CHANNEL_JOIN, {
            topic,
            response,
          });

          resolve();
        })
        .receive('error', (error: any) => {
          clearTimeout(timeout);
          reject(errorUtils.createError(`Channel join failed: ${error}`, 'JOIN_ERROR', error));
        })
        .receive('timeout', () => {
          clearTimeout(timeout);
          reject(errorUtils.createError('Channel join timeout', 'JOIN_TIMEOUT'));
        });
    });
  }
}
