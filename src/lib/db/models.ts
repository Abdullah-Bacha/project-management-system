import mongoose, { Schema, model, models, Document } from 'mongoose'

// ---------- User ----------
// Closed provisioning model: only an admin creates accounts. A team_leader
// runs both their team and whatever project that team is staffed on; a
// developer works the tasks. There is no self-registration and no separate
// project-manager role — the team_leader is the project's manager.
export type UserRole = 'admin' | 'team_leader' | 'developer'

export interface IUser extends Document {
  name: string
  email: string
  password: string
  role: UserRole
  status: 'active' | 'invited' | 'suspended'
  profilePicture?: string
  resetTokenHash?: string
  resetTokenExpires?: Date
  createdAt: Date
  updatedAt: Date
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['admin', 'team_leader', 'developer'],
      default: 'developer',
    },
    status: { type: String, enum: ['active', 'invited', 'suspended'], default: 'active' },
    profilePicture: { type: String, default: '' },
    // Only the hash is stored: a leaked database must not yield usable
    // reset links. Both fields are cleared once the token is spent.
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
  },
  { timestamps: true }
)

// ---------- Team ----------
// A reusable roster: one team_leader plus their developers. Admin builds
// these once and then assigns the whole team to a project at a time,
// instead of adding people one by one.
export interface ITeam extends Document {
  name: string
  description?: string
  teamLeader: mongoose.Types.ObjectId
  members: mongoose.Types.ObjectId[]
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const TeamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    teamLeader: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

// ---------- Project ----------
export interface IProject extends Document {
  title: string
  description?: string
  requirements?: string
  owner: mongoose.Types.ObjectId
  team?: mongoose.Types.ObjectId
  members: mongoose.Types.ObjectId[]
  status: 'active' | 'archived' | 'completed'
  progress: number
  color: string
  startDate?: Date
  deadline?: Date
  createdAt: Date
  updatedAt: Date
}

const ProjectSchema = new Schema<IProject>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    requirements: { type: String, default: '' },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // The roster staffed on the project. Its teamLeader runs the project day
    // to day; its members are kept in sync with `members` below (see the
    // /assign route).
    team: { type: Schema.Types.ObjectId, ref: 'Team' },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    status: { type: String, enum: ['active', 'archived', 'completed'], default: 'active' },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    color: { type: String, default: '#3B82F6' },
    startDate: { type: Date },
    deadline: { type: Date },
  },
  { timestamps: true }
)

// ---------- Task ----------
export interface ITask extends Document {
  title: string
  description?: string
  status: 'todo' | 'in-progress' | 'review' | 'complete'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  projectId: mongoose.Types.ObjectId
  assignedTo?: mongoose.Types.ObjectId
  createdBy: mongoose.Types.ObjectId
  tags?: string[]
  startDate?: Date
  dueDate?: Date
  estimatedHours?: number
  actualHours: number
  order: number
  createdAt: Date
  updatedAt: Date
}

const TaskSchema = new Schema<ITask>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    status: { type: String, enum: ['todo', 'in-progress', 'review', 'complete'], default: 'todo' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tags: [{ type: String }],
    startDate: { type: Date },
    dueDate: { type: Date },
    estimatedHours: { type: Number, default: 0 },
    actualHours: { type: Number, default: 0 },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
)

// ---------- Comment ----------
export interface IComment extends Document {
  taskId: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  text: string
  attachments?: string[]
  likes: mongoose.Types.ObjectId[]
  createdAt: Date
  updatedAt: Date
}

const CommentSchema = new Schema<IComment>(
  {
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
    attachments: [{ type: String }],
    likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
)

// ---------- Notification ----------
export interface INotification extends Document {
  userId: mongoose.Types.ObjectId
  type:
    | 'task-assigned'
    | 'task-completed'
    | 'comment-added'
    | 'deadline-reminder'
    | 'mention'
    | 'project-assigned'
    | 'report-submitted'
  taskId?: mongoose.Types.ObjectId
  projectId?: mongoose.Types.ObjectId
  message: string
  read: boolean
  createdAt: Date
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: [
        'task-assigned',
        'task-completed',
        'comment-added',
        'deadline-reminder',
        'mention',
        'project-assigned',
        'report-submitted',
      ],
      required: true,
    },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task' },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
)

// ---------- Report ----------
// A team_leader's manual "here's where we are" submission to admin: a
// snapshot of what the team finished that day plus the project's overall
// completion. Distinct from Notification — a report is a record admin can
// review later, not just a transient alert.
export interface IReport extends Document {
  project: mongoose.Types.ObjectId
  team: mongoose.Types.ObjectId
  submittedBy: mongoose.Types.ObjectId
  note?: string
  completedToday: { task: mongoose.Types.ObjectId; title: string }[]
  totalTasks: number
  completedTasks: number
  completionRate: number
  createdAt: Date
}

const ReportSchema = new Schema<IReport>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, default: '', maxlength: 2000 },
    completedToday: [
      {
        task: { type: Schema.Types.ObjectId, ref: 'Task' },
        title: { type: String, required: true },
      },
    ],
    totalTasks: { type: Number, required: true },
    completedTasks: { type: Number, required: true },
    completionRate: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

export const User = models.User || model<IUser>('User', UserSchema)
export const Team = models.Team || model<ITeam>('Team', TeamSchema)
export const Project = models.Project || model<IProject>('Project', ProjectSchema)
export const Task = models.Task || model<ITask>('Task', TaskSchema)
export const Comment = models.Comment || model<IComment>('Comment', CommentSchema)
export const Notification =
  models.Notification || model<INotification>('Notification', NotificationSchema)
export const Report = models.Report || model<IReport>('Report', ReportSchema)
