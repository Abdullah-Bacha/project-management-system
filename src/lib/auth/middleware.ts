import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from './jwt'

export async function authenticateRequest(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return { user: null, error: 'Unauthorized' }
    }

    const token = authHeader.slice(7)
    const payload = verifyToken(token, false)

    if (!payload) {
      return { user: null, error: 'Invalid token' }
    }

    return { user: payload, error: null }
  } catch (error) {
    return { user: null, error: 'Authentication failed' }
  }
}

export function createErrorResponse(message: string, status: number = 400) {
  return NextResponse.json({ error: message }, { status })
}

export function createSuccessResponse(data: any, status: number = 200) {
  return NextResponse.json(data, { status })
}
