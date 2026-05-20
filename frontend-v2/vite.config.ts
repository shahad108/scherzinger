import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Same-origin proxy for ``/api/*`` so the FE client can stay relative
  // (``BASE = '/api/v1'`` in src/lib/api/client.ts). Override the target
  // by setting ``VITE_API_PROXY_TARGET`` in .env.local.
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8000';
  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      port: 5174,
      host: true,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          ws: false,
        },
      },
    },
    build: { outDir: 'dist', sourcemap: true },
  };
});
