import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { z } from 'zod'

// Secrets are read at import time by jwt.ts, so they must exist before the
// modules under test are loaded.
const db = vi.hoisted(() => {
  process.env.JWT_SECRET = 'a'.repeat(40)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40)
  return {
    findOne: vi.fn(),
    findById: vi.fn(),
    userExists: vi.fn(),
    taskCount: vi.fn(),
    projectUpdate: vi.fn(),
  }
})

vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/db/models', () => ({
  User: { findOne: db.findOne, findById: db.findById, exists: db.userExists },
  Team: { exists: vi.fn() },
  Task: { countDocuments: db.taskCount, findById: vi.fn() },
  Project: { findById: vi.fn(), findByIdAndUpdate: db.projectUpdate },
}))

import { POST as login } from '@/app/api/auth/login/route'
import { POST as refresh } from '@/app/api/auth/refresh-token/route'
import { authenticateRequest } from './middleware'
import { syncProjectProgress } from '@/lib/services/projects'
import { isValidAssignee } from '@/lib/services/tasks'
import { validationError, objectIdString } from '@/lib/validation'
import { generateTokenPair } from './jwt'
import { hashPassword } from './password'
import { resetLoginLimiter } from './rate-limit'

const USER_ID = 'a'.repeat(24)
const OTHER_ID = 'b'.repeat(24)

/** Mongoose queries are awaited after `.select()`; mimic just that. */
const query = (value: unknown) => ({ select: () => Promise.resolve(value) })

const post = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

let passwordHash = ''
const account = (status: string) => ({
  _id: USER_ID,
  name: 'Test',
  email: 'u@test.local',
  role: 'developer',
  status,
  password: passwordHash,
})

beforeEach(async () => {
  vi.resetAllMocks()
  resetLoginLimiter()
  passwordHash = passwordHash || (await hashPassword('secret123'))
})

