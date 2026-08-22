#!/usr/bin/env node
// SessionStart hook — inject the knowledge bundle index into every session.
//
// `docs/index.md` is this project's entry point for coding agents: it holds the
// rules and links out to one concept file per topic. Injecting it verbatim is
// what replaces a CLAUDE.md/AGENTS.md — the file agents read is the same file
// humans read on GitHub, so there is only one copy of the conventions.
//
// Registered for `clear` and `compact` as well as `startup|resume`, because
// injected context is part of the conversation: without those, the rules
// disappear the first time the session compacts.
//
// Runs under both Claude Code (.claude/settings.json) and Codex
// (.codex/hooks.json), which share this hook's wire format: the same stdin
// payload in, the same `hookSpecificOutput.additionalContext` out. Nothing here
// may assume either one — notably $CLAUDE_PROJECT_DIR, which only Claude Code
// sets — so the entry doc is found by walking up from the session cwd, which
// under Codex can be any subdirectory of the repository.

import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'

const ENTRY = process.env.CLAUDE_PROJECT_DOC ?? 'docs/index.md'

// The session cwd is the project root under Claude Code, but only somewhere
// inside it under Codex. Climb until the entry doc turns up; a session started
// outside a project finds nothing and stays silent.
const findProjectDir = (from) => {
  for (let dir = from, parent; ; dir = parent) {
    if (existsSync(join(dir, ENTRY))) return dir
    parent = dirname(dir)
    if (parent === dir) return null
  }
}

// OKF frontmatter is for consumers of the bundle, not for the reader.
const stripFrontmatter = (text) =>
  text.startsWith('---\n') ? text.slice(text.indexOf('\n---\n', 3) + 5) : text

const main = () => {
  let input = {}
  try {
    input = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    /* no stdin — fall back to cwd */
  }

  const projectDir = findProjectDir(input.cwd ?? process.cwd())
  if (!projectDir) return

  const entry = join(projectDir, ENTRY)
  const body = stripFrontmatter(readFileSync(entry, 'utf8')).trim()
  if (!body) return

  const block = [
    `The contents of ${ENTRY} follow, injected verbatim. It is this project's entry`,
    'point: it holds the rules, and links one concept file per topic for the reasoning',
    'behind them. Follow a link before working in the area it covers — do not read the',
    `documentation tree top to bottom. The project root is ${projectDir}; source paths`,
    `are relative to it, markdown links are relative to ${dirname(entry)}.`,
    `<project_knowledge path="${ENTRY}">`,
    body,
    '</project_knowledge>',
  ].join('\n')

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: block },
    }),
  )
}

try {
  main()
} catch {
  process.exit(0) // a broken doc tree must never break a session
}
