import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import packageJson from '../package.json' with { type: 'json' }

interface VersionInfo {
  readonly version: string
  readonly tag: string | null
  readonly commit: string
  readonly buildTime: string
}

const ROOT = fileURLToPath(new URL('../', import.meta.url))

function git(...args: ReadonlyArray<string>): string {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

function getGitInfo(): Pick<VersionInfo, 'tag' | 'commit'> {
  try {
    const commit = git('rev-parse', '--short=12', 'HEAD')

    try {
      return { tag: git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*'), commit }
    } catch {
      return { tag: null, commit }
    }
  } catch {
    // Source archives and some deployment builders do not include .git.
    // The package version remains useful there, and the UI says explicitly
    // that the commit is unknown instead of failing the build.
    return { tag: null, commit: 'unknown' }
  }
}

/** Bakes immutable build provenance into every app bundle. */
export function versionPlugin(overrides: Partial<VersionInfo> = {}): Plugin {
  return {
    name: 'app-version',

    config() {
      const gitInfo = getGitInfo()
      const versionInfo: VersionInfo = {
        version: packageJson.version,
        tag: gitInfo.tag,
        commit: gitInfo.commit,
        buildTime: new Date().toISOString(),
        ...overrides,
      }

      return {
        define: {
          'import.meta.env.APP_VERSION': JSON.stringify(versionInfo.version),
          'import.meta.env.APP_TAG': JSON.stringify(versionInfo.tag),
          'import.meta.env.APP_COMMIT': JSON.stringify(versionInfo.commit),
          'import.meta.env.APP_BUILD_TIME': JSON.stringify(versionInfo.buildTime),
        },
      }
    },
  }
}
