import jwt from 'jsonwebtoken'

/**
 * Signing secrets.
 *
 * These are deliberately NOT given fallback values. A hardcoded default would
 * be committed to the repository, and anyone who read it could forge a token
 * for any account — which silently defeats every authorization check in the
 * app. Failing to boot is the safer outcome.
 */
function requireSecret(name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(
      `${name} is not set. Add it to .env.local — generate one with:\n` +
        `  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
    )
  }

  if (value.length < 32) {
    throw new Error(`${name} must be at least 32 characters.`)
  }

  return value
}

const JWT_SECRET = requireSecret('JWT_SECRET')
const JWT_REFRESH_SECRET = requireSecret('JWT_REFRESH_SECRET')

// Access tokens are short-lived; the client silently exchanges the refresh
// token when one expires (see src/lib/api/client.ts).
const ACCESS_TTL = '1h'
const REFRESH_TTL = '7d'

export interface JWTPayload {
  userId: string
  email: string
  role: string
}

export function generateToken(payload: JWTPayload, isRefresh = false) {
  return jwt.sign(payload, isRefresh ? JWT_REFRESH_SECRET : JWT_SECRET, {
    expiresIn: isRefresh ? REFRESH_TTL : ACCESS_TTL,
  })
}

export function verifyToken(token: string, isRefresh = false) {
  try {
    return jwt.verify(
      token,
      isRefresh ? JWT_REFRESH_SECRET : JWT_SECRET
    ) as JWTPayload
  } catch {
    return null
  }
}

export function generateTokenPair(payload: JWTPayload) {
  return {
    token: generateToken(payload, false),
    refreshToken: generateToken(payload, true),
  }
}
