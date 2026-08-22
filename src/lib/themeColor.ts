/**
 * Status-bar / browser-chrome color per theme. Hex mirrors of `--background`
 * in src/style.css (`<meta>` can't read CSS variables) and of the two
 * media-scoped tags in index.html — keep all three in step.
 */
const THEME_COLORS = {
  light: '#ffffff',
  dark: '#0a0a0a',
} as const

/**
 * Point `<meta name="theme-color">` at the theme the app is actually
 * rendering.
 *
 * index.html ships two media-scoped tags so the chrome is right before any JS
 * runs, but they key off `prefers-color-scheme` — which is wrong the moment
 * the user overrides the OS preference in settings, leaving an installed PWA
 * with a white status bar over a dark app. Once JS is up we drop the
 * media-scoped tags and drive a single unconditional one instead.
 */
export function applyThemeColor(isDark: boolean): void {
  for (const scoped of document.querySelectorAll('meta[name="theme-color"][media]')) {
    scoped.remove()
  }

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')

  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.append(meta)
  }

  meta.content = isDark ? THEME_COLORS.dark : THEME_COLORS.light
}
