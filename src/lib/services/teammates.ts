import { Team } from '@/lib/db/models'

/** Two people are teammates when they are on a team together (as its leader or a member). */
export async function shareTeam(a: string, b: string): Promise<boolean> {
  const team = await Team.exists({
    $or: [
      { teamLeader: a, members: b },
      { teamLeader: b, members: a },
      { members: { $all: [a, b] } },
    ],
  })
  return Boolean(team)
}
