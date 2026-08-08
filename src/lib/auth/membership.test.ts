import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { isProjectMember, isProjectOwner, toId } from './membership'

const OWNER = new mongoose.Types.ObjectId()
const MEMBER = new mongoose.Types.ObjectId()
const STRANGER = new mongoose.Types.ObjectId()

describe('toId', () => {
  it('normalises an ObjectId to its hex string', () => {
    expect(toId(OWNER)).toBe(OWNER.toString())
  })

  it('unwraps a populated document', () => {
    expect(toId({ _id: OWNER, name: 'Ada' } as any)).toBe(OWNER.toString())
  })

  it('passes a plain string through', () => {
    expect(toId('abc123')).toBe('abc123')
  })

  it('returns null for empty values', () => {
    expect(toId(null)).toBeNull()
    expect(toId(undefined)).toBeNull()
    expect(toId('')).toBeNull()
  })
})

describe('isProjectOwner', () => {
  it('accepts the owner', () => {
    const project = { owner: OWNER, members: [] }
    expect(isProjectOwner(project, OWNER.toString())).toBe(true)
  })

  it('rejects a member who is not the owner', () => {
    const project = { owner: OWNER, members: [MEMBER] }
    expect(isProjectOwner(project, MEMBER.toString())).toBe(false)
  })

  it('works when owner is populated', () => {
    const project = { owner: { _id: OWNER, name: 'Ada' }, members: [] }
    expect(isProjectOwner(project as any, OWNER.toString())).toBe(true)
  })
})

describe('isProjectMember', () => {
  it('accepts the owner even when absent from members', () => {
    const project = { owner: OWNER, members: [] }
    expect(isProjectMember(project, OWNER.toString())).toBe(true)
  })

  it('accepts a listed member', () => {
    const project = { owner: OWNER, members: [OWNER, MEMBER] }
    expect(isProjectMember(project, MEMBER.toString())).toBe(true)
  })

  it('rejects a stranger — the case that leaked data', () => {
    const project = { owner: OWNER, members: [OWNER, MEMBER] }
    expect(isProjectMember(project, STRANGER.toString())).toBe(false)
  })

  it('matches ObjectId members against a string id', () => {
    // Array.includes(string) on ObjectIds never matches; the guard must not
    // rely on it, or every member check silently fails open/closed.
    const project = { owner: STRANGER, members: [MEMBER] }
    expect(project.members.includes(MEMBER.toString() as any)).toBe(false)
    expect(isProjectMember(project, MEMBER.toString())).toBe(true)
  })

  it('matches populated member documents', () => {
    const project = {
      owner: OWNER,
      members: [{ _id: MEMBER, name: 'Grace', email: 'g@example.com' }],
    }
    expect(isProjectMember(project as any, MEMBER.toString())).toBe(true)
  })

  it('rejects an empty user id', () => {
    const project = { owner: OWNER, members: [MEMBER] }
    expect(isProjectMember(project, '')).toBe(false)
  })

  it('tolerates a missing members array', () => {
    const project = { owner: OWNER }
    expect(isProjectMember(project, STRANGER.toString())).toBe(false)
    expect(isProjectMember(project, OWNER.toString())).toBe(true)
  })

  it('does not match on stringified objects', () => {
    // A malformed entry must never collide with another malformed entry.
    const project = { owner: null, members: [{} as any, {} as any] }
    expect(isProjectMember(project, '[object Object]')).toBe(false)
  })
})
