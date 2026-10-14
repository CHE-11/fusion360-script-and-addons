import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Fusion palette hosting wants relative assets.
export default defineConfig({
  base: './',
  plugins: [
    react({
      babel: {
        plugins: ['styled-jsx/babel'],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    manifest: true,
    // Make the output as close to "single bundle" as possible (Fusion palette friendly).
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});


