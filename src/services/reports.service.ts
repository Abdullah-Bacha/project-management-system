import { api } from '@/services/client'
import type { Report } from '@/types'

export const reportsService = {
  /** Team leader (or admin) submits a daily progress report for a project. */
  submit: async (projectId: string, note?: string) => {
    const { data } = await api.post<{ report: Report }>(`/api/projects/${projectId}/reports`, {
      note,
    })
    return data.report
  },

  /** Report history for one project; any member can see it. */
  listForProject: async (projectId: string) => {
    const { data } = await api.get<{ reports: Report[] }>(`/api/projects/${projectId}/reports`)
    return data.reports
  },

  /** The admin cross-project feed. */
  listAll: async (skip = 0, limit = 30) => {
    const { data } = await api.get<{ reports: Report[]; total: number }>('/api/admin/reports', {
      params: { skip, limit },
    })
    return data
  },
}
