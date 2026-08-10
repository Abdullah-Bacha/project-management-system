import 'dotenv/config'
import { connectToDatabase } from './mongodb'
import { User, Team, Project, Task, Comment, Notification } from './models'
import { hashPassword } from '@/lib/auth/password'

/**
 * Resets the database to a small demo dataset that matches the current
 * schema: an admin, a team leader with two developers grouped into a team,
 * and one project staffed with that team. There is no project_manager role —
 * the team leader runs the project.
 *
 * Destructive by design — clears every collection first — so only run this
 * against a scratch/dev database.
 */
async function seed() {
  try {
    await connectToDatabase()
    console.log('[Seed] Connected to database')

    await Promise.all([
      User.deleteMany({}),
      Team.deleteMany({}),
      Project.deleteMany({}),
      Task.deleteMany({}),
      Comment.deleteMany({}),
      Notification.deleteMany({}),
    ])
    console.log('[Seed] Cleared existing data')

    const passwordHash = await hashPassword('Password123!')
    const demoPasswordHash = await hashPassword('testing@123')

    const admin = await User.create({
      name: 'Alex Admin',
      email: 'admin@taskflow.dev',
      password: passwordHash,
      role: 'admin',
      status: 'active',
    })

    const demoAdmin = await User.create({
      name: 'Demo Admin',
      email: 'testing@gmail.com',
      password: demoPasswordHash,
      role: 'admin',
      status: 'active',
    })

    const leader = await User.create({
      name: 'Leo Leader',
      email: 'leader@taskflow.dev',
      password: passwordHash,
      role: 'team_leader',
      status: 'active',
    })

    const dev1 = await User.create({
      name: 'Dana Developer',
      email: 'dana@taskflow.dev',
      password: passwordHash,
      role: 'developer',
      status: 'active',
    })

    const dev2 = await User.create({
      name: 'Sam Developer',
      email: 'sam@taskflow.dev',
      password: passwordHash,
      role: 'developer',
      status: 'active',
    })

    console.log('[Seed] Created users:', {
      admin: admin.email,
      leader: leader.email,
      developers: [dev1.email, dev2.email],
    })

    const team = await Team.create({
      name: 'Alpha Squad',
      description: 'Core product team',
      teamLeader: leader._id,
      members: [dev1._id, dev2._id],
      createdBy: admin._id,
    })

    console.log('[Seed] Created team:', team.name)

    const project = await Project.create({
      title: 'Website Redesign',
      description: 'Revamp marketing site',
      requirements: 'Responsive layout, refreshed brand palette, faster load time.',
      owner: admin._id,
      team: team._id,
      members: [admin._id, leader._id, dev1._id, dev2._id],
      status: 'active',
    })

    console.log('[Seed] Created project:', project.title)

    const tasks = await Task.create([
      {
        title: 'Design homepage mockup',
        description: 'Create Figma mockup for new homepage',
        status: 'in-progress',
        priority: 'high',
        projectId: project._id,
        assignedTo: dev1._id,
        createdBy: leader._id,
        dueDate: new Date('2026-08-15'),
        estimatedHours: 8,
      },
      {
        title: 'Set up CI/CD pipeline',
        status: 'todo',
        priority: 'medium',
        projectId: project._id,
        assignedTo: dev2._id,
        createdBy: leader._id,
        estimatedHours: 5,
      },
      {
        title: 'Review brand palette',
        status: 'complete',
        priority: 'low',
        projectId: project._id,
        assignedTo: leader._id,
        createdBy: leader._id,
        actualHours: 2,
      },
    ])

    // Keep progress consistent with the seeded tasks rather than hardcoding it.
    const completed = tasks.filter((t: any) => t.status === 'complete').length
    project.progress = Math.round((completed / tasks.length) * 100)
    await project.save()

    console.log('[Seed] Created tasks:', tasks.length)
    console.log('[Seed] Complete! Test credentials:')
    console.log('\n🎯 DEMO ACCOUNT (for testing):')
    console.log('  Email: testing@gmail.com')
    console.log('  Password: testing@123')
    console.log('  Role: admin')
    console.log('\n📝 Other test accounts (password: "Password123!"):')
    console.log('  admin@taskflow.dev      (admin)')
    console.log('  leader@taskflow.dev     (team leader — runs the project)')
    console.log('  dana@taskflow.dev       (developer)')
    console.log('  sam@taskflow.dev        (developer)')
    process.exit(0)
  } catch (err) {
    console.error('[Seed] Error:', err)
    process.exit(1)
  }
}

seed()
