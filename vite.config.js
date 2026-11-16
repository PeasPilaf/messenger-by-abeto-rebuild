import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5300, host: '127.0.0.1', open: false },
  build: { target: 'esnext' },

  worker: { format: 'es' },
  assetsInclude: ['**/*.glsl'],
});
