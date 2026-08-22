import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Generates favicon/PWA icons from the single SVG source at dev and build
// time (wired through the `pwaAssets` option in vite.config.ts). No binary
// icons need to be committed to the repo.
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/favicon.svg'],
})
