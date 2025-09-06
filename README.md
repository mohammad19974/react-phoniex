# React Phoenix

A modern React library for Phoenix WebSocket connections with TypeScript support. Provides React hooks and utilities for seamless real-time communication.

[![npm version](https://badge.fury.io/js/react-phoenix-app.svg)](https://www.npmjs.com/package/react-phoenix-app)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/mohammad19974/react-phoenix/workflows/CI/badge.svg)](https://github.com/mohammad19974/react-phoenix/actions)
[![codecov](https://codecov.io/gh/mohammad19974/react-phoenix/branch/main/graph/badge.svg)](https://codecov.io/gh/mohammad19974/react-phoenix)

## ✨ Features

- 🚀 **React 17+ Support** - Compatible with React 17, 18, and 19
- 🔧 **TypeScript Ready** - Full type definitions included
- 🎣 **React Hooks** - Modern hook-based API for connections and channels
- 🔌 **Phoenix Integration** - Seamless WebSocket communication
- 🧪 **Well Tested** - Comprehensive test coverage
- 📦 **Tree Shakable** - Optimized bundle size

## 📦 Installation

```bash
npm install react-phoenix-app
```

## 🚀 Quick Start

```javascript
import { usePhoenix, usePhoenixChannel } from 'react-phoenix-app';

// Set environment configuration
import { setPhoenixEnv } from 'react-phoenix-app';
setPhoenixEnv({
  EDGE_URL: 'https://your-api-endpoint.com',
  SOCKET_EDGE_URL: 'wss://your-socket-endpoint.com',
});
```

## 📚 Usage

### Connection Management

```jsx
import { usePhoenix } from 'react-phoenix-app';

function App() {
  const { connectionState, isConnected, connect, disconnect } = usePhoenix({
    endpoint: 'wss://your-app.com/socket',
    autoConnect: true,
  });

  return (
    <div>
      <p>Status: {connectionState}</p>
      <button onClick={connect} disabled={isConnected}>
        Connect
      </button>
      <button onClick={disconnect} disabled={!isConnected}>
        Disconnect
      </button>
    </div>
  );
}
```

### Channel Management

```jsx
import { usePhoenixChannel } from 'react-phoenix-app';

function ChatRoom() {
  const { isJoined, join, sendMessage } = usePhoenixChannel('room:lobby', {
    autoJoin: true,
  });

  return (
    <div>
      <button onClick={() => sendMessage('new_msg', { text: 'Hello!' })}>Send Message</button>
    </div>
  );
}
```

### Message Listening

```jsx
import { usePhoenixMessage } from 'react-phoenix-app';

function MessageHandler() {
  usePhoenixMessage('room:lobby', 'new_msg', payload => {
    console.log('New message:', payload);
  });

  return null;
}
```

## 🔧 API Reference

### Hooks

- **`usePhoenix(options?)`** - Main connection management hook
- **`usePhoenixChannel(topic, options?)`** - Channel management hook
- **`usePhoenixMessage(topic, event, callback, deps?)`** - Message listening hook

### Functions

- **`setPhoenixEnv(env)`** - Configure environment variables
- **`initializePhoenixClient(env)`** - Create custom client instance
- **`phoenixClient`** - Direct access to client instance

## 🤖 CI/CD

This project uses GitHub Actions for continuous integration and deployment:

- **CI Pipeline**: Runs on every push and pull request
- **Multi-Node Testing**: Tests on Node.js 18.x and 20.x
- **Code Quality**: Automated linting and formatting checks
- **Security**: Dependency vulnerability scanning
- **Coverage**: Test coverage reporting with Codecov

### Workflows

- **CI** (`ci.yml`): Main testing and building pipeline
- **PR Checks** (`pr-checks.yml`): Enhanced checks for pull requests
- **Quick Check** (`quick-check.yml`): Fast checks for documentation changes

### Local Development

```bash
# Format code
npm run format

# Check formatting
npm run format:check

# Run linter
npm run lint

# Run tests with coverage
npm run test:coverage

# Build project
npm run build
```

## 📄 License

MIT © [Mohammad Jamil](https://github.com/mohammad19974)

## 📞 Support

If you have any questions or need help, please open an issue on GitHub.
