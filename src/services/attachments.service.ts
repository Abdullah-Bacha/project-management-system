import { api } from '@/services/client'
import type { AttachmentList, UploadResult } from '@/types'

export const attachmentsService = {
  list: async (taskId: string) => {
    const { data } = await api.get<AttachmentList>(`/api/tasks/${taskId}/attachments`)
    return data
  },

  /** One file per request, so each file succeeds or fails on its own. */
  upload: async (taskId: string, file: File) => {
    const body = new FormData()
    body.append('files', file)
    const { data } = await api.post<UploadResult>(`/api/tasks/${taskId}/attachments`, body)
    return data
  },

  /** The file's bytes. The request carries the sign-in token, which a plain link could not. */
  download: async (taskId: string, attachmentId: string) => {
    const { data } = await api.get<Blob>(`/api/tasks/${taskId}/attachments/${attachmentId}`, { responseType: 'blob' })
    return data
  },

  remove: async (taskId: string, attachmentId: string) => {
    await api.delete(`/api/tasks/${taskId}/attachments/${attachmentId}`)
  },
}
