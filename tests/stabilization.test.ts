import { describe, it, expect, beforeAll, beforeEach } from 'vitest'

/**
 * End-to-end checks for the stabilization fixes: suspended accounts, task
 * assignee validation, project progress, and report cleanup on project
 * delete. Needs a running server + DB like the other suites in this folder
 * (it skips, not fails, when the server or seed admin is missing).
 */

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
const PASSWORD = 'password123'
// Override with TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD to use any existing admin.
const SEED_ADMIN = {
  email: process.env.TEST_ADMIN_EMAIL ?? 'test@example.com',
  password: process.env.TEST_ADMIN_PASSWORD ?? PASSWORD,
}

let serverUp = false
let adminToken = ''
let leaderToken = ''
let devToken = ''
let devId = ''
let outsiderId = ''
let projectId = ''
let teamId = ''

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

const post = (path: string, body: unknown, token?: string) =>
  api(path, { method: 'POST', body: JSON.stringify(body) }, token)
const put = (path: string, body: unknown, token?: string) =>
  api(path, { method: 'PUT', body: JSON.stringify(body) }, token)

async function createUser(name: string, email: string, role: string) {
  const created = await post('/api/admin/users', { name, email, password: PASSWORD, role }, adminToken)
  const { user } = await created.json()
  const login = await post('/api/auth/login', { email, password: PASSWORD })
  const body = await login.json()
  return { id: user._id as string, email, token: body.token as string, refreshToken: body.refreshToken as string }
}

// Gate at run time (describe.runIf is evaluated before beforeAll, so it cannot
// see whether the server turned out to be reachable).
beforeEach((ctx) => {
  if (!serverUp || !adminToken) ctx.skip()
})

beforeAll(async () => {
  try {
    await fetch(`${BASE}/api/auth/login`, { method: 'POST' })
    serverUp = true
  } catch {
    console.warn(`\n  [skip] no server at ${BASE} — run "npm run dev" first\n`)
    return
  }

  const adminLogin = await post('/api/auth/login', SEED_ADMIN)
  adminToken = (await adminLogin.json()).token ?? ''
  if (!adminToken) return

  const stamp = Date.now()
  const leader = await createUser('Stab Leader', `stab-leader-${stamp}@test.local`, 'team_leader')
  const dev = await createUser('Stab Dev', `stab-dev-${stamp}@test.local`, 'developer')
  const outsider = await createUser('Stab Outsider', `stab-out-${stamp}@test.local`, 'developer')
  leaderToken = leader.token
  devToken = dev.token
  devId = dev.id
  outsiderId = outsider.id

  const team = await post(
    '/api/admin/teams',
    { name: `Stab Team ${stamp}`, teamLeaderId: leader.id, memberIds: [dev.id] },
    adminToken
  )
  teamId = (await team.json()).team._id

  const created = await post('/api/projects', { title: `Stab Project ${stamp}`, teamId }, adminToken)
  projectId = (await created.json()).project._id
}, 30_000)

describe('suspended accounts', () => {
  it('active user logs in and refreshes; suspended user can do neither, and loses API access at once', async () => {
    const stamp = Date.now()
    const user = await createUser('Susp', `susp-${stamp}@test.local`, 'developer')
    expect(user.token).toBeTruthy()

    const okRefresh = await post('/api/auth/refresh-token', { refreshToken: user.refreshToken })
    expect(okRefresh.status).toBe(200)
    expect((await api('/api/projects', {}, user.token)).status).toBe(200)

    const suspend = await put(`/api/admin/users/${user.id}`, { status: 'suspended' }, adminToken)
    expect(suspend.status).toBe(200)

    // The access token they already hold stops working immediately.
    expect((await api('/api/projects', {}, user.token)).status).toBe(401)
    expect((await api('/api/auth/me', {}, user.token)).status).toBe(401)

    const refresh = await post('/api/auth/refresh-token', { refreshToken: user.refreshToken })
    expect(refresh.status).toBe(401)

    const login = await post('/api/auth/login', { email: user.email, password: PASSWORD })
    expect(login.status).toBe(403)
    expect((await login.json()).token).toBeUndefined()

    // Reinstating restores access.
    await put(`/api/admin/users/${user.id}`, { status: 'active' }, adminToken)
    expect((await post('/api/auth/login', { email: user.email, password: PASSWORD })).status).toBe(200)
  })
})

