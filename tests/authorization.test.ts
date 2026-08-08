import { describe, it, expect, beforeAll } from 'vitest'

/**
 * End-to-end authorization checks against a running dev server.
 *
 * These assert the property that matters: a signed-in user who is not a
 * member of a project cannot read or mutate anything inside it. They run
 * against real HTTP and a real database, so start the server first:
 *
 *   npm run dev
 *   npm test
 *
 * Registration is closed — every account here is provisioned by an admin
 * via /api/admin/users, the same way a real deployment would onboard
 * someone. If the server is not reachable, or no admin account exists, the
 * suite skips rather than fails, so it never blocks a run that only cares
 * about the unit tests.
 */

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
const PASSWORD = 'password123'
// Seeded/promoted by hand during development — see the project's admin setup notes.
const SEED_ADMIN = { email: 'test@example.com', password: PASSWORD }

let serverUp = false
let adminToken = ''
let strangerToken = ''
let projectId = ''
let taskId = ''

async function api(path: string, init: RequestInit = {}, token?: string) {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...init.headers,
    },
  })
}

/** Admin provisions a fresh developer account and returns its session token. */
async function createDeveloper(name: string, email: string) {
  await api(
    '/api/admin/users',
    { method: 'POST', body: JSON.stringify({ name, email, password: PASSWORD, role: 'developer' }) },
    adminToken
  )
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  return (await login.json()).token as string
}

beforeAll(async () => {
  try {
    await fetch(`${BASE}/api/auth/login`, { method: 'POST' })
    serverUp = true
  } catch {
    console.warn(`\n  [skip] no server at ${BASE} — run "npm run dev" first\n`)
    return
  }

  const adminLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(SEED_ADMIN),
  })
  adminToken = (await adminLogin.json()).token ?? ''
  if (!adminToken) return // downstream tests report the failure clearly

  const stamp = Date.now()
  strangerToken = await createDeveloper('Auth Stranger', `stranger-${stamp}@test.local`)

  const project = await api(
    '/api/projects',
    {
      method: 'POST',
      body: JSON.stringify({
        title: `Authorization fixture ${stamp}`,
        description: 'Created by the authorization test suite',
      }),
    },
    adminToken
  )
  projectId = (await project.json()).project._id

  const task = await api(
    `/api/projects/${projectId}/tasks`,
    { method: 'POST', body: JSON.stringify({ title: 'Fixture task' }) },
    adminToken
  )
  taskId = (await task.json()).task._id
}, 30_000) // Turbopack lazily compiles each route on first hit; a cold dev server can be slow here.

describe.runIf(() => serverUp)('a non-member is denied', () => {
  const denied = (status: number) => status === 403 || status === 404

  it('cannot read the project', async () => {
    const res = await api(`/api/projects/${projectId}`, {}, strangerToken)
    expect(denied(res.status)).toBe(true)
  })

  it('cannot list its tasks', async () => {
    const res = await api(`/api/projects/${projectId}/tasks`, {}, strangerToken)
    expect(denied(res.status)).toBe(true)
  })

  it('cannot list its members', async () => {
    const res = await api(`/api/projects/${projectId}/members`, {}, strangerToken)
    expect(denied(res.status)).toBe(true)
  })

  it('cannot read its analytics', async () => {
    const res = await api(`/api/projects/${projectId}/analytics`, {}, strangerToken)
    expect(denied(res.status)).toBe(true)
  })

  it('cannot create a task in it', async () => {
    const res = await api(
      `/api/projects/${projectId}/tasks`,
      { method: 'POST', body: JSON.stringify({ title: 'intrusion attempt' }) },
      strangerToken
    )
    expect(denied(res.status)).toBe(true)
  })

  it('cannot change a task status', async () => {
    const res = await api(
      `/api/tasks/${taskId}/status`,
      { method: 'PUT', body: JSON.stringify({ status: 'complete' }) },
      strangerToken
    )
    expect(denied(res.status)).toBe(true)
  })

  it('cannot edit a task', async () => {
    const res = await api(
      `/api/tasks/${taskId}`,
      { method: 'PUT', body: JSON.stringify({ title: 'hijacked' }) },
      strangerToken
    )
    expect(denied(res.status)).toBe(true)
  })

  it('cannot read or post comments', async () => {
    const read = await api(`/api/tasks/${taskId}/comments`, {}, strangerToken)
    expect(denied(read.status)).toBe(true)

    const write = await api(
      `/api/tasks/${taskId}/comments`,
      { method: 'POST', body: JSON.stringify({ text: 'hello' }) },
      strangerToken
    )
    expect(denied(write.status)).toBe(true)
  })

  it('cannot delete the task', async () => {
    const res = await api(`/api/tasks/${taskId}`, { method: 'DELETE' }, strangerToken)
    expect(denied(res.status)).toBe(true)
  })

  it('cannot delete the project', async () => {
    const res = await api(`/api/projects/${projectId}`, { method: 'DELETE' }, strangerToken)
    expect(denied(res.status)).toBe(true)
  })

  it('cannot create a project at all — creation is admin-only', async () => {
    const res = await api(
      '/api/projects',
      { method: 'POST', body: JSON.stringify({ title: `Stranger project ${Date.now()}` }) },
      strangerToken
    )
    expect(res.status).toBe(403)
  })
})

describe.runIf(() => serverUp)('the owning admin retains access', () => {
  it('reads the project', async () => {
    const res = await api(`/api/projects/${projectId}`, {}, adminToken)
    expect(res.status).toBe(200)
  })

  it('reads its tasks', async () => {
    const res = await api(`/api/projects/${projectId}/tasks`, {}, adminToken)
    expect(res.status).toBe(200)
  })

  it('edits a task', async () => {
    const res = await api(
      `/api/tasks/${taskId}`,
      { method: 'PUT', body: JSON.stringify({ title: 'Fixture task, renamed' }) },
      adminToken
    )
    expect(res.status).toBe(200)
  })
})

describe.runIf(() => serverUp)('unauthenticated access', () => {
  it('is rejected without a token', async () => {
    const res = await api(`/api/projects/${projectId}`)
    expect(res.status).toBe(401)
  })

  it('is rejected with a forged token', async () => {
    // The signature secret used to be hardcoded in the source; a token signed
    // with that published string must no longer be accepted.
    const forged =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      'eyJ1c2VySWQiOiI2YTc1ZTMwZGFlMmEwMDU3NWRkZDdhNWEiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJyb2xlIjoiYWRtaW4ifQ.' +
      'invalid-signature'
    const res = await api('/api/projects', {}, forged)
    expect(res.status).toBe(401)
  })

  it('the public registration endpoint no longer exists', async () => {
    const res = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'x',
        email: `nope-${Date.now()}@test.local`,
        password: PASSWORD,
        confirmPassword: PASSWORD,
      }),
    })
    expect(res.status).toBe(404)
  })
})
