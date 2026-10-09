import { NextResponse } from 'next/server'
import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export const tokenSchema = z.object({
  refreshToken: z.string(),
})

/**
 * A 24-char hex ObjectId. `mongoose.isValidObjectId` is deliberately not
 * used: it also accepts any 12-character string, which would let arbitrary
 * text through as an "id".
 */
export const objectIdString = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid id')

/**
 * The one shape every route uses for a failed request-body validation.
 * `message` can be overridden where the UI shows it to the user directly.
 */
export function validationError(error: z.ZodError, message = 'Validation failed') {
  return NextResponse.json({ error: message, details: error.issues }, { status: 400 })
}

type Parsed<T> =
  | { data: T; response?: never }
  | { response: NextResponse; data?: never }

/**
 * Read and validate a JSON request body in one step. A missing or malformed
 * body is validated as `{}`, so it produces the same 400 as any other bad
 * input instead of throwing into a 500.
 *
 *   const body = await parseBody(request, schema)
 *   if (body.response) return body.response
 *   body.data // typed
 */
export async function parseBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
  message?: string
): Promise<Parsed<z.infer<S>>> {
  const raw = await request.json().catch(() => ({}))
  const result = schema.safeParse(raw)
  if (!result.success) return { response: validationError(result.error, message) }
  return { data: result.data }
}