describe('task assignment validation', () => {
  it('assigns a project member, rejects a non-member and a malformed id', async () => {
    const ok = await post(
      `/api/projects/${projectId}/tasks`,
      { title: 'Member task', assignedTo: devId },
      leaderToken
    )
    expect(ok.status).toBe(201)
    const taskId = (await ok.json()).task._id

    const notMember = await post(
      `/api/projects/${projectId}/tasks`,
      { title: 'Outsider task', assignedTo: outsiderId },
      leaderToken
    )
    expect(notMember.status).toBe(400)

    const malformed = await post(
      `/api/projects/${projectId}/tasks`,
      { title: 'Bad id task', assignedTo: 'not-an-id' },
      leaderToken
    )
    expect(malformed.status).toBe(400)
    expect((await malformed.json()).details).toBeDefined()

    // Reassignment follows the same rule.
    expect((await put(`/api/tasks/${taskId}`, { assignedTo: outsiderId }, leaderToken)).status).toBe(400)
    expect((await put(`/api/tasks/${taskId}`, { assignedTo: 'nope' }, leaderToken)).status).toBe(400)
    expect((await put(`/api/tasks/${taskId}`, { assignedTo: devId }, leaderToken)).status).toBe(200)
  })

  it('keeps the existing role rules: a developer still cannot create or edit tasks', async () => {
    expect((await post(`/api/projects/${projectId}/tasks`, { title: 'Dev task' }, devToken)).status).toBe(403)
  })
})

describe('project progress', () => {
  it('follows create, complete, reopen and delete', async () => {
    // Fresh project so earlier tests do not affect the arithmetic.
    const created = await post('/api/projects', { title: `Progress ${Date.now()}`, teamId }, adminToken)
    const pid = (await created.json()).project._id
    const progress = async () =>
      (await (await api(`/api/projects/${pid}`, {}, adminToken)).json()).project.progress as number

    expect(await progress()).toBe(0)

    const t1 = (await (await post(`/api/projects/${pid}/tasks`, { title: 'One' }, leaderToken)).json()).task._id
    await post(`/api/projects/${pid}/tasks`, { title: 'Two' }, leaderToken)
    expect(await progress()).toBe(0)

    await put(`/api/tasks/${t1}/status`, { status: 'complete' }, leaderToken)
    expect(await progress()).toBe(50)

    // A new task changes the ratio even though no status moved.
    await post(`/api/projects/${pid}/tasks`, { title: 'Three' }, leaderToken)
    expect(await progress()).toBe(33)

    await put(`/api/tasks/${t1}/status`, { status: 'in-progress' }, leaderToken)
    expect(await progress()).toBe(0)

    await put(`/api/tasks/${t1}/status`, { status: 'complete' }, leaderToken)
    await api(`/api/tasks/${t1}`, { method: 'DELETE' }, leaderToken)
    expect(await progress()).toBe(0)
  })
})

describe('project deletion', () => {
  it('removes that project’s reports and leaves other projects’ reports alone', async () => {
    const stamp = Date.now()
    const a = (await (await post('/api/projects', { title: `Del A ${stamp}`, teamId }, adminToken)).json()).project._id
    const b = (await (await post('/api/projects', { title: `Del B ${stamp}`, teamId }, adminToken)).json()).project._id

    expect((await post(`/api/projects/${a}/reports`, { note: 'a' }, leaderToken)).status).toBe(201)
    expect((await post(`/api/projects/${b}/reports`, { note: 'b' }, leaderToken)).status).toBe(201)

    const feedBefore = await (await api('/api/admin/reports?limit=100', {}, adminToken)).json()
    const forProject = (id: string) =>
      feedBefore.reports.filter((r: any) => (r.project?._id ?? r.project) === id).length
    expect(forProject(a)).toBe(1)

    expect((await api(`/api/projects/${a}`, { method: 'DELETE' }, adminToken)).status).toBe(200)

    const feedAfter = await (await api('/api/admin/reports?limit=100', {}, adminToken)).json()
    const remaining = (id: string) =>
      feedAfter.reports.filter((r: any) => (r.project?._id ?? r.project) === id).length
    expect(remaining(a)).toBe(0)
    expect(remaining(b)).toBe(1)
    // No report is left pointing at a project that no longer exists.
    expect(feedAfter.reports.some((r: any) => r.project === null)).toBe(false)
  })
})

describe('validation error shape', () => {
  it('uses { error, details } on routes that previously differed', async () => {
    for (const res of [
      await post('/api/projects', { title: 'x' }, adminToken),
      await post('/api/admin/users', { name: 'x' }, adminToken),
      await post('/api/auth/login', { email: 'bad' }),
    ]) {
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('Validation failed')
      expect(Array.isArray(body.details)).toBe(true)
    }
  })
})
