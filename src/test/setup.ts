import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock WebSocket for Phoenix tests
global.WebSocket = class WebSocket {
  constructor() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {}
  send() {}
  close() {}
} as any;

// Mock sessionStorage
const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true,
});

// Create a mock phoenix client that can be used in tests
export const mockPhoenixClient = {
  getConnectionState: vi.fn().mockReturnValue('disconnected'),
  canConnect: vi.fn().mockReturnValue(true),
  connect: vi.fn().mockResolvedValue(null),
  disconnect: vi.fn().mockImplementation(() => {}),
  resetConnection: vi.fn().mockImplementation(() => {}),
  setWebSocketUrl: vi.fn().mockImplementation(() => {}),
  setAuthParams: vi.fn().mockImplementation(() => {}),
  clearConfig: vi.fn().mockImplementation(() => {}),
  getConnectionStatus: vi.fn().mockReturnValue({
    connectionState: 'disconnected',
    isConnected: false,
    canConnect: true,
    channelCount: 0,
    config: {},
  }),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  joinChannel: vi.fn().mockReturnValue({
    state: 'joined',
    leave: vi.fn(),
    push: vi.fn().mockReturnValue({
      receive: vi.fn().mockReturnThis(),
    }),
    on: vi.fn(),
    off: vi.fn(),
  }),
  leaveChannel: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue({}),
  onMessage: vi.fn(),
  offMessage: vi.fn(),
};

// Mock console methods to reduce noise in tests
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  console.error = vi.fn();
  console.warn = vi.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
  // Reset all mock functions to their default implementations
  Object.values(mockPhoenixClient).forEach(mock => {
    if (typeof mock === 'function' && 'mockReset' in mock) {
      mock.mockReset();
      // Set default return values
      if (mock === mockPhoenixClient.getConnectionState) {
        mock.mockReturnValue('disconnected');
      }
      if (mock === mockPhoenixClient.canConnect) {
        mock.mockReturnValue(true);
      }
      if (mock === mockPhoenixClient.getConnectionStatus) {
        mock.mockReturnValue({
          connectionState: 'disconnected',
          isConnected: false,
          canConnect: true,
          channelCount: 0,
          config: {},
        });
      }
      if (mock === mockPhoenixClient.connect) {
        mock.mockResolvedValue(null);
      }
      if (mock === mockPhoenixClient.joinChannel) {
        mock.mockReturnValue({
          state: 'joined',
          leave: vi.fn(),
          push: vi.fn().mockReturnValue({
            receive: vi.fn().mockReturnThis(),
          }),
          on: vi.fn(),
          off: vi.fn(),
        });
      }
      if (mock === mockPhoenixClient.sendMessage) {
        mock.mockResolvedValue({});
      }
    }
  });
});
