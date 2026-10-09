import { describe, it, expect } from 'vitest'
import { WORKLOAD_THRESHOLDS, workloadRatio, workloadStatus } from './workload'

describe('workloadStatus', () => {
  it.each([
    [0, 'available'],
    [1, 'normal'],
    [3, 'normal'],
    [4, 'high'],
    [6, 'high'],
    [7, 'overloaded'],
    [20, 'overloaded'],
  ])('%i active tasks is %s', (n, expected) => {
    expect(workloadStatus(n)).toBe(expected)
  })

  it('reads its boundaries from the one thresholds object', () => {
    expect(workloadStatus(WORKLOAD_THRESHOLDS.normalMax)).toBe('normal')
    expect(workloadStatus(WORKLOAD_THRESHOLDS.normalMax + 1)).toBe('high')
    expect(workloadStatus(WORKLOAD_THRESHOLDS.highMax)).toBe('high')
    expect(workloadStatus(WORKLOAD_THRESHOLDS.highMax + 1)).toBe('overloaded')
  })
})

describe('workloadRatio', () => {
  it('is active tasks against the top of the high band, capped at 1', () => {
    expect(workloadRatio(0)).toBe(0)
    expect(workloadRatio(3)).toBe(0.5)
    expect(workloadRatio(6)).toBe(1)
    expect(workloadRatio(30)).toBe(1)
    expect(workloadRatio(-2)).toBe(0)
  })
})
