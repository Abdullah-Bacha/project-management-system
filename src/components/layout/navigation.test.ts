import { describe, expect, it } from 'vitest'
import { navFor } from './navigation'

const hrefs = (role: Parameters<typeof navFor>[0]) => navFor(role).flatMap((g) => g.items.map((i) => i.href))

describe('navFor', () => {
  it('shows admin-only groups to admins only', () => {
    const admin = navFor('admin').map((g) => g.id)
    expect(admin).toEqual(['workspace', 'insights', 'admin'])
    // Administrators have no team of their own; "My Team" is their team workload.
    expect(hrefs('admin')).toContain('/dashboard/team')
  })
  it('shows team leaders Reports but not the admin group', () => {
    expect(navFor('team_leader').map((g) => g.id)).toEqual(['workspace', 'insights'])
    expect(hrefs('team_leader')).toContain('/dashboard/admin/reports')
    expect(hrefs('team_leader')).toContain('/dashboard/team')
    expect(hrefs('team_leader')).toContain('/dashboard/tasks')
    expect(hrefs('team_leader')).not.toContain('/dashboard/admin/users')
    expect(hrefs('team_leader')).not.toContain('/dashboard/admin/teams')
  })
  it('hides insights and admin groups from developers', () => {
    expect(navFor('developer').map((g) => g.id)).toEqual(['workspace'])
    expect(hrefs('developer')).not.toContain('/dashboard/admin/reports')
    expect(hrefs('developer')).toContain('/dashboard/team')
    expect(hrefs('developer')).toContain('/dashboard/tasks')
  })
})
