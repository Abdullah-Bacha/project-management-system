import { describe, it, expect } from 'vitest'
import { isDemoAccount, redactForDemo, demoForbidden } from './demo'

const DEMO = 'testing@gmail.com'

describe('demo account guard', () => {
  it('recognises the demo account regardless of case', () => {
    expect(isDemoAccount(DEMO)).toBe(true)
    expect(isDemoAccount('Testing@Gmail.com')).toBe(true)
    expect(isDemoAccount('someone@else.com')).toBe(false)
    expect(isDemoAccount(undefined)).toBe(false)
  })

  it('refuses with a 403 and a readable reason', async () => {
    const res = demoForbidden()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/demo account/i)
  })
})

describe('redactForDemo', () => {
  const payload = {
    users: [
      { _id: '1', name: 'Real Person', email: 'real.person@example.com' },
      { _id: '2', name: 'Demo', email: DEMO },
    ],
    teams: [{ teamLeader: { name: 'Lead', email: 'lead@corp.io' }, members: [] }],
  }

  it('masks every other account email for the demo viewer, at any depth', () => {
    const out = redactForDemo(DEMO, payload)
    expect(out.users[0].email).toBe('r•••@example.com')
    expect(out.teams[0].teamLeader.email).toBe('l•••@corp.io')
    expect(out.users[0].name).toBe('Real Person') // names stay
  })

  it('leaves the demo account its own email', () => {
    expect(redactForDemo(DEMO, payload).users[1].email).toBe(DEMO)
  })

  it('returns the data untouched for everyone else', () => {
    expect(redactForDemo('admin@corp.io', payload)).toBe(payload)
  })

  it('does not mutate the original payload', () => {
    redactForDemo(DEMO, payload)
    expect(payload.users[0].email).toBe('real.person@example.com')
  })
})
