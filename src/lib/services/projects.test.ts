import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  teamFindById: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('@/lib/db/models', () => ({
  Project: { find: vi.fn(), findById: vi.fn(), findByIdAndUpdate: vi.fn(), findByIdAndDelete: vi.fn() },
  Task: { countDocuments: vi.fn(), find: vi.fn(), deleteMany: vi.fn() },
  Comment: { deleteMany: vi.fn() },
  Notification: { deleteMany: vi.fn() },
  Report: { deleteMany: vi.fn() },
  Team: { findById: m.teamFindById },
}))
vi.mock('./notifications', () => ({ notifyProjectAssigned: m.notify }))

import { teamRoster, composeMembers, assignTeamToProject } from './projects'

const id = (c: string) => c.repeat(24)
const OWNER = id('a')
const LEADER = id('b')
const DEV1 = id('c')
const DEV2 = id('d')
const HAND_ADDED = id('e')

const team = (leader: string, members: string[]) => ({ _id: id('f'), teamLeader: leader, members })

beforeEach(() => vi.resetAllMocks())

describe('teamRoster', () => {
  it('lists the leader first, then members', () => {
    expect(teamRoster(team(LEADER, [DEV1, DEV2]))).toEqual([LEADER, DEV1, DEV2])
  })

  it('understands populated documents as well as raw ids', () => {
    const populated = { teamLeader: { _id: LEADER, name: 'L' }, members: [{ _id: DEV1 }] }
    expect(teamRoster(populated)).toEqual([LEADER, DEV1])
  })

  it('is empty without a team', () => {
    expect(teamRoster(null)).toEqual([])
  })
})

describe('composeMembers', () => {
  it('is owner + hand-added extras + the team roster, without duplicates', () => {
    const members = composeMembers(OWNER, [HAND_ADDED, DEV1], team(LEADER, [DEV1, DEV2]))
    expect(members.sort()).toEqual([OWNER, LEADER, DEV1, DEV2, HAND_ADDED].sort())
  })

  it('is just the owner for an unstaffed project', () => {
    expect(composeMembers(OWNER, [], null)).toEqual([OWNER])
  })
})

describe('assignTeamToProject', () => {
  const projectWith = (members: string[], teamId?: string) => ({
    _id: id('9'),
    title: 'P',
    owner: OWNER,
    team: teamId,
    members,
    save: vi.fn(),
  })

  it('replaces the previous team, keeps hand-added members, and notifies only newcomers', async () => {
    const oldTeam = team(LEADER, [DEV1])
    m.teamFindById.mockResolvedValue(oldTeam)
    const project = projectWith([OWNER, LEADER, DEV1, HAND_ADDED], id('f'))

    const newTeam = team(id('1'), [DEV2])
    await assignTeamToProject(project, newTeam, OWNER)

    expect([...project.members].sort()).toEqual([OWNER, id('1'), DEV2, HAND_ADDED].sort())
    expect(project.save).toHaveBeenCalledOnce()
    const notified = m.notify.mock.calls[0][1] as string[]
    expect(notified.sort()).toEqual([id('1'), DEV2].sort())
  })

  it('does not re-notify anyone when the same team is assigned again', async () => {
    const same = team(LEADER, [DEV1])
    m.teamFindById.mockResolvedValue(same)
    const project = projectWith([OWNER, LEADER, DEV1], id('f'))

    await assignTeamToProject(project, same, OWNER)

    expect(m.notify).toHaveBeenCalledWith(project, [], OWNER)
    expect([...project.members].sort()).toEqual([OWNER, LEADER, DEV1].sort())
  })

  it('clearing the team removes its people but keeps the owner and hand-added members', async () => {
    m.teamFindById.mockResolvedValue(team(LEADER, [DEV1]))
    const project = projectWith([OWNER, LEADER, DEV1, HAND_ADDED], id('f'))

    await assignTeamToProject(project, null, OWNER)

    expect([...project.members].sort()).toEqual([OWNER, HAND_ADDED].sort())
    expect(project.team).toBeUndefined()
    expect(m.notify).not.toHaveBeenCalled()
  })
})
