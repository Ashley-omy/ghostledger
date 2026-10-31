import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Set BASE_PATH=/ghostledger/ when hosting on GitHub Pages under the repo name.
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // we show "Update available" instead of reloading under the user
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'GhostLedger',
        short_name: 'GhostLedger',
        description: 'Snap a receipt, get a household ledger. Runs on your phone, offline.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell, including the sqlite / onnxruntime .wasm files that Vite bundles.
        // The Gemma model itself is NOT precached: Transformers.js stores it in the Cache API on demand.
        globPatterns: ['**/*.{js,css,html,wasm,mjs,svg,png,webmanifest}'],
        // Transformers.js loads ONNX Runtime from jsDelivr (cached below and in its own wasm cache),
        // so the copy Vite bundles is unused. TODO: self-host it via env.backends.onnx.wasm.wasmPaths.
        globIgnores: ['**/ort-wasm*.wasm'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // ONNX Runtime may load its .wasm from jsDelivr; keep a copy so inference works offline.
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web/,
            handler: 'CacheFirst',
            options: { cacheName: 'onnxruntime', expiration: { maxEntries: 20 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  // `npm run phone`: the production build, reachable through a tunnel / published port.
  // Use it for phone testing: the dev server's client reloads the page whenever its connection
  // drops, e.g. every time the camera app opens, which loses the photo.
  preview: { port: 4173, allowedHosts: true },
  worker: { format: 'es' },
  optimizeDeps: {
    // sqlite-wasm loads its .wasm relative to its own module; pre-bundling breaks that.
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
});
