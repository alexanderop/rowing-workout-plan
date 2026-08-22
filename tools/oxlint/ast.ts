/**
 * Print the AST oxlint hands a rule, for one snippet.
 *
 *   pnpm ast "const x = y as User"
 *   pnpm ast "$(cat some-file.ts)" TSAsExpression
 *
 * With a node type as the second argument, only nodes of that type are
 * printed; without one, every node type the visitor sees, in source order.
 * This is the only reliable way to learn what a rule has to match — the
 * TypeScript nodes are ESTree by convention, not by specification, and the
 * `@oxlint/plugins` types describe them but do not show them applied to code.
 * See docs/oxlint-rules.md.
 */
import { defineRule } from '@oxlint/plugins'
import { RuleTester } from 'oxlint/plugins-dev'

const [code, only] = process.argv.slice(2)

if (code === undefined) {
  console.error('usage: pnpm ast "<code>" [NodeType]')
  process.exit(1)
}

const seen: Array<string> = []

const probe = defineRule({
  meta: { type: 'problem', messages: { never: 'never' } },
  createOnce() {
    return {
      '*'(node) {
        if (only !== undefined && node.type !== only) return
        seen.push(
          only === undefined
            ? node.type
            : `${node.type}\n${JSON.stringify(node, replaceCircular(), 2)}`,
        )
      },
    }
  },
})

/** `parent` back-references make the tree cyclic; print the parent's type only. */
function replaceCircular() {
  const stack = new WeakSet<object>()
  return (key: string, value: unknown): unknown => {
    if (key === 'parent') return value === null ? null : `<${(value as { type: string }).type}>`
    if (typeof value === 'object' && value !== null) {
      if (stack.has(value)) return '<circular>'
      stack.add(value)
    }
    return value
  }
}

new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } }).run('ast/probe', probe, {
  valid: [code],
  invalid: [],
})

console.log(seen.join('\n'))
