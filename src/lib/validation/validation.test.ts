import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { parseBody, objectIdString } from './index'
import { parsePagination, parseFilters } from './query'

const params = (query: string) => new URLSearchParams(query)
const opts = { defaultLimit: 10, maxLimit: 50 }

describe('parsePagination', () => {
  it('uses the defaults when nothing is sent', () => {
    expect(parsePagination(params(''), opts)).toEqual({ skip: 0, limit: 10 })
  })

  it('accepts sensible values', () => {
    expect(parsePagination(params('skip=20&limit=25'), opts)).toEqual({ skip: 20, limit: 25 })
  })

  it('caps limit at the maximum', () => {
    expect(parsePagination(params('limit=100000'), opts).limit).toBe(50)
  })

  it('never produces NaN, negatives or zero from junk input', () => {
    for (const query of ['limit=abc&skip=xyz', 'limit=-5&skip=-9', 'limit=0', 'limit=1.5', 'limit=&skip=']) {
      const { skip, limit } = parsePagination(params(query), opts)
      expect(Number.isInteger(skip) && skip >= 0).toBe(true)
      expect(Number.isInteger(limit) && limit >= 1 && limit <= 50).toBe(true)
    }
  })

  it('bounds an absurd skip', () => {
    expect(parsePagination(params('skip=999999999999'), opts).skip).toBeLessThanOrEqual(100_000)
  })
})

describe('parseFilters', () => {
  const shape = { status: z.enum(['todo', 'done']).optional() }

  it('passes valid filters through and ignores absent ones', async () => {
    expect(parseFilters(params('status=todo'), shape).data).toEqual({ status: 'todo' })
    expect(parseFilters(params(''), shape).data).toEqual({})
  })

  it('rejects an invalid filter with a 400 instead of silently dropping it', async () => {
    const result = parseFilters(params('status=bogus'), shape)
    expect(result.response?.status).toBe(400)
    const body = await result.response!.json()
    expect(body.error).toBe('Invalid query parameters')
    expect(body.details.length).toBeGreaterThan(0)
  })
})

describe('parseBody', () => {
  const schema = z.object({ name: z.string().min(2) })
  const post = (body: BodyInit | null) => new Request('http://x.test', { method: 'POST', body })

  it('returns typed data for a valid body', async () => {
    const result = await parseBody(post(JSON.stringify({ name: 'ok' })), schema)
    expect(result.data).toEqual({ name: 'ok' })
  })

  it('turns invalid, empty and non-JSON bodies into the same 400', async () => {
    for (const body of [JSON.stringify({ name: 'x' }), '', '{not json', null]) {
      const result = await parseBody(post(body), schema)
      expect(result.response?.status).toBe(400)
      expect((await result.response!.json()).error).toBe('Validation failed')
    }
  })

  it('lets a route override the message the UI shows', async () => {
    const result = await parseBody(post('{}'), schema, 'Name is required')
    expect((await result.response!.json()).error).toBe('Name is required')
  })
})

describe('objectIdString', () => {
  it('accepts 24-hex ids only', () => {
    expect(objectIdString.safeParse('a'.repeat(24)).success).toBe(true)
    expect(objectIdString.safeParse('A'.repeat(24)).success).toBe(true)
    expect(objectIdString.safeParse('abcdefghijkl').success).toBe(false) // 12 chars: valid to mongoose, not to us
    expect(objectIdString.safeParse('').success).toBe(false)
  })
})
