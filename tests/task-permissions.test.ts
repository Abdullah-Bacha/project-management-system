import { describe, it, expect, beforeAll, beforeEach } from 'vitest'

/**
 * End-to-end checks for the developer/team-leader task split: a team_leader
 * plans and assigns work (create/edit/delete tasks), a developer only ever
 * moves a task that's assigned to them and leaves comments as feedback.
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
let projectId = ''
let devTaskId = '' // assigned to the developer
let leaderTaskId = '' // not assigned to the developer

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

async function createUser(name: string, email: string, role: string) {
  const created = await api(
    '/api/admin/users',
    { method: 'POST', body: JSON.stringify({ name, email, password: PASSWORD, role }) },
    adminToken
  )
  const { user } = await created.json()
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const { token } = await login.json()
  return { id: user._id as string, token: token as string }
}

// Skip (not fail) when there is no server or no admin to sign in as. This must
// happen per test: describe.runIf() is evaluated before beforeAll can run.
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

  const adminLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(SEED_ADMIN),
  })
  adminToken = (await adminLogin.json()).token ?? ''
  if (!adminToken) return

  const stamp = Date.now()
  const leader = await createUser('Perm Leader', `perm-leader-${stamp}@test.local`, 'team_leader')
  const dev = await createUser('Perm Dev', `perm-dev-${stamp}@test.local`, 'developer')
  leaderToken = leader.token
  devToken = dev.token
  devId = dev.id

  const team = await api(
    '/api/admin/teams',
    {
      method: 'POST',
      body: JSON.stringify({
        name: `Perm Team ${stamp}`,
        teamLeaderId: leader.id,
        memberIds: [dev.id],
      }),
    },
    adminToken
  )
  const teamId = (await team.json()).team._id

  const project = await api(
    '/api/projects',
    { method: 'POST', body: JSON.stringify({ title: `Perm Project ${stamp}`, teamId }) },
    adminToken
  )
  projectId = (await project.json()).project._id

  // Leader creates two tasks: one assigned to the developer, one not.
  const t1 = await api(
    `/api/projects/${projectId}/tasks`,
    { method: 'POST', body: JSON.stringify({ title: 'Assigned to dev', assignedTo: devId }) },
    leaderToken
  )
  devTaskId = (await t1.json()).task._id

  const t2 = await api(
    `/api/projects/${projectId}/tasks`,
    { method: 'POST', body: JSON.stringify({ title: 'Not assigned to dev' }) },
    leaderToken
  )
  leaderTaskId = (await t2.json()).task._id
}, 30_000)

describe('team leader plans, developer executes', () => {
  it('leader could create tasks in setup (sanity)', () => {
    expect(devTaskId).not.toBe('')
    expect(leaderTaskId).not.toBe('')
  })

  it('developer cannot create a task', async () => {
    const res = await api(
      `/api/projects/${projectId}/tasks`,
      { method: 'POST', body: JSON.stringify({ title: 'Dev tries to create' }) },
      devToken
    )
    expect(res.status).toBe(403)
  })

  it('developer cannot fully edit a task, even their own', async () => {
    const res = await api(
      `/api/tasks/${devTaskId}`,
      { method: 'PUT', body: JSON.stringify({ title: 'Renamed by dev' }) },
      devToken
    )
    expect(res.status).toBe(403)
  })

  it('developer cannot delete a task', async () => {
    const res = await api(`/api/tasks/${devTaskId}`, { method: 'DELETE' }, devToken)
    expect(res.status).toBe(403)
  })

  it('developer cannot move a task NOT assigned to them', async () => {
    const res = await api(
      `/api/tasks/${leaderTaskId}/status`,
      { method: 'PUT', body: JSON.stringify({ status: 'in-progress' }) },
      devToken
    )
    expect(res.status).toBe(403)
  })

  it('developer CAN move a task assigned to them', async () => {
    const res = await api(
      `/api/tasks/${devTaskId}/status`,
      { method: 'PUT', body: JSON.stringify({ status: 'in-progress' }) },
      devToken
    )
    expect(res.status).toBe(200)
  })

  it('developer CAN comment — their feedback channel', async () => {
    const res = await api(
      `/api/tasks/${devTaskId}/comments`,
      { method: 'POST', body: JSON.stringify({ text: 'Working on it' }) },
      devToken
    )
    expect(res.status).toBe(201)
  })

  it('team leader can move any task in the project', async () => {
    const res = await api(
      `/api/tasks/${leaderTaskId}/status`,
      { method: 'PUT', body: JSON.stringify({ status: 'in-progress' }) },
      leaderToken
    )
    expect(res.status).toBe(200)
  })

  it('team leader can fully edit a task', async () => {
    const res = await api(
      `/api/tasks/${leaderTaskId}`,
      { method: 'PUT', body: JSON.stringify({ priority: 'high' }) },
      leaderToken
    )
    expect(res.status).toBe(200)
  })
})
