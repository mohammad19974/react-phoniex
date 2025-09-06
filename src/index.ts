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
  PHOENIX_EVENTS,
} from './phoenix-client';

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
