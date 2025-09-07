// Main exports for the React Phoenix library
export { usePhoenix } from './usePhoenix';
export { usePhoenixChannel } from './usePhoenixChannel';
export { usePhoenixMessage } from './usePhoenixMessage';

// Core client and utilities
export {
  phoenixClient,
  setPhoenixEnv,
  initializePhoenixClient,
  getPhoenixClient,
} from './phoenix-client';

// Events
export { PHOENIX_EVENTS } from './core/events';

// Type exports
export type {
  UsePhoenixOptions,
  UsePhoenixReturn,
  UsePhoenixChannelOptions,
  UsePhoenixChannelReturn,
  PhoenixEnv,
  ConnectionParams,
  PhoenixConfig,
} from './types';

// Default export (legacy compatibility)
export { default } from './phoenix-client';
