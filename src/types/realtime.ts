/**
 * What the server pushes over SSE: ids only, never document content.
 * Clients refetch through the normal authorized APIs.
 */
export interface ChangeSignal {
  collection: string
  op: string
  /** Id of the changed document. */
  id: string
  projectId?: string
  taskId?: string
  /** Epoch ms of the document's updatedAt, so clients can skip echoes of their own writes. */
  updatedAt?: number
}
