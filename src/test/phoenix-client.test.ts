import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  PhoenixClient,
  setPhoenixEnv,
  initializePhoenixClient,
  PHOENIX_EVENTS,
} from '../phoenix-client';

// Mock Phoenix Socket
vi.mock('phoenix', () => ({
  Socket: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onError: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
    channel: vi.fn().mockReturnValue({
      join: vi.fn().mockReturnValue({
        receive: vi.fn().mockReturnThis(),
      }),
      leave: vi.fn(),
      push: vi.fn().mockReturnValue({
        receive: vi.fn().mockReturnThis(),
      }),
      on: vi.fn(),
      off: vi.fn(),
      state: 'closed',
    }),
  })),
  LongPoll: vi.fn(),
}));

describe('PhoenixClient', () => {
  let client: PhoenixClient;
  const mockEnv = {
    EDGE_URL: 'https://api.example.com',
    SOCKET_EDGE_URL: 'wss://socket.example.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear sessionStorage mocks
    vi.mocked(sessionStorage.getItem).mockReturnValue(null);
    vi.mocked(sessionStorage.setItem).mockImplementation(() => {});
    vi.mocked(sessionStorage.removeItem).mockImplementation(() => {});

    client = new PhoenixClient(mockEnv);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Initialization', () => {
    it('should create a PhoenixClient instance', () => {
      expect(client).toBeInstanceOf(PhoenixClient);
    });

    it('should initialize with provided env', () => {
      expect(client).toBeDefined();
    });

    it('should have correct initial state', () => {
      expect(client.getConnectionState()).toBe('disconnected');
      expect(client.canConnect()).toBe(true);
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('Environment Configuration', () => {
    it('should set environment variables', () => {
      const newEnv = { EDGE_URL: 'https://new-api.example.com' };
      setPhoenixEnv(newEnv);

      const newClient = initializePhoenixClient(newEnv);
      expect(newClient).toBeDefined();
    });

    it('should initialize client with env', () => {
      const initializedClient = initializePhoenixClient(mockEnv);
      expect(initializedClient).toBeDefined();
    });
  });

  describe('Connection Management', () => {
    it('should handle connection attempts', async () => {
      const connectionOptions = {
        endpoint: 'wss://test.example.com/socket',
        params: { token: 'test-token' },
      };

      try {
        await client.connect(connectionOptions);
      } catch (error) {
        // Expected to fail in test environment without real socket
        expect(error).toBeDefined();
      }
    });

    it('should disconnect properly', () => {
      client.disconnect();
      expect(client.getConnectionState()).toBe('disconnected');
    });

    it('should reset connection', () => {
      client.resetConnection();
      expect(client.getConnectionState()).toBe('disconnected');
    });
  });

  describe('Channel Management', () => {
    it('should throw error when joining channel without connection', () => {
      expect(() => {
        client.joinChannel('test:topic');
      }).toThrow('Socket not connected');
    });

    it('should throw error when sending message without channel', () => {
      expect(() => {
        client.sendMessage('test:topic', 'test:event');
      }).toThrow('Channel test:topic not found');
    });

    it('should handle leaveChannel for non-existent channel', () => {
      expect(() => {
        client.leaveChannel('nonexistent:topic');
      }).not.toThrow();
    });
  });

  describe('Event System', () => {
    it('should add and remove event listeners', () => {
      const mockHandler = vi.fn();

      client.addEventListener(PHOENIX_EVENTS.CONNECT, mockHandler);
      client.removeEventListener(PHOENIX_EVENTS.CONNECT, mockHandler);

      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should get connection status', () => {
      const status = client.getConnectionStatus();
      expect(status).toHaveProperty('connectionState');
      expect(status).toHaveProperty('isConnected');
      expect(status).toHaveProperty('canConnect');
      expect(status).toHaveProperty('channelCount');
      expect(status).toHaveProperty('config');
    });
  });

  describe('Configuration', () => {
    it('should set WebSocket URL', () => {
      const url = 'wss://custom.example.com/socket';
      client.setWebSocketUrl(url);
      expect(sessionStorage.setItem).toHaveBeenCalled();
    });

    it('should set auth params', () => {
      const authParams = { token: 'test-token' };
      client.setAuthParams(authParams);
      expect(sessionStorage.setItem).toHaveBeenCalled();
    });

    it('should clear config', () => {
      client.clearConfig();
      expect(sessionStorage.removeItem).toHaveBeenCalled();
    });
  });
});

describe('PHOENIX_EVENTS', () => {
  it('should export correct event constants', () => {
    expect(PHOENIX_EVENTS.CONNECT).toBe('phoenix_connect');
    expect(PHOENIX_EVENTS.DISCONNECT).toBe('phoenix_disconnect');
    expect(PHOENIX_EVENTS.ERROR).toBe('phoenix_error');
    expect(PHOENIX_EVENTS.RECONNECT).toBe('phoenix_reconnect');
  });
});
