/**
 * Tripwires for docs/touch-conventions.md — the half of those rules that no
 * tier we run can observe.
 *
 * The pairing the project already uses: **one behavioral test that the
 * mechanism works, one static rule that it is applied everywhere.**
 * `components/touchConventions.spec.ts` and `touch/touchTargets.spec.ts` are
 * the behavioral half; this file is the coverage half. Neither substitutes
 * for the other — a per-control spec does not scale to the next control
 * someone adds, and a static rule does not prove the mechanism.
 *
 * Where only one is worth having, it is said here and why. Press feedback is
 * the case: `:active` is UA-driven and cannot be dispatched (`userEvent` has
 * click, dblClick and hover but no pointer-hold), and asserting that
 * `active:scale-97` visibly scales an element would be testing Chromium
 * rather than testing us. What can actually rot is *coverage* — the next
 * control that ships mouse-only — and that is exactly what a static rule
 * catches.
 *
 * Deliberately text-level rather than a full parse, like `primitives.test.ts`,
 * and every helper below is exercised against a synthetic violation as well as
 * the real tree — a rule that only ever sees passing input is not a rule.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SOURCE_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const STYLESHEET = `${SOURCE_ROOT}style.css`

const SCANNED_EXTENSIONS = ['.css', '.vue', '.ts']

interface SourceFile {
  /** Path relative to `src/`. */
  id: string
  source: string
}

function sourceFiles(directory = SOURCE_ROOT, prefix = ''): Array<SourceFile> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const id = `${prefix}${entry.name}`
    if (entry.isDirectory()) {
      return id === '__tests__' ? [] : sourceFiles(`${directory}${entry.name}/`, `${id}/`)
    }
    if (!SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) return []
    return [{ id, source: readFileSync(`${directory}${entry.name}`, 'utf8') }]
  })
}

const FILES = sourceFiles()
const STYLES = readFileSync(STYLESHEET, 'utf8')

// --- text helpers, exercised against synthetic input further down ----------

/**
 * The source with every `@utility safe-area-*` block removed.
 *
 * Those blocks are the one legitimate home for a raw `env()`: they are what
 * clamp it. Everywhere else, a bare `env(safe-area-inset-*)` is the A1 bug
 * shipping again — every inset is 0 on flat-bottomed hardware, so it is a
 * layout nobody tested.
 */
