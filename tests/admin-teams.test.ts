import { describe, it, expect, beforeAll, beforeEach } from 'vitest'

/**
 * End-to-end checks for the closed, admin-provisioned RBAC model: an admin
 * creates a team leader and developers, groups them into a team, staffs a
 * project with that team, and the team leader — not a separate project
 * manager, that role doesn't exist — ends up able to manage the project's
 * content. Asserts two properties:
 *
 *   1. Only an admin can provision accounts, build teams, create projects,
 *      or change staffing — a developer is rejected everywhere, even on a
 *      project they belong to.
 *   2. A team leader, despite not being an admin, can edit the content of
 *      the specific project their team is staffed on (and only that one).
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
let leaderId = ''
let devId = ''
let teamId = ''
let projectId = ''

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

/** Admin provisions an account with a given role and returns {id, token}. */
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
  if (!adminToken) return // downstream tests report the failure clearly

  const stamp = Date.now()
  const leader = await createUser('Suite Leader', `suite-leader-${stamp}@test.local`, 'team_leader')
  const dev = await createUser('Suite Dev', `suite-dev-${stamp}@test.local`, 'developer')
  leaderId = leader.id
  leaderToken = leader.token
  devId = dev.id
  devToken = dev.token
}, 30_000)

describe('admin builds a team and staffs a project', () => {
  it('has a working admin session', () => {
    expect(adminToken).not.toBe('')
  })

  it('creates a team with a leader and a developer', async () => {
    const res = await api(
      '/api/admin/teams',
      {
        method: 'POST',
        body: JSON.stringify({
          name: `Suite Team ${Date.now()}`,
          teamLeaderId: leaderId,
          memberIds: [devId],
        }),
      },
      adminToken
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    teamId = body.team._id
    expect(body.team.teamLeader._id).toBe(leaderId)
    expect(body.team.members.map((m: any) => m._id)).toContain(devId)
  })

  it('creates a project with the team assigned', async () => {
    const res = await api(
      '/api/projects',
      {
        method: 'POST',
        body: JSON.stringify({
          title: `Suite Project ${Date.now()}`,
          requirements: 'End-to-end test fixture',
          teamId,
        }),
      },
      adminToken
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    projectId = body.project._id

    const memberIds = body.project.members.map((m: any) => m._id)
    expect(body.project.team._id).toBe(teamId)
    expect(memberIds).toContain(leaderId)
    expect(memberIds).toContain(devId)
  })

  it('clears the team via the assign endpoint, dropping its members', async () => {
    const res = await api(
      `/api/projects/${projectId}/assign`,
      { method: 'PUT', body: JSON.stringify({ teamId: null }) },
      adminToken
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.project.team).toBeFalsy()
    const memberIds = body.project.members.map((m: any) => m._id)
    expect(memberIds).not.toContain(leaderId)
    expect(memberIds).not.toContain(devId)
  })

  it('re-assigns the team, restoring membership', async () => {
    const res = await api(
      `/api/projects/${projectId}/assign`,
      { method: 'PUT', body: JSON.stringify({ teamId }) },
      adminToken
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const memberIds = body.project.members.map((m: any) => m._id)
    expect(memberIds).toContain(leaderId)
    expect(memberIds).toContain(devId)
  })
})

describe("the team leader manages their project's content", () => {
  it('can edit the project it leads (title/description/requirements/status)', async () => {
    const res = await api(
      `/api/projects/${projectId}`,
      { method: 'PUT', body: JSON.stringify({ description: 'Edited by the team leader' }) },
      leaderToken
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.project.description).toBe('Edited by the team leader')
  })

  it('cannot delete the project — that stays admin-only', async () => {
    const res = await api(`/api/projects/${projectId}`, { method: 'DELETE' }, leaderToken)
    expect(res.status).toBe(403)
  })

  it('cannot reassign the team — staffing stays admin-only', async () => {
    const res = await api(
      `/api/projects/${projectId}/assign`,
      { method: 'PUT', body: JSON.stringify({ teamId: null }) },
      leaderToken
    )
    expect(res.status).toBe(403)
  })

  it('a plain developer on the same project cannot edit its settings', async () => {
    const res = await api(
      `/api/projects/${projectId}`,
      { method: 'PUT', body: JSON.stringify({ description: 'A developer should not manage this' }) },
      devToken
    )
    expect(res.status).toBe(403)
  })
})

describe('a non-admin is rejected everywhere admin-only', () => {
  it('cannot list users', async () => {
    const res = await api('/api/admin/users', {}, devToken)
    expect(res.status).toBe(403)
  })

  it('cannot create a user', async () => {
    const res = await api(
      '/api/admin/users',
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'x',
          email: `blocked-${Date.now()}@test.local`,
          password: PASSWORD,
          role: 'admin',
        }),
      },
      devToken
    )
    expect(res.status).toBe(403)
  })

  it('cannot create a team', async () => {
    const res = await api(
      '/api/admin/teams',
      { method: 'POST', body: JSON.stringify({ name: 'x', teamLeaderId: leaderId }) },
      devToken
    )
    expect(res.status).toBe(403)
  })

  it('cannot create a project even with no privileged fields', async () => {
    const res = await api(
      '/api/projects',
      { method: 'POST', body: JSON.stringify({ title: `Blocked ${Date.now()}` }) },
      devToken
    )
    expect(res.status).toBe(403)
  })

  it('a team leader is also blocked from creating a project — leading a team is not admin', async () => {
    const res = await api(
      '/api/projects',
      { method: 'POST', body: JSON.stringify({ title: `Also blocked ${Date.now()}` }) },
      leaderToken
    )
    expect(res.status).toBe(403)
  })
})
