import { api } from '@/lib/api/client'

export const reportsService = {
  /** Team leader (or admin) submits a daily progress report for a project. */
  submit: async (projectId: string, note?: string) => {
    const { data } = await api.post(`/api/projects/${projectId}/reports`, { note })
    return data.report
  },

  /** Report history for one project — any member can see it. */
  listForProject: async (projectId: string) => {
    const { data } = await api.get(`/api/projects/${projectId}/reports`)
    return data.reports as any[]
  },

  /** Admin's cross-project feed. */
  listAll: async (skip = 0, limit = 30) => {
    const { data } = await api.get('/api/admin/reports', { params: { skip, limit } })
    return data as { reports: any[]; total: number }
  },
}
