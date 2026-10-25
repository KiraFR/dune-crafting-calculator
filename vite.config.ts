import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Two entry pages: the calculator at / and the read-only overlay at /overlay/.
// The Tauri overlay app will load /overlay/ of the deployed site, so it must
// stay a real HTML file (no client-side routing, no SPA fallback needed).
export default defineConfig({
  plugins: [react()],
  build: {
    // The game data (~480 KB of JSON) is bundled on purpose so the page never
    // shows a loading state; it gzips to ~120 KB together with React.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        overlay: resolve(import.meta.dirname, 'overlay/index.html'),
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
