import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite is used ONLY to compile/bundle the React frontend for local development
// and to produce the single-file bundle that gets inlined into the Apps Script
// HTMLService template (see scripts/build-gas.mjs). It is a dev tool, not a
// production server — the production app runs as a Google Apps Script Web App.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: true,
    port: 5173,
    // Allow the Arena live-preview proxy host to reach the dev server.
    allowedHosts: true,
    strictPort: false,
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    // Produce a single JS chunk + single CSS file so build-gas.mjs can inline
    // them cleanly into the HTMLService template.
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    chunkSizeWarningLimit: 2000,
  },
});
