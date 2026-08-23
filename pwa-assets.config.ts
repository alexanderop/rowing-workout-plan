import { defineConfig } from '@vite-pwa/assets-generator/config'

// The tile colour behind the icon, matching the gradient in favicon.svg and
// the manifest's theme_color. It only ever shows through the SVG's rounded
// corners — see the padding note below.
const BRAND = '#7c3aed'

// Generates favicon/PWA icons from the single SVG source at dev and build time
// (wired through the `pwaAssets` option in vite.config.ts). No binary icons
// need to be committed to the repo.
//
// This is `minimal2023Preset` with the padding taken off. The preset's default
// is `padding: 0.3` on the maskable and Apple icons, on a white canvas — the
// artwork is shrunk to 70% and centred, which is right for a logo drawn with
// no background of its own, and wrong for ours. Installed, that renders as a
// small purple tile floating in a white circle: the launcher's own mask has
// nothing to bite into, and dark home screens get a white disc.
//
// Ours is a full-bleed tile whose safe zone is already built into the source,
// so it goes out edge to edge and the launcher crops it however it likes.
export default defineConfig({
  preset: {
    // Chrome, desktop installs and the .ico all take the artwork as drawn,
    // rounded corners transparent.
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[48, 'favicon.ico']],
      padding: 0,
    },
    // Android crops this one to the launcher's shape, so the corners are
    // filled rather than transparent: whatever the mask keeps is brand
    // colour, never a white ring.
    maskable: {
      sizes: [512],
      padding: 0,
      resizeOptions: { fit: 'contain', background: BRAND },
    },
    // iOS applies its own squircle and composites anything transparent onto
    // black, so this one is filled for the same reason.
    apple: {
      sizes: [180],
      padding: 0,
      resizeOptions: { fit: 'contain', background: BRAND },
    },
  },
  images: ['public/favicon.svg'],
})
