import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Keeps the frontend / backend split honest. This is one Next.js app, so the
 * compiler will happily let a component import a Mongoose model — this test
 * is what stops that.
 *
 *   browser code  → src/app (pages), components, features, hooks, services, store
 *   server code   → src/app/api, src/lib (everything except roles)
 *   shared        → src/types, src/lib/roles.ts
 */

const SRC = path.resolve(__dirname)

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return listFiles(full)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : []
  })
}

function importsOf(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8')
  const found: string[] = []
  for (const match of source.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)) found.push(match[1])
  return found
}

const rel = (file: string) => path.relative(SRC, file).replace(/\\/g, '/')
const isApiRoute = (file: string) => rel(file).startsWith('app/api/')

const browserFiles = [
  ...listFiles(path.join(SRC, 'app')).filter((f) => !isApiRoute(f)),
  ...listFiles(path.join(SRC, 'components')),
  ...listFiles(path.join(SRC, 'features')),
  ...listFiles(path.join(SRC, 'hooks')),
  ...listFiles(path.join(SRC, 'services')),
  ...listFiles(path.join(SRC, 'store')),
]

const serverFiles = [
  ...listFiles(path.join(SRC, 'app', 'api')),
  ...listFiles(path.join(SRC, 'lib')).filter((f) => rel(f) !== 'lib/roles.ts'),
]

// What browser code must never reach.
const SERVER_ONLY = [
  /^mongoose$/,
  /^mongodb$/,
  /^jsonwebtoken$/,
  /^bcryptjs$/,
  /^@\/lib\/(db|auth|services|realtime|validation)(\/|$)/,
]

// What server code must never reach.
const BROWSER_ONLY = [/^@\/(components|features|hooks|services|store)(\/|$)/, /^react(-dom)?$/]

describe('frontend / backend boundary', () => {
  it('finds the code it is meant to check', () => {
    expect(browserFiles.length).toBeGreaterThan(20)
    expect(serverFiles.length).toBeGreaterThan(20)
  })

  it('browser code never imports database, auth or server-service modules', () => {
    const violations = browserFiles.flatMap((file) =>
      importsOf(file)
        .filter((spec) => SERVER_ONLY.some((pattern) => pattern.test(spec)))
        .map((spec) => `${rel(file)} imports ${spec}`)
    )
    expect(violations).toEqual([])
  })

  it('server code never imports UI, hooks or browser API clients', () => {
    const violations = serverFiles.flatMap((file) =>
      importsOf(file)
        .filter((spec) => BROWSER_ONLY.some((pattern) => pattern.test(spec)))
        .map((spec) => `${rel(file)} imports ${spec}`)
    )
    expect(violations).toEqual([])
  })

  it('route handlers use the shared body parser instead of request.json() directly', () => {
    const offenders = listFiles(path.join(SRC, 'app', 'api'))
      .filter((file) => /request\.json\(\)/.test(fs.readFileSync(file, 'utf8')))
      .map(rel)
    expect(offenders).toEqual([])
  })
})
