'use client'

import { useState } from 'react'
import { useToast } from '@/hooks/useToast'
import { tasksService } from '@/services/tasks.service'
import { errorMessage } from '@/services/client'
import type { TaskStatus } from '@/types'

/**
 * The assignee moving their own task. The server only allows this for the
 * assignee or the project's editors, and the project board picks the change up
 * live, which is how the team leader follows progress.
 */
export function useTaskStatusUpdate(onDone: () => void) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const { notify, toastNode } = useToast()

  const changeStatus = async (task: { _id: string; status: TaskStatus }, status: TaskStatus) => {
    if (status === task.status) return
    setBusyId(task._id)
    try {
      await tasksService.updateStatus(task._id, status)
      notify('success', 'Status updated')
      onDone()
    } catch (e) {
      notify('error', errorMessage(e, 'Could not update the task'))
    } finally {
      setBusyId(null)
    }
  }

  return { changeStatus, busyId, toastNode }
}
