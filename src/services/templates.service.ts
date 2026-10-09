import { api } from '@/services/client'
import type { ProjectTemplate, TemplateInput, UseTemplateInput, UseTemplateResult } from '@/types'

export const templatesService = {
  list: async () => {
    const { data } = await api.get<{ templates: ProjectTemplate[] }>('/api/templates')
    return data.templates
  },

  create: async (payload: TemplateInput) => {
    const { data } = await api.post<{ template: ProjectTemplate }>('/api/templates', payload)
    return data.template
  },

  /** Save a project's structure (titles, descriptions, priorities, due offsets) as a template. */
  createFromProject: async (projectId: string, name?: string) => {
    const { data } = await api.post<{ template: ProjectTemplate; truncated: boolean }>('/api/templates', {
      fromProjectId: projectId,
      ...(name && { name }),
    })
    return data
  },

  update: async (id: string, payload: TemplateInput) => {
    const { data } = await api.put<{ template: ProjectTemplate }>(`/api/templates/${id}`, payload)
    return data.template
  },

  delete: async (id: string) => {
    await api.delete(`/api/templates/${id}`)
  },

  /** Create a project (and its tasks) from a template. Resending the same `requestId` never makes a second project. */
  use: async (id: string, payload: UseTemplateInput) => {
    const { data } = await api.post<UseTemplateResult>(`/api/templates/${id}/use`, payload)
    return data
  },
}
