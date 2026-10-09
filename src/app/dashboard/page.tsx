'use client'

import { useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRealtimeProjects } from '@/features/projects/useRealtimeProjects'
import { useMyTasks } from '@/features/tasks/useMyTasks'
import { DashboardHeader } from '@/features/dashboard/DashboardHeader'
import { AdminOverview } from '@/features/dashboard/AdminOverview'
import { PersonalStats } from '@/features/dashboard/PersonalStats'
import { ReviewStrip, type ReviewItem } from '@/features/dashboard/ReviewStrip'
import { LeaderOverview } from '@/features/dashboard/LeaderOverview'
import { WorkloadPanel } from '@/features/workload/WorkloadPanel'
import { ProjectOverview } from '@/features/dashboard/ProjectOverview'
import { MyTasks } from '@/features/dashboard/MyTasks'
import { TaskStatDrawer, type TaskStat } from '@/features/dashboard/TaskStatDrawer'
import { RecentActivity } from '@/features/dashboard/RecentActivity'
import { useDashboardAnalytics } from '@/features/dashboard/useDashboardAnalytics'
import type { ProjectAnalytics, UserRole } from '@/types'

type ProjectsData = ReturnType<typeof useRealtimeProjects>

/**
 * Each role gets the home that answers its own question:
 *   admin: what is set up (projects, teams, users, projects without a team);
 *   team leader: what needs my review, and what is my team doing;
 *   developer: what do I work on.
 */
export default function DashboardPage() {
  const { user } = useAuth()
  const data = useRealtimeProjects()

  return (
    <div className="space-y-8">
      <DashboardHeader user={user} lastUpdated={data.lastUpdated} isLoading={data.isLoading} isLive={data.isLive} />

      {user?.role === 'admin' && <AdminHome data={data} />}
      {user?.role === 'team_leader' && <LeaderHome data={data} userId={user._id} />}
      {user?.role === 'developer' && <DeveloperHome data={data} />}

      {user && <RecentActivity />}
    </div>
  )
}

/** The home pages show the first six projects. */
function useShownProjects(data: ProjectsData) {
  return useMemo(() => data.projects.slice(0, 6), [data.projects])
}

function ProjectsSection({
  data,
  role,
  analytics = {},
}: {
  data: ProjectsData
  role: UserRole
  analytics?: Record<string, ProjectAnalytics>
}) {
  const shown = useShownProjects(data)
  return (
    <ProjectOverview
      projects={shown}
      total={data.total || data.projects.length}
      analytics={analytics}
      role={role}
      loading={data.isLoading}
      error={data.error}
      errorStatus={data.errorStatus}
      onRetry={data.refetch}
    />
  )
}

function AdminHome({ data }: { data: ProjectsData }) {
  const ready = !data.isLoading || data.projects.length > 0

  return (
    <>
      <AdminOverview projects={data.projects} projectCount={data.total || data.projects.length} ready={ready} />
      <ProjectsSection data={data} role="admin" />
    </>
  )
}

function LeaderHome({ data, userId }: { data: ProjectsData; userId: string }) {
  const shown = useShownProjects(data)
  const { byProject } = useDashboardAnalytics(shown, data.isLive)
  const mine = useMyTasks(20)

  // Projects whose team this person leads: that is where reviews wait for them.
  const reviewItems: ReviewItem[] = shown
    .filter((p) => p.team?.teamLeader?._id === userId)
    .map((p) => ({
      projectId: p._id,
      projectTitle: p.title,
      count: byProject[p._id]?.tasksByStatus?.review ?? 0,
    }))

  return (
    <>
      <ReviewStrip items={reviewItems} />
      {/* Just the four summary cards; the full workload lives under My Team. */}
      <WorkloadPanel summaryOnly />
      <LeaderOverview />
      <ProjectsSection data={data} role="team_leader" analytics={byProject} />
      {/* Only when the leader is also assigned work themselves. */}
      {mine.total > 0 && <MyTasks mine={mine} grouped />}
    </>
  )
}

function DeveloperHome({ data }: { data: ProjectsData }) {
  const mine = useMyTasks(20)
  const [stat, setStat] = useState<TaskStat | null>(null)

  return (
    <>
      <PersonalStats
        counts={mine.counts}
        open={mine.total}
        overdue={mine.overdue}
        ready={!mine.isLoading || mine.tasks.length > 0}
        onSelect={setStat}
      />
      <MyTasks mine={mine} grouped />
      <ProjectsSection data={data} role="developer" />
      {stat && <TaskStatDrawer stat={stat} onClose={() => setStat(null)} />}
    </>
  )
}