export function withoutSafeAreaUtilities(css: string): string {
  let result = ''
  let index = 0

  for (;;) {
    const match = /@utility\s+safe-area-[\w-]*\s*\{/.exec(css.slice(index))
    if (!match) return result + css.slice(index)

    const start = index + match.index
    result += css.slice(index, start)

    let depth = 0
    let cursor = start + match[0].length - 1
    for (; cursor < css.length; cursor += 1) {
      if (css[cursor] === '{') depth += 1
      else if (css[cursor] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    index = cursor + 1
  }
}

export function rawSafeAreaInsets(source: string): Array<string> {
  return [...source.matchAll(/env\(\s*safe-area-inset-\w+/g)].map((match) => match[0])
}

interface OpeningTag {
  name: string
  attributes: string
}

/**
 * Opening tags in a template, with their raw attribute text.
 *
 * A hand-rolled scan rather than a regex: an attribute value can contain `>`,
 * so matching to the first one is wrong, and the regex that is not wrong is
 * the kind `eslint-plugin-regexp` exists to reject.
 */
function openingTags(template: string): Array<OpeningTag> {
  const tags: Array<OpeningTag> = []
  let index = 0

  while (index < template.length) {
    const start = template.indexOf('<', index)
    if (start === -1) break

    if (template.startsWith('<!--', start)) {
      const end = template.indexOf('-->', start)
      index = end === -1 ? template.length : end + 3
      continue
    }

    const name = /^<([a-z][\w.-]*)/i.exec(template.slice(start, start + 64))
    if (!name) {
      index = start + 1
      continue
    }

    let cursor = start + name[0].length
    let quote: string | undefined
    while (cursor < template.length) {
      const character = template[cursor]
      if (quote !== undefined) {
        if (character === quote) quote = undefined
      } else if (character === '"' || character === "'") {
        quote = character
      } else if (character === '>') break
      cursor += 1
    }

    tags.push({ name: name[1], attributes: template.slice(start + name[0].length, cursor) })
    index = cursor + 1
  }

  return tags
}

/** Does this tag look like something a user taps? */
function isControl(attributes: string): boolean {
  return /@click\b|v-on:click\b/.test(attributes) || attributes.includes('type="button"')
}

/**
 * Both the static `class` and the `:class` binding, joined.
 *
 * A control routinely splits its states across the two — the tab bar keeps
 * the press transform in `class` and the active-route colours in `:class` —
 * so reading either alone reports a control that is fine as broken.
 */
function classText(attributes: string): string {
  return [...attributes.matchAll(/(?:^|\s):?class="([^"]*)"/g)].map((match) => match[1]).join(' ')
}

export function hoverOnlyControls(template: string): Array<string> {
  return openingTags(template)
    .filter((tag) => isControl(tag.attributes))
    .filter((tag) => {
      const classes = classText(tag.attributes)
      return classes.includes('hover:') && !classes.includes('active:')
    })
    .map((tag) => tag.name)
}

/** Controls that answer a press — what proves the rule above sees real input. */
export function pressableControls(template: string): Array<string> {
  return openingTags(template)
    .filter((tag) => isControl(tag.attributes) && classText(tag.attributes).includes('active:'))
    .map((tag) => tag.name)
}

function stripComments(source: string): string {
  return source.replaceAll(/<!--[\s\S]*?-->/g, ' ').replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
}

/** Quoted runs — every class list is one, in a template or in a cva table. */
function quotedStrings(source: string): Array<string> {
  return [...source.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)].map((match) => match[1] ?? match[2])
}

/**
 * A class string that writes padding-bottom twice: once through a `pb-*`
 * utility and once through `safe-area-bottom`. Equal specificity, so the
 * winner is generated-stylesheet order rather than author order — which is
 * how every sheet in the app came to have zero bottom padding. The floor
 * belongs in `[--safe-bottom-min:…]` instead.
 *
 * Scanned per quoted string rather than per line, and with comments stripped
 * first: the comment in DialogContent.vue that explains this very rule names
 * both tokens, and a line-level check reported it as the violation.
 */
export function paddingRacesTheInset(source: string): boolean {
  return quotedStrings(stripComments(source)).some(
    (text) => text.includes('safe-area-bottom') && /\bpb-[\w.[\]/-]+/.test(text),
  )
}

/**
 * A press state that cannot animate, because the transition names a property
 * that never changes.
 *
 * Tailwind v4 compiles `scale-90` to the standalone `scale` property, not to
 * `transform: scale(…)`. So `transition-[color,transform] active:scale-90`
 * transitions `transform` — which stays `none` throughout — and the press
 * snaps. The shorthand `transition-transform` is fine (it expands to
 * `transform, translate, scale, rotate`); an explicit bracket list has to say
 * `scale` itself.
 *
 * Found by driving a real browser, not by reading the CSS: both the computed
 * `transition-property` and the `active:` class were present and correct, and
 * only `getComputedStyle(el).scale` while the pointer was held showed that the
 * two never met.
 */
export function unanimatedPressStates(source: string): Array<string> {
  return quotedStrings(stripComments(source)).filter((text) => {
    if (!text.includes('active:scale-')) return false
    if (/transition-(?:transform|all)\b/.test(text)) return false

    const list = /transition-\[([^\]]*)\]/.exec(text)
    return list === null || !list[1].includes('scale')
  })
}

/**
 * Controls whose hover-only styling is deliberate, each with its reason —
 * the `A11Y_SKIPPED` idiom. An exemption with no justification is a hole with
 * a comment shape. Empty today, and kept so the next one has a home that
 * forces the reason to be written down.
 */
const HOVER_ONLY_ALLOWED: Readonly<Record<string, string>> = {}

// --- the rules ------------------------------------------------------------

describe('every environment value is clamped', () => {
  it('finds source files to check at all', () => {
    // A broken walk would make every assertion below vacuously true.
    expect(FILES.length).toBeGreaterThan(0)
    expect(FILES.some((file) => file.id === 'style.css')).toBe(true)
  })

  it('has no raw env(safe-area-inset-*) outside the clamped utilities', () => {
    const offenders = FILES.flatMap((file) => {
      const scannable =
        file.id === 'style.css' ? withoutSafeAreaUtilities(file.source) : file.source
      return rawSafeAreaInsets(scannable).map((raw) => `${file.id}: ${raw}…)`)
    })

    expect(
      offenders,
      `A bare env(safe-area-inset-*) resolves to 0 on every flat-bottomed phone, so it ships a\n` +
        `layout nobody tested. Use the clamped utilities in src/style.css —\n` +
        `safe-area-bottom / safe-area-top / safe-area-x — and pass the floor as\n` +
        `[--safe-bottom-min:…] or [--safe-top-min:…]:\n${list(offenders)}`,
    ).toEqual([])
  })

  it('keeps the clamped utilities themselves', () => {
    // The rule above passes trivially if the utilities are deleted along with
    // every call site, so name them.
    for (const utility of ['safe-area-bottom', 'safe-area-top', 'safe-area-x']) {
      expect(STYLES, `src/style.css no longer defines @utility ${utility}`).toContain(
        `@utility ${utility}`,
      )
    }
  })

  it('never lets a pb-* utility race safe-area-bottom', () => {
    const offenders = FILES.filter((file) => paddingRacesTheInset(file.source)).map(
      (file) => file.id,
    )

    expect(
      offenders,
      `Two utilities declaring padding-bottom at equal specificity hand the decision to\n` +
        `generated-stylesheet order. Drop the pb-* and pass the floor as\n` +
        `[--safe-bottom-min:…]:\n${list(offenders)}`,
    ).toEqual([])
  })
})

describe('new controls cannot ship hover-only', () => {
  const templates = FILES.filter((file) => file.id.endsWith('.vue'))

  it('sees controls that do answer a press', () => {
    // Otherwise the rule below is green because it found nothing to grade —
    // the a11yCoverage lesson.
    const pressable = templates.flatMap((file) => pressableControls(file.source))
    expect(pressable.length).toBeGreaterThan(0)
  })

  it('has no control with a hover: state and no active: state', () => {
    const offenders = templates.flatMap((file) =>
      hoverOnlyControls(file.source)
        .map((tag) => `${file.id}: <${tag}>`)
        .filter((id) => !(id in HOVER_ONLY_ALLOWED)),
    )

    expect(
      offenders,
      `Tailwind v4 gates hover: behind @media (hover: hover), so on a phone these styles never\n` +
        `fire and the control answers a tap with nothing. Add a press state (active:scale-…)\n` +
        `or, if mouse-only is deliberate, add it to HOVER_ONLY_ALLOWED with the\n` +
        `reason:\n${list(offenders)}`,
    ).toEqual([])
  })

  it('has no stale entries in the allowlist', () => {
    const present = new Set(
      templates.flatMap((file) =>
        hoverOnlyControls(file.source).map((tag) => `${file.id}: <${tag}>`),
      ),
    )
    const stale = Object.keys(HOVER_ONLY_ALLOWED).filter((id) => !present.has(id))

    expect(stale, `These controls no longer ship hover-only. Drop them:\n${list(stale)}`).toEqual(
      [],
    )
  })

  it('every press state can actually animate', () => {
    const offenders = FILES.flatMap((file) =>
      unanimatedPressStates(file.source).map((text) => `${file.id}: "${text.slice(0, 90)}…"`),
    )

    expect(
      offenders,
      `Tailwind v4 compiles scale-* to the standalone \`scale\` property, not to a transform.\n` +
        `A transition list naming \`transform\` animates something that never changes, so the\n` +
        `press snaps instead of easing. Name \`scale\` in the list, or use transition-transform:\n${list(offenders)}`,
    ).toEqual([])
  })

  it('the button base answers a press', () => {
    // The primitive every feature reaches for, and the one place a missing
    // active: would be invisible above — its variants live in a cva table in
    // the script block, not in a template. Contract: docs/ui-components.md.
    const base = readFileSync(`${SOURCE_ROOT}components/atoms/AtomButton.vue`, 'utf8')
    expect(base, 'the button base no longer carries a press state').toMatch(/active:scale-/)
    expect(base, 'the button base no longer suppresses double-tap zoom').toContain(
      'touch-manipulation',
    )
  })
})

describe('reduced motion is honored', () => {
  /**
   * A **presence check, not a behavioral one** — said out loud so nobody
   * reads it as more than it is. Asserting the guard actually suppresses an
   * animation needs `contextOptions: { reducedMotion: 'reduce' }`, i.e. a
   * second browser project; folding it into the `touch` tier would conflate
   * two conditions so a failure could not say which one it was. Not worth it
   * for one assertion today — a documented upgrade path rather than a silent
   * omission.
   */
  it('src/style.css carries a prefers-reduced-motion guard', () => {
    expect(
      STYLES,
      'we ship sheet keyframes and a press transform on every button and tab; a user who asked the OS for less motion asked for both',
    ).toContain('prefers-reduced-motion: reduce')
  })
})

// --- the rules catch what they claim to catch -----------------------------

describe('the checks reject a tree written the wrong way', () => {
  it('finds a raw env() outside a utility', () => {
    const css = `
@utility safe-area-bottom {
  padding-bottom: max(var(--safe-bottom-min, 0px), env(safe-area-inset-bottom));
}
.footer { padding-bottom: env(safe-area-inset-bottom); }
`
    expect(rawSafeAreaInsets(withoutSafeAreaUtilities(css))).toEqual(['env(safe-area-inset-bottom'])
  })

  it('does not flag the clamped utilities themselves', () => {
    const css = `
@utility safe-area-top {
  padding-top: max(var(--safe-top-min, 0px), env(safe-area-inset-top));
}
@utility safe-area-x {
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
`
    expect(rawSafeAreaInsets(withoutSafeAreaUtilities(css))).toEqual([])
  })

  it('finds a pb-* racing the inset', () => {
    expect(paddingRacesTheInset(`class="rounded-t-2xl px-4 pb-6 safe-area-bottom"`)).toBe(true)
    expect(
      paddingRacesTheInset(
        `class="rounded-t-2xl px-4 safe-area-bottom [--safe-bottom-min:1.5rem]"`,
      ),
    ).toBe(false)
  })

  it('does not read a comment about the rule as a violation of it', () => {
    // The comment in DialogContent.vue names both tokens to explain why they
    // are not written together. A line-level check reported it as the bug.
    expect(
      paddingRacesTheInset(`<!-- No \`pb-6\` beside \`safe-area-bottom\`: they race. -->
  <div class="px-4 safe-area-bottom [--safe-bottom-min:1.5rem]" />`),
    ).toBe(false)
  })

  it('finds a press state the transition list cannot animate', () => {
    // The exact string this file shipped before a browser walk caught it.
    expect(unanimatedPressStates(`class="transition-[color,transform] active:scale-90"`)).toEqual([
      'transition-[color,transform] active:scale-90',
    ])
    expect(unanimatedPressStates(`class="transition-[color,scale] active:scale-90"`)).toEqual([])
    // The shorthand expands to transform, translate, scale, rotate.
    expect(unanimatedPressStates(`class="transition-transform active:scale-95"`)).toEqual([])
    // A press state with no transition at all snaps just as hard.
    expect(unanimatedPressStates(`class="active:scale-95"`)).toEqual(['active:scale-95'])
  })

  it('finds a control that ships hover-only', () => {
    const template = `<template>
  <button type="button" class="rounded-md hover:bg-accent">Tap</button>
</template>`
    expect(hoverOnlyControls(template)).toEqual(['button'])
  })

  it('reads the static class and the :class binding as one', () => {
    // The tab bar's shape: the press transform is static, the hover colour is
    // bound. Reading either alone would report it as hover-only.
    const template = `<template>
  <button
    type="button"
    class="flex active:scale-90"
    :class="isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'"
    @click="go()"
  >Tab</button>
</template>`
    expect(hoverOnlyControls(template)).toEqual([])
    expect(pressableControls(template)).toEqual(['button'])
  })

  it('is not confused by a > inside an attribute value', () => {
    const template = `<template>
  <button type="button" :class="count > 3 ? 'hover:bg-accent' : ''">Tap</button>
</template>`
    expect(hoverOnlyControls(template)).toEqual(['button'])
  })

  it('ignores an element nobody taps', () => {
    const template = `<template><div class="hover:bg-accent">Not a control</div></template>`
    expect(hoverOnlyControls(template)).toEqual([])
  })

  it('ignores a commented-out control', () => {
    const template = `<template>
  <!-- <button type="button" class="hover:bg-accent">Old</button> -->
</template>`
    expect(hoverOnlyControls(template)).toEqual([])
  })
})

function list(items: ReadonlyArray<string>): string {
  return items.map((item) => `  - ${item}`).join('\n')
}
