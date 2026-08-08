import { NextRequest, NextResponse } from 'next/server'
import { Report } from '@/lib/db/models'
import { authorizeAdmin } from '@/lib/auth/authorize'

/** Admin's cross-project feed of every report submitted by every team leader. */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeAdmin(request)
    if (auth.response) return auth.response

    const skip = parseInt(request.nextUrl.searchParams.get('skip') || '0')
    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get('limit') || '30'),
      100
    )

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

    return NextResponse.json({ reports, total }, { status: 200 })
  } catch (error) {
    console.error('List admin reports error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
