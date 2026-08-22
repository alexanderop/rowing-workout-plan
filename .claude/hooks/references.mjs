#!/usr/bin/env node
// SessionStart hook — project references, modelled on OpenCode's `references`.
//
// Reads .claude/references.json (committed) merged with
// .claude/references.local.json (gitignored, yours), materializes any
// `repository` entry into the reference root, and injects the resolved paths
// and descriptions into the session as `additionalContext` — so an agent knows
// the tree exists and when to read it without being told each time.
//
// Runs under both Claude Code (.claude/settings.json) and Codex
// (.codex/hooks.json), which share this hook's wire format: the same stdin
// payload in, the same `hookSpecificOutput.additionalContext` out. Nothing here
// may assume either one — notably $CLAUDE_PROJECT_DIR, which only Claude Code
// sets — so the project root is found by walking up from the session cwd, which
// under Codex can be any subdirectory of the repository.
//
// Only entries with a `description` are advertised, same rule as OpenCode.
// An entry without one is still resolved and cloned, just not announced.
//
// Reference root is ~/Projects/opensource, overridable with
// CLAUDE_REFERENCES_ROOT. It must also be granted in
// permissions.additionalDirectories or the paths are advertised but unreadable.

import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join, isAbsolute, resolve, dirname } from 'node:path'

const HOME = homedir()
const expandHome = (value) => (value.startsWith('~') ? join(HOME, value.slice(1)) : value)
const ROOT = expandHome(process.env.CLAUDE_REFERENCES_ROOT ?? '~/Projects/opensource')

const readJson = (file) => {
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

// `"docs": "../docs"` and `"effect": "Effect-TS/effect"` are both legal.
// A leading . / or ~ means filesystem; anything else is a repository.
const normalize = (value) =>
  typeof value !== 'string'
    ? (value ?? {})
    : /^[.~/]/.test(value)
      ? { path: value }
      : { repository: value }

// Accepts owner/repo, host/path, and full git URLs.
const cloneUrl = (repository) =>
  /^(?:https?:|git@|ssh:|file:)/.test(repository)
    ? repository
    : `https://github.com/${repository}.git`

// Detached, output discarded, unref'd — session start never waits on git.
const detach = (args, cwd) => {
  spawn('git', args, { cwd, detached: true, stdio: 'ignore' }).unref()
}

// The session cwd is the project root under Claude Code, but only somewhere
// inside it under Codex. The registry is what we are actually looking for, so
// climb until one turns up; a session started outside a project falls back to
// its own cwd and finds nothing to advertise.
const CONFIG_DIR = '.claude'
const findConfigDir = (from) => {
  for (let dir = from, parent; ; dir = parent) {
    const candidate = join(dir, CONFIG_DIR)
    if (
      existsSync(join(candidate, 'references.json')) ||
      existsSync(join(candidate, 'references.local.json'))
    ) {
      return candidate
    }
    parent = dirname(dir)
    if (parent === dir) return join(from, CONFIG_DIR)
  }
}

const main = () => {
  let input = {}
  try {
    input = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    /* no stdin — fall back to cwd */
  }
  const configDir = findConfigDir(input.cwd ?? process.cwd())
  const projectDir = dirname(configDir)

  const merged = {
    ...readJson(join(configDir, 'references.json')),
    ...readJson(join(configDir, 'references.local.json')),
  }

  const resolved = []
  for (const [name, raw] of Object.entries(merged)) {
    if (!name || /[/\s`,]/.test(name)) continue // OpenCode's alias rules
    const entry = normalize(raw)

    if (entry.path) {
      const expanded = expandHome(entry.path)
      const path = isAbsolute(expanded) ? expanded : resolve(projectDir, expanded)
      resolved.push({ name, path, description: entry.description, ready: existsSync(path) })
      continue
    }

    if (!entry.repository) continue
    const path = join(ROOT, name)
    const ready = existsSync(join(path, '.git'))

    if (!ready) {
      mkdirSync(ROOT, { recursive: true })
      const args = ['clone', '--filter=blob:none']
      if (entry.branch) args.push('--branch', entry.branch)
      detach([...args, cloneUrl(entry.repository), path], ROOT)
    } else if (entry.refresh !== false) {
      // Fetch only. Remote refs move, the working tree does not, so a
      // pinned/<version> checkout survives. Pulling is opt-in per entry.
      detach(entry.pull === true ? ['pull', '--ff-only', '--quiet'] : ['fetch', '--quiet'], path)
    }

    resolved.push({ name, path, description: entry.description, ready })
  }

  const advertised = resolved
    .filter((r) => r.description)
    .sort((a, b) => a.name.localeCompare(b.name))

  if (advertised.length === 0) return

  const block = [
    'Project references are read-only source trees checked out outside this repository.',
    "Read them instead of guessing a library's API from training data. Never edit one —",
    'the working directory is this project, not the reference.',
    '<available_references>',
    ...advertised.flatMap((r) => [
      '  <reference>',
      `    <name>${r.name}</name>`,
      `    <path>${r.path}</path>`,
      `    <description>${r.description}</description>`,
      ...(r.ready ? [] : ['    <status>cloning in background — not readable yet</status>']),
      '  </reference>',
    ]),
    '</available_references>',
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
  process.exit(0) // a broken reference config must never break a session
}
