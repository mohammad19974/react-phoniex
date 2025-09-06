import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
  build: {
    lib: {
      entry: resolve(process.cwd(), 'src/index.ts'),
      name: 'ReactPhoenix',
      fileName: 'react-phoenix',
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'phoenix'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          phoenix: 'Phoenix',
        },
        exports: 'named',
      },
    },
  },
});
