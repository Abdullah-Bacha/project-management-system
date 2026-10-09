import { NextRequest, NextResponse } from 'next/server'
import { Report } from '@/lib/db/models'
import { authorizeAdmin } from '@/lib/auth/authorize'
import { redactForDemo } from '@/lib/auth/demo'
import { parsePagination } from '@/lib/validation/query'

/** The admin feed of every report submitted by every team leader. */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeAdmin(request)
    if (auth.response) return auth.response

    const { skip, limit } = parsePagination(request.nextUrl.searchParams, {
      defaultLimit: 30,
      maxLimit: 100,
    })

    const [reports, total] = await Promise.all([
      Report.find()
        .populate('submittedBy', 'name email')
        .populate('project', 'title')
        .populate('team', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Report.countDocuments(),
    ])

    return NextResponse.json(redactForDemo(auth.data.email, { reports, total }), { status: 200 })
  } catch (error) {
    console.error('List admin reports error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
