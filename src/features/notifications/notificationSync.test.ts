import { describe, it, expect } from 'vitest'
import { broadcastNotificationSync, bulkReadState, withAllRead } from './notificationSync'
import type { NotificationPage } from '@/types'

const n = (id: string, read: boolean) => ({ _id: id, userId: 'u', type: 'task-updated' as const, message: id, read, createdAt: '2026-10-09T10:00:00Z' })

const page = (items: ReturnType<typeof n>[], unreadCount: number): NotificationPage => ({ notifications: items, total: items.length, unreadCount })

describe('withAllRead', () => {
  it('marks every unread notification read and zeroes the count, keeping the history', () => {
    const result = withAllRead(page([n('a', false), n('b', true), n('c', false)], 2))
    expect(result.notifications.map((x) => x.read)).toEqual([true, true, true])
    expect(result.notifications.map((x) => x._id)).toEqual(['a', 'b', 'c']) // nothing removed, order kept
    expect(result.unreadCount).toBe(0)
    expect(result.total).toBe(3)
  })

  it('leaves notifications that were already read as the very same objects', () => {
    const read = n('b', true)
    const result = withAllRead(page([n('a', false), read], 1))
    expect(result.notifications[1]).toBe(read)
  })

  it('does not change the page it was given (so it can be restored)', () => {
    const original = page([n('a', false)], 1)
    withAllRead(original)
    expect(original.notifications[0].read).toBe(false)
    expect(original.unreadCount).toBe(1)
  })

  it('an empty list or a user with nothing unread is fine', () => {
    expect(withAllRead(page([], 0))).toEqual(page([], 0))
    expect(withAllRead(page([n('a', true)], 0)).unreadCount).toBe(0)
  })
})

describe('the shared "request running" flag', () => {
  it('is one flag for every button, and is cleared again', () => {
    expect(bulkReadState.get()).toBe(false)
    bulkReadState.set(true)
    expect(bulkReadState.get()).toBe(true)
    bulkReadState.set(false)
    expect(bulkReadState.get()).toBe(false)
  })

  it('broadcasting with no browser around does nothing and does not throw', () => {
    expect(() => broadcastNotificationSync('confirmed')).not.toThrow()
  })
})
