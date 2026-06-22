import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Strict CSP for production builds only. Vite's dev server needs inline
// scripts + eval + ws for HMR, none of which we want shipped to prod.
//
// Two directives are deliberately omitted:
//   - `frame-ancestors` — silently ignored when delivered via meta; needs
//     an HTTP header, which GitHub Pages doesn't expose.
//   - `upgrade-insecure-requests` — WebKit eagerly upgrades localhost
//     `http://` requests to `https://`, which breaks `vite preview` and
//     any future `http://` localhost tooling. Prod is HTTPS-only on GitHub
//     Pages and the codebase has no `http://` resource URLs, so the
//     directive adds no real protection here.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://www.youtube.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://*.workers.dev https://api.github.com https://gist.githubusercontent.com",
  "media-src 'self' blob:",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="utf-8">',
        `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
      );
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    cspPlugin(),
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
