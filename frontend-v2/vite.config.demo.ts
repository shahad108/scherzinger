import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  base: '/demo-v2/',
  build: {
    outDir: path.resolve(__dirname, '../frontend/dist-demo-v2'),
    emptyOutDir: true,
    sourcemap: false,
  },
});
