import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validationError } from './index'

interface PaginationOptions {
  defaultLimit: number
  maxLimit: number
}

const MAX_SKIP = 100_000

function toInt(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const n = Number(value)
  return Number.isInteger(n) ? n : null
}

/**
 * Read `?skip=&limit=` safely. Missing, non-numeric or negative values fall
 * back to the defaults, and `limit` is capped — a caller can never turn a list
 * endpoint into "return everything" or feed NaN to the database.
 */
export function parsePagination(
  searchParams: URLSearchParams,
  { defaultLimit, maxLimit }: PaginationOptions
) {
  const rawLimit = toInt(searchParams.get('limit'))
  const rawSkip = toInt(searchParams.get('skip'))

  const limit =
    rawLimit === null || rawLimit < 1 ? defaultLimit : Math.min(rawLimit, maxLimit)
  const skip = rawSkip === null || rawSkip < 0 ? 0 : Math.min(rawSkip, MAX_SKIP)

  return { skip, limit }
}

/**
 * Validate optional filter query params (`?status=…&priority=…`). Absent
 * params are ignored; a present-but-invalid one is a 400 rather than being
 * silently dropped.
 */
export function parseFilters<S extends z.ZodRawShape>(
  searchParams: URLSearchParams,
  shape: S
): { data: z.infer<z.ZodObject<S>>; response?: never } | { response: NextResponse; data?: never } {
  const raw: Record<string, string> = {}
  for (const key of Object.keys(shape)) {
    const value = searchParams.get(key)
    if (value !== null && value !== '') raw[key] = value
  }
  const result = z.object(shape).safeParse(raw)
  if (!result.success) return { response: validationError(result.error, 'Invalid query parameters') }
  return { data: result.data }
}
