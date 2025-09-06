import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { vi } from 'vitest';

// Custom render function that includes providers if needed
const customRender = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) => {
  const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
    return <>{children}</>;
  };

  return render(ui, { wrapper: AllTheProviders, ...options });
};

// Mock Phoenix Socket for testing
export const createMockSocket = () => ({
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
});

// Mock channel for testing
export const createMockChannel = () => ({
  state: 'joined',
  leave: vi.fn(),
  push: vi.fn().mockReturnValue({
    receive: vi.fn().mockReturnThis(),
  }),
  on: vi.fn(),
  off: vi.fn(),
});

// Helper to wait for async operations
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0));

// Test data helpers
export const createTestMessage = (overrides = {}) => ({
  id: 'test-id',
  content: 'test message',
  timestamp: Date.now(),
  ...overrides,
});

export const createTestUser = (overrides = {}) => ({
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  ...overrides,
});

export const createTestChannelParams = (overrides = {}) => ({
  user_id: 'user-1',
  token: 'test-token',
  ...overrides,
});

// re-export everything
export * from '@testing-library/react';

// override render method
export { customRender as render };
