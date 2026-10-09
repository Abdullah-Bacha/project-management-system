import { api } from '@/services/client'
import type { ProjectFileItem, ProjectFileList, ReferenceLink } from '@/types'

export interface ProjectUploadResult {
  files: ProjectFileItem[]
  rejected: { name: string; error: string }[]
}

/** Reference material for a project: shared files, and links (saved with the project itself). */
export const projectResourcesService = {
  listFiles: async (projectId: string) => {
    const { data } = await api.get<ProjectFileList>(`/api/projects/${projectId}/files`)
    return data
  },

  /** One file per request, so each succeeds or fails on its own. */
  uploadFile: async (projectId: string, file: File) => {
    const body = new FormData()
    body.append('files', file)
    const { data } = await api.post<ProjectUploadResult>(`/api/projects/${projectId}/files`, body)
    return data
  },

  /** The file's bytes. The request carries the sign-in token, which a plain link could not. */
  downloadFile: async (projectId: string, fileId: string) => {
    const { data } = await api.get<Blob>(`/api/projects/${projectId}/files/${fileId}`, { responseType: 'blob' })
    return data
  },

  removeFile: async (projectId: string, fileId: string) => {
    await api.delete(`/api/projects/${projectId}/files/${fileId}`)
  },

  /** Replace the project's list of reference links. */
  saveLinks: async (projectId: string, referenceLinks: ReferenceLink[]) => {
    const { data } = await api.put<{ project: { referenceLinks?: ReferenceLink[] } }>(`/api/projects/${projectId}`, { referenceLinks })
    return data.project.referenceLinks ?? []
  },
}
