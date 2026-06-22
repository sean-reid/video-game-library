import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Custom SW (push notifications + offline precache). injectManifest
      // strategy keeps our handlers intact and lets workbox-precaching
      // populate self.__WB_MANIFEST with the build artefacts.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Match the existing registration path in the legacy app.
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,woff2,png}'],
      },
      manifest: {
        name: 'Video Game Library',
        short_name: 'Library',
        description: 'Personal video game journal',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#0a0a0c',
        theme_color: '#0a0a0c',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      // Static assets to copy from /public into dist/ as-is.
      includeAssets: ['icon-167.png', 'icon-180.png', 'icon-192.png', 'icon-512.png'],
    }),
  ],
  // Base path stays root-relative so the app works at both
  // https://danrstaton.github.io/video-game-library/ and a custom domain.
  base: './',
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
