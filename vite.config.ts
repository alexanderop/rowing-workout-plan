import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import vueDevTools from 'vite-plugin-vue-devtools'
import { versionPlugin } from './vite-plugins/versionPlugin.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    versionPlugin(),
    tailwindcss(),
    // The floating DevTools panel overlays the bottom of small viewports and
    // can swallow taps on the bottom navigation in browser-driven checks.
    ...(process.env.CI ? [] : [vueDevTools()]),
    VitePWA({
      // 'prompt' shows an in-app "update available" banner instead of silently
      // swapping the service worker — see src/composables/usePwaUpdate.ts.
      registerType: 'prompt',
      // Icons are generated at dev/build time from public/favicon.svg via
      // pwa-assets.config.ts and injected into the manifest automatically.
      pwaAssets: {
        config: true,
      },
      manifest: {
        // `short_name` is the label under the installed icon, where Android
        // truncates around 12 characters and iOS sooner — keep it one word.
        name: 'Rowing Plan',
        short_name: 'Rowing',
        description: 'Structured erg training plans, paced to your 2k, logged on your device',
        // Hex mirror of --primary in src/style.css (manifests can't use CSS
        // variables) — update this if the primary token's hue ever changes.
        theme_color: '#7c3aed',
        background_color: '#ffffff',
        display: 'standalone',
      },
      workbox: {
        // The vision model runtime — the `ai` chunk (see build.rollupOptions)
        // and the onnxruntime wasm binary it carries — is tens of megabytes
        // and loaded only when someone scans a monitor photo. Precaching it
        // would make every fresh install download it up front (and the wasm
        // alone breaks workbox's 2 MiB precache ceiling); the
        // StaleWhileRevalidate rule below still caches the chunk on first use.
        globIgnores: ['**/ai-*.js', '**/ort-*.wasm'],
        runtimeCaching: [
          {
            // `sameOrigin` is load-bearing, not tidiness: a cross-origin
            // request (a CDN <script>, a webfont stylesheet) with no CORS
            // headers returns an *opaque* response, which Chrome pads to
            // ~7 MB of quota each — on the same quota IndexedDB draws from.
            // A handful of them can push the origin over and get the user's
            // data evicted. Keep the origin check when adding destinations.
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin &&
              (request.destination === 'style' ||
                request.destination === 'script' ||
                request.destination === 'worker'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-resources',
              expiration: { maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 24 * 60 * 60 },
            },
          },
          {
            // The onnxruntime wasm behind the photo scan, excluded from the
            // precache above. It arrives via plain fetch(), whose `destination`
            // is the empty string, so the static-resources rule above never
            // matches it — without this rule a scan that worked once still
            // re-downloads 20+ MB on the next visit, and offline never works.
            // Same-origin only, like everything here.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.endsWith('.wasm'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ai-wasm',
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 24 * 60 * 60 },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Everything behind the lazy `import('@huggingface/transformers')` in
        // src/lib/monitorPhotoModel.ts lands in one chunk named `ai`, so the
        // size-limit entry in package.json and the workbox ignore above can
        // both address it by name instead of chasing hashed module names.
        manualChunks: (id) =>
          id.includes('@huggingface/transformers') || id.includes('onnxruntime') ? 'ai' : undefined,
      },
    },
  },
  // Prebundling would pull the whole model runtime into the dev graph on
  // startup; it is dynamically imported and esbuild mangles its wasm loading.
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // OTLP telemetry export in development (src/lib/observability.ts).
      // Proxied rather than posted straight at :4318 so the request is
      // same-origin: an OTLP payload is application/json, which triggers a
      // CORS preflight that a stock Jaeger or otel-collector rejects — spans
      // would vanish with only a console error to show for it. Going through
      // Vite means the collector needs no CORS configuration at all.
      //
      // Inert unless VITE_OTLP_URL is set, so a dev server with no collector
      // running never sees a request here (and never logs a refused one).
      '/_otlp': {
        target: process.env.OTLP_ENDPOINT ?? 'http://localhost:4318',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/_otlp/, ''),
      },
    },
  },
})