describe('login', () => {
  it('lets an active user in and returns a token pair', async () => {
    db.findOne.mockReturnValue(query(account('active')))
    const res = await login(post('/api/auth/login', { email: 'u@test.local', password: 'secret123' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.token).toBeTruthy()
    expect(body.refreshToken).toBeTruthy()
    expect(body.user.password).toBeUndefined()
  })

  it('rejects a suspended user even with the right password, issuing no tokens', async () => {
    db.findOne.mockReturnValue(query(account('suspended')))
    const res = await login(post('/api/auth/login', { email: 'u@test.local', password: 'secret123' }))
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.token).toBeUndefined()
    expect(body.refreshToken).toBeUndefined()
  })

  it('does not reveal suspension to someone who lacks the password', async () => {
    db.findOne.mockReturnValue(query(account('suspended')))
    const res = await login(post('/api/auth/login', { email: 'u@test.local', password: 'wrong-pass' }))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Invalid email or password')
  })

  it('gives an unknown email the same answer as a wrong password', async () => {
    db.findOne.mockReturnValue(query(null))
    const res = await login(post('/api/auth/login', { email: 'x@test.local', password: 'secret123' }))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Invalid email or password')
  })

  it('answers malformed credentials and bodies with 400, not 500', async () => {
    const bad = await login(post('/api/auth/login', { email: 'nope', password: '1' }))
    expect(bad.status).toBe(400)
    const body = await bad.json()
    expect(body.error).toBe('Validation failed')
    expect(Array.isArray(body.details)).toBe(true)

    const notJson = await login(post('/api/auth/login', '{not json'))
    expect(notJson.status).toBe(400)
  })
})

describe('refresh-token', () => {
  const pair = () =>
    generateTokenPair({ userId: USER_ID, email: 'u@test.local', role: 'developer' })

  it('issues a new pair for an active user', async () => {
    db.findById.mockReturnValue(query({ email: 'u@test.local', role: 'developer', status: 'active' }))
    const res = await refresh(post('/api/auth/refresh-token', { refreshToken: pair().refreshToken }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.token).toBeTruthy()
    expect(body.refreshToken).toBeTruthy()
  })

  it('refuses a suspended user', async () => {
    db.findById.mockReturnValue(query({ email: 'u@test.local', role: 'developer', status: 'suspended' }))
    const res = await refresh(post('/api/auth/refresh-token', { refreshToken: pair().refreshToken }))
    expect(res.status).toBe(401)
    expect((await res.json()).token).toBeUndefined()
  })

  it('refuses a user who no longer exists', async () => {
    db.findById.mockReturnValue(query(null))
    const res = await refresh(post('/api/auth/refresh-token', { refreshToken: pair().refreshToken }))
    expect(res.status).toBe(401)
  })

  it('refuses malformed tokens and an access token used as a refresh token', async () => {
    db.findById.mockReturnValue(query({ email: 'u@test.local', role: 'developer', status: 'active' }))
    const garbage = await refresh(post('/api/auth/refresh-token', { refreshToken: 'not.a.jwt' }))
    expect(garbage.status).toBe(401)
    const wrongKind = await refresh(post('/api/auth/refresh-token', { refreshToken: pair().token }))
    expect(wrongKind.status).toBe(401)
  })

  it('answers a missing or unparseable body with 400', async () => {
    expect((await refresh(post('/api/auth/refresh-token', {}))).status).toBe(400)
    expect((await refresh(post('/api/auth/refresh-token', '{oops'))).status).toBe(400)
  })
})

describe('authenticateRequest (guards every protected API)', () => {
  const req = (token?: string) =>
    new NextRequest('http://localhost/api/projects', {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
  const access = () =>
    generateTokenPair({ userId: USER_ID, email: 'u@test.local', role: 'developer' }).token

  it('accepts a valid token for an active account', async () => {
    db.findById.mockReturnValue(query({ status: 'active' }))
    const { user, error } = await authenticateRequest(req(access()))
    expect(error).toBeNull()
    expect(user?.userId).toBe(USER_ID)
  })

  it('rejects a still-valid token once the account is suspended', async () => {
    db.findById.mockReturnValue(query({ status: 'suspended' }))
    const { user, error } = await authenticateRequest(req(access()))
    expect(user).toBeNull()
    expect(error).toBeTruthy()
  })

  it('rejects a token whose account was removed, and missing or garbage tokens', async () => {
    db.findById.mockReturnValue(query(null))
    expect((await authenticateRequest(req(access()))).user).toBeNull()
    expect((await authenticateRequest(req())).user).toBeNull()
    expect((await authenticateRequest(req('garbage'))).user).toBeNull()
  })
})

describe('isValidAssignee', () => {
  const project = { owner: OTHER_ID, members: [OTHER_ID, USER_ID] }

  it('allows an existing project member', async () => {
    db.userExists.mockResolvedValue({ _id: USER_ID })
    expect(await isValidAssignee(project, USER_ID)).toBe(true)
  })

  it('allows the project owner', async () => {
    db.userExists.mockResolvedValue({ _id: OTHER_ID })
    expect(await isValidAssignee(project, OTHER_ID)).toBe(true)
  })

  it('rejects an existing user who is not a member', async () => {
    db.userExists.mockResolvedValue({ _id: 'c'.repeat(24) })
    expect(await isValidAssignee(project, 'c'.repeat(24))).toBe(false)
  })

  it('rejects a member id that no longer matches a user', async () => {
    db.userExists.mockResolvedValue(null)
    expect(await isValidAssignee(project, USER_ID)).toBe(false)
  })
})

describe('request validation helpers', () => {
  it('objectIdString accepts 24-hex ids only', () => {
    expect(objectIdString.safeParse(USER_ID).success).toBe(true)
    expect(objectIdString.safeParse('not-an-id').success).toBe(false)
    // mongoose.isValidObjectId would accept this 12-char string
    expect(objectIdString.safeParse('abcdefghijkl').success).toBe(false)
  })

  it('validationError returns { error, details } with status 400', async () => {
    const parsed = z.object({ n: z.number() }).safeParse({ n: 'x' })
    if (parsed.success) throw new Error('unreachable')
    const res = validationError(parsed.error)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Validation failed')
    expect(body.details[0].path).toEqual(['n'])
  })
})

describe('syncProjectProgress', () => {
  it('writes completed / total x 100, rounded', async () => {
    db.taskCount.mockResolvedValueOnce(3).mockResolvedValueOnce(1)
    await syncProjectProgress(USER_ID)
    expect(db.projectUpdate).toHaveBeenCalledWith(USER_ID, { progress: 33 })
  })

  it('writes 0, not NaN, when the project has no tasks', async () => {
    db.taskCount.mockResolvedValue(0)
    await syncProjectProgress(USER_ID)
    expect(db.projectUpdate).toHaveBeenCalledWith(USER_ID, { progress: 0 })
  })
})

describe('login rate limiting', () => {
  it('blocks further attempts after repeated failures, even with the right password', async () => {
    db.findOne.mockReturnValue(query(account('active')))
    const attempt = (password: string) =>
      login(post('/api/auth/login', { email: 'u@test.local', password }))

    for (let i = 0; i < 8; i++) expect((await attempt('wrong-pass')).status).toBe(401)

    const blocked = await attempt('secret123')
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await blocked.json()).token).toBeUndefined()
  })

  it('a successful sign-in is not counted against the account', async () => {
    db.findOne.mockReturnValue(query(account('active')))
    for (let i = 0; i < 20; i++) {
      const res = await login(post('/api/auth/login', { email: 'u@test.local', password: 'secret123' }))
      expect(res.status).toBe(200)
    }
  })
})

describe('token revocation (tokenVersion)', () => {
  const stale = () =>
    generateTokenPair({ userId: USER_ID, email: 'u@test.local', role: 'developer', tv: 0 })

  it('a password reset (tokenVersion bumped) invalidates tokens issued before it', async () => {
    db.findById.mockReturnValue(
      query({ email: 'u@test.local', role: 'developer', status: 'active', tokenVersion: 1 })
    )

    const refreshRes = await refresh(post('/api/auth/refresh-token', { refreshToken: stale().refreshToken }))
    expect(refreshRes.status).toBe(401)

    const req = new NextRequest('http://localhost/api/projects', {
      headers: { authorization: `Bearer ${stale().token}` },
    })
    expect((await authenticateRequest(req)).user).toBeNull()
  })

  it('tokens issued before tokenVersion existed keep working until the first reset', async () => {
    db.findById.mockReturnValue(query({ email: 'u@test.local', role: 'developer', status: 'active' }))
    const legacy = generateTokenPair({ userId: USER_ID, email: 'u@test.local', role: 'developer' })

    const refreshRes = await refresh(post('/api/auth/refresh-token', { refreshToken: legacy.refreshToken }))
    expect(refreshRes.status).toBe(200)
  })

  it('takes the role from the database, not the token', async () => {
    db.findById.mockReturnValue(query({ status: 'active', role: 'developer', email: 'u@test.local' }))
    const adminToken = generateTokenPair({ userId: USER_ID, email: 'u@test.local', role: 'admin' }).token
    const req = new NextRequest('http://localhost/api/projects', {
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect((await authenticateRequest(req)).user?.role).toBe('developer')
  })
})
