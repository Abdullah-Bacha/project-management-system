/**
 * Task workload guidance. This is how much open work someone is carrying, not
 * a measure of how well they work, and it is never stored: it is worked out
 * from the tasks each time. The thresholds live here, in one place, so they
 * can be changed without touching the server or the screens.
 */
export const WORKLOAD_THRESHOLDS = {
  /** Up to this many active tasks is "normal". 0 is "available". */
  normalMax: 3,
  /** Up to this many is "high". Beyond it is "overloaded". */
  highMax: 6,
} as const

export const WORKLOAD_STATUSES = ['available', 'normal', 'high', 'overloaded'] as const
export type WorkloadStatus = (typeof WORKLOAD_STATUSES)[number]

export const WORKLOAD_LABELS: Record<WorkloadStatus, string> = {
  available: 'Available',
  normal: 'Normal',
  high: 'High workload',
  overloaded: 'Overloaded',
}

/** 0 → available, 1–3 → normal, 4–6 → high, 7+ → overloaded. */
export function workloadStatus(activeTasks: number): WorkloadStatus {
  if (activeTasks <= 0) return 'available'
  if (activeTasks <= WORKLOAD_THRESHOLDS.normalMax) return 'normal'
  if (activeTasks <= WORKLOAD_THRESHOLDS.highMax) return 'high'
  return 'overloaded'
}

/** How full the workload bar is: active tasks against the top of the "high" band, capped at 1. */
export function workloadRatio(activeTasks: number): number {
  return Math.min(1, Math.max(0, activeTasks) / WORKLOAD_THRESHOLDS.highMax)
}
