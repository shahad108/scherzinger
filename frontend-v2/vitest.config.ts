import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    env: {
      VITE_SCHERZINGER_API: '',
      VITE_ALLOW_MOCK_FALLBACK: '1',
    },
    setupFiles: ['./src/tests/setup.ts'],
    css: true,
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
  },
});
