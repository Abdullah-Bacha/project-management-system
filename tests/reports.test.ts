import { describe, it, expect, beforeAll } from 'vitest'

/**
 * End-to-end checks for the daily progress report: a team_leader submits a
 * summary to admin, a developer cannot, and admin sees it both via
 * notification and the cross-project reports feed.
 */

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
const PASSWORD = 'password123'
const SEED_ADMIN = { email: 'test@example.com', password: PASSWORD }

let serverUp = false
let adminToken = ''
let leaderToken = ''
let devToken = ''
let projectId = ''
let projectTitle = ''

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
  const leader = await createUser('Report Leader', `report-leader-${stamp}@test.local`, 'team_leader')
  const dev = await createUser('Report Dev', `report-dev-${stamp}@test.local`, 'developer')
  leaderToken = leader.token
  devToken = dev.token

  const team = await api(
    '/api/admin/teams',
    {
      method: 'POST',
      body: JSON.stringify({
        name: `Report Team ${stamp}`,
        teamLeaderId: leader.id,
        memberIds: [dev.id],
      }),
    },
    adminToken
  )
  const teamId = (await team.json()).team._id

  projectTitle = `Report Project ${stamp}`
  const project = await api(
    '/api/projects',
    { method: 'POST', body: JSON.stringify({ title: projectTitle, teamId }) },
    adminToken
  )
  projectId = (await project.json()).project._id

  // One task, completed, so the report has something to show.
  const task = await api(
    `/api/projects/${projectId}/tasks`,
    { method: 'POST', body: JSON.stringify({ title: 'Ship the thing' }) },
    leaderToken
  )
  const taskId = (await task.json()).task._id
  await api(
    `/api/tasks/${taskId}/status`,
    { method: 'PUT', body: JSON.stringify({ status: 'complete' }) },
    leaderToken
  )
}, 30_000)

describe.runIf(() => serverUp)('team leader submits a progress report', () => {
  it('a developer cannot submit a report', async () => {
    const res = await api(
      `/api/projects/${projectId}/reports`,
      { method: 'POST', body: JSON.stringify({ note: 'nope' }) },
      devToken
    )
    expect(res.status).toBe(403)
  })

  it('the team leader can submit one', async () => {
    const res = await api(
      `/api/projects/${projectId}/reports`,
      { method: 'POST', body: JSON.stringify({ note: 'Good progress today' }) },
      leaderToken
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.report.completedTasks).toBe(1)
    expect(body.report.totalTasks).toBe(1)
    expect(body.report.completionRate).toBe(100)
    expect(body.report.completedToday.length).toBe(1)
  })

  it('shows up in the project report history for any member', async () => {
    const res = await api(`/api/projects/${projectId}/reports`, {}, devToken)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.reports.length).toBeGreaterThanOrEqual(1)
  })

  it('admin was notified', async () => {
    const res = await api('/api/notifications', {}, adminToken)
    const body = await res.json()
    const found = body.notifications.some(
      (n: any) => n.type === 'report-submitted' && n.message.includes(projectTitle)
    )
    expect(found).toBe(true)
  })

  it('shows up in the admin-wide reports feed', async () => {
    const res = await api('/api/admin/reports', {}, adminToken)
    expect(res.status).toBe(200)
    const body = await res.json()
    const found = body.reports.some((r: any) => r.project?.title === projectTitle)
    expect(found).toBe(true)
  })

  it('a developer cannot see the admin-wide feed', async () => {
    const res = await api('/api/admin/reports', {}, devToken)
    expect(res.status).toBe(403)
  })
})
