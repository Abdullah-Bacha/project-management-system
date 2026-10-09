import mongoose, { Schema, model, models, Document } from 'mongoose'
import {
  USER_ROLES,
  USER_STATUSES,
  PROJECT_STATUSES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  NOTIFICATION_TYPES,
  ACTIVITY_TYPES,
  type UserRole,
  type UserStatus,
  type ProjectStatus,
  type TaskStatus,
  type TaskPriority,
  type NotificationType,
  type ActivityType,
} from '@/types'

// Enum values live in src/types so the UI and the database cannot drift apart.
export type { UserRole }

// ---------- User ----------
// Closed provisioning model: only an admin creates accounts. A team_leader
// runs both their team and whatever project that team is staffed on; a
// developer works the tasks. There is no self-registration and no separate
// project-manager role — the team_leader is the project's manager.

export interface IUser extends Document {
  name: string
  email: string
  password: string
  role: UserRole
  status: UserStatus
  profilePicture?: string
  phone?: string
  /** The last moment a signed-in tab of theirs was connected (UTC). See lib/presence. */
  lastSeenAt?: Date
  /** Bumped when credentials change; tokens carrying an older value are rejected. */
  tokenVersion?: number
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
    role: { type: String, enum: [...USER_ROLES], default: 'developer' },
    status: { type: String, enum: [...USER_STATUSES], default: 'active' },
    profilePicture: { type: String, default: '' },
    phone: { type: String, default: '', trim: true },
    lastSeenAt: { type: Date },
    tokenVersion: { type: Number, default: 0 },
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
  status: ProjectStatus
  progress: number
  startDate?: Date
  deadline?: Date
  creationKey?: string
  referenceLinks?: { label?: string; url: string }[]
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
    status: { type: String, enum: [...PROJECT_STATUSES], default: 'active' },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    startDate: { type: Date },
    deadline: { type: Date },
    // Set only when a project is created from a template: one key per attempt, so a
    // repeated submission finds the project it already made instead of making another.
    creationKey: { type: String },
    // Reference material (the expected website, a Figma design…): web links the whole team can open.
    referenceLinks: [
      new Schema({ label: { type: String, default: '' }, url: { type: String, required: true } }, { _id: false }),
    ],
  },
  { timestamps: true }
)

// ---------- Task ----------
export interface ITask extends Document {
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  projectId: mongoose.Types.ObjectId
  assignedTo?: mongoose.Types.ObjectId
  createdBy: mongoose.Types.ObjectId
  tags?: string[]
  startDate?: Date
  dueDate?: Date
  estimatedHours?: number
  actualHours: number
  /** Server time of the first move to In Progress / of reaching Complete. */
  startedAt?: Date
  completedAt?: Date
  order: number
  createdAt: Date
  updatedAt: Date
}

const TaskSchema = new Schema<ITask>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    status: { type: String, enum: [...TASK_STATUSES], default: 'todo' },
    priority: { type: String, enum: [...TASK_PRIORITIES], default: 'medium' },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tags: [{ type: String }],
    startDate: { type: Date },
    dueDate: { type: Date },
    estimatedHours: { type: Number, default: 0 },
    actualHours: { type: Number, default: 0 },
    startedAt: { type: Date },
    completedAt: { type: Date },
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
  type: NotificationType
  taskId?: mongoose.Types.ObjectId
  projectId?: mongoose.Types.ObjectId
  message: string
  read: boolean
  createdAt: Date
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: [...NOTIFICATION_TYPES], required: true },
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

// ---------- Indexes ----------
// One entry per real query pattern. Compound indexes lead with the field the
// queries filter on, so they also serve plain lookups on that field — no
// separate single-field index is declared (it would be redundant). Mongoose
// builds these on first connect (autoIndex); existing data is untouched.

export interface IAttachment extends Document {
  taskId: mongoose.Types.ObjectId
  projectId: mongoose.Types.ObjectId
  uploadedBy: mongoose.Types.ObjectId
  /** The name as shown to people (path and control characters removed). */
  originalName: string
  /** Where the bytes are in file storage. Generated by the server, never sent to a client. */
  storageKey: string
  /** Decided by the server from the file extension, not copied from the client. */
  mimeType: string
  size: number
  createdAt: Date
}

// File attachments of a task: metadata and a storage reference only. The file
// itself lives in file storage (see lib/storage), never in the database.
const AttachmentSchema = new Schema<IAttachment>(
  {
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    originalName: { type: String, required: true, maxlength: 150 },
    storageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 1 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

// ---------- Project file ----------
// A file shared with a whole project (reference material), as opposed to a
// task attachment. Metadata and a storage reference only; the bytes live in
// file storage (see lib/storage), never in the database.
export interface IProjectFile extends Document {
  projectId: mongoose.Types.ObjectId
  uploadedBy: mongoose.Types.ObjectId
  originalName: string
  storageKey: string
  mimeType: string
  size: number
  createdAt: Date
}

const ProjectFileSchema = new Schema<IProjectFile>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    originalName: { type: String, required: true, maxlength: 150 },
    storageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 1 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

// A project's files, newest first; also the cleanup when the project is deleted.
ProjectFileSchema.index({ projectId: 1, createdAt: -1 })

// ---------- Task dependency ----------
// "blockingTaskId must be finished before blockedTaskId can proceed". One row
// per relationship, always inside one project. Informational only: it never
// changes a task's status.
export interface ITaskDependency extends Document {
  projectId: mongoose.Types.ObjectId
  blockingTaskId: mongoose.Types.ObjectId
  blockedTaskId: mongoose.Types.ObjectId
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
}

const TaskDependencySchema = new Schema<ITaskDependency>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    blockingTaskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    blockedTaskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

// ---------- Project template ----------
// A reusable project structure: project defaults plus task blueprints. Owned by
// the admin who made it (like a project) and visible only to them. A template
// holds no ids of live data: no projects, tasks, users or teams.
export interface ITaskBlueprint {
  title: string
  description?: string
  priority: TaskPriority
  dueOffsetDays?: number
}

export interface IProjectTemplate extends Document {
  name: string
  /** Lower-cased name, so "Website" and "website " are one name per owner. */
  nameKey: string
  description?: string
  category?: string
  projectDescription?: string
  requirements?: string
  tasks: ITaskBlueprint[]
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const ProjectTemplateSchema = new Schema<IProjectTemplate>(
  {
    name: { type: String, required: true, trim: true },
    nameKey: { type: String, required: true },
    description: { type: String, default: '' },
    category: { type: String, default: '' },
    projectDescription: { type: String, default: '' },
    requirements: { type: String, default: '' },
    tasks: [
      new Schema(
        {
          title: { type: String, required: true, trim: true },
          description: { type: String, default: '' },
          priority: { type: String, enum: [...TASK_PRIORITIES], default: 'medium' },
          dueOffsetDays: { type: Number, min: 0 },
        },
        { _id: false }
      ),
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

// The library: find({ createdBy }).sort({ updatedAt: -1 }); also what makes a
// name unique per owner, so a double-clicked "Save" cannot make two templates.
ProjectTemplateSchema.index({ createdBy: 1, updatedAt: -1 })
ProjectTemplateSchema.index({ createdBy: 1, nameKey: 1 }, { unique: true })

// A repeated "create from template" request finds the project it already made.
ProjectSchema.index({ owner: 1, creationKey: 1 }, { unique: true, partialFilterExpression: { creationKey: { $type: 'string' } } })

export interface IActivity extends Document {
  projectId: mongoose.Types.ObjectId
  actorId: mongoose.Types.ObjectId
  type: ActivityType
  taskId?: mongoose.Types.ObjectId
  commentId?: mongoose.Types.ObjectId
  /** Only the few ids / values an entry needs to be written as a sentence. */
  metadata?: {
    from?: TaskStatus
    to?: TaskStatus
    assigneeId?: mongoose.Types.ObjectId
    previousAssigneeId?: mongoose.Types.ObjectId
    fileName?: string
    /** Dependency entries: the blocking task (the entry's own task is the blocked one). */
    relatedTaskId?: mongoose.Types.ObjectId
  }
  createdAt: Date
}

// A project's activity feed: who did what, when. References only — names and
// titles are looked up when the feed is read, never copied here.
const ActivitySchema = new Schema<IActivity>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: [...ACTIVITY_TYPES], required: true },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task' },
    commentId: { type: Schema.Types.ObjectId, ref: 'Comment' },
    metadata: {
      from: { type: String, enum: [...TASK_STATUSES] },
      to: { type: String, enum: [...TASK_STATUSES] },
      assigneeId: { type: Schema.Types.ObjectId, ref: 'User' },
      previousAssigneeId: { type: Schema.Types.ObjectId, ref: 'User' },
      fileName: { type: String, maxlength: 150 },
      relatedTaskId: { type: Schema.Types.ObjectId, ref: 'Task' },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

// find({ projectId }).sort({ order }) — kanban list; also the projectId-only
// find/count/updateMany/deleteMany used by analytics, reports and cascades.
TaskSchema.index({ projectId: 1, order: 1 })
// countDocuments({ projectId, status }) — syncProjectProgress on every task
// mutation; reports' completed-today lookup; the ?status= list filter.
TaskSchema.index({ projectId: 1, status: 1 })

// find({ taskId }).sort({ createdAt: -1 }) + countDocuments({ taskId });
// also deleteMany({ taskId }) in the task/project cascades.
CommentSchema.index({ taskId: 1, createdAt: -1 })

// find({ userId }).sort({ createdAt: -1 }) — notification list.
NotificationSchema.index({ userId: 1, createdAt: -1 })
// countDocuments({ userId, read: false }) (unread badge), updateMany for
// mark-all-read, and the ?read=false list filter.
NotificationSchema.index({ userId: 1, read: 1 })

// find({ $or: [{ owner }, { members }] }).sort({ createdAt: -1 }) — a $or
// only uses indexes when every branch is indexed, and with createdAt as the
// second key both branches arrive already sorted, so Mongo can merge them
// instead of sorting in memory.
ProjectSchema.index({ owner: 1, createdAt: -1 })
ProjectSchema.index({ members: 1, createdAt: -1 })

// find({ $or: [{ teamLeader }, { members }] }) — /api/teams/mine.
TeamSchema.index({ teamLeader: 1 })
TeamSchema.index({ members: 1 })

// find({ project }).sort({ createdAt: -1 }).limit(50) and
// deleteMany({ project }) on project delete.
ReportSchema.index({ project: 1, createdAt: -1 })

// The feed: find({ projectId }).sort({ createdAt: -1 }).limit(n); and the
// deleteMany({ taskId }) in the task cascade.
ActivitySchema.index({ projectId: 1, createdAt: -1 })
ActivitySchema.index({ taskId: 1 })

// One row per relationship (the race-proof duplicate guard). The two single
// -side lookups serve "what blocks this task" and "what does this task block",
// and the cycle walk; projectId serves the project-delete cleanup.
TaskDependencySchema.index({ projectId: 1, blockingTaskId: 1, blockedTaskId: 1 }, { unique: true })
TaskDependencySchema.index({ blockedTaskId: 1 })
TaskDependencySchema.index({ blockingTaskId: 1 })

// A task's attachments, newest first (list + count), and the cleanup when a
// project is deleted.
AttachmentSchema.index({ taskId: 1, createdAt: -1 })
AttachmentSchema.index({ projectId: 1 })

// ---------- Presence session ----------
// One document per open TaskFlow tab: which person, which tab, when it last said
// "still here", and when (if) it said goodbye. Online/offline is worked out from
// these (see lib/presence); nothing else depends on them, and old ones expire.
export interface IPresenceSession extends Document {
  userId: mongoose.Types.ObjectId
  tabId: string
  lastBeatAt: Date
  leftAt?: Date
  /** When this record may be deleted (a day after the last sign of life). */
  expiresAt: Date
}

const PresenceSessionSchema = new Schema<IPresenceSession>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tabId: { type: String, required: true },
  lastBeatAt: { type: Date, required: true },
  leftAt: { type: Date },
  expiresAt: { type: Date, required: true },
})

// A tab is one record per person: heartbeat = upsert on this key.
PresenceSessionSchema.index({ userId: 1, tabId: 1 }, { unique: true })
// Who is connected: find({ lastBeatAt >= …, leftAt … }).
PresenceSessionSchema.index({ lastBeatAt: -1 })
// Housekeeping: Mongo deletes a record once its expiresAt has passed.
PresenceSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// ---------- Message ----------
// A direct 1:1 message between two teammates (people who share a team).
export interface IMessage extends Document {
  sender: mongoose.Types.ObjectId
  recipient: mongoose.Types.ObjectId
  text: string
  readAt?: Date
  createdAt: Date
  updatedAt: Date
}

const MessageSchema = new Schema<IMessage>(
  {
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    readAt: { type: Date },
  },
  { timestamps: true }
)

// One conversation = both directions between two people, oldest first.
MessageSchema.index({ sender: 1, recipient: 1, createdAt: 1 })
MessageSchema.index({ recipient: 1, sender: 1, createdAt: 1 })

export const ProjectTemplate = models.ProjectTemplate || model<IProjectTemplate>('ProjectTemplate', ProjectTemplateSchema)
export const ProjectFile = models.ProjectFile || model<IProjectFile>('ProjectFile', ProjectFileSchema)
export const PresenceSession = models.PresenceSession || model<IPresenceSession>('PresenceSession', PresenceSessionSchema)
export const Message = models.Message || model<IMessage>('Message', MessageSchema)
export const User = models.User || model<IUser>('User', UserSchema)
export const Team = models.Team || model<ITeam>('Team', TeamSchema)
export const Project = models.Project || model<IProject>('Project', ProjectSchema)
export const Task = models.Task || model<ITask>('Task', TaskSchema)
export const Comment = models.Comment || model<IComment>('Comment', CommentSchema)
export const Notification =
  models.Notification || model<INotification>('Notification', NotificationSchema)
export const Report = models.Report || model<IReport>('Report', ReportSchema)
export const Activity = models.Activity || model<IActivity>('Activity', ActivitySchema)
export const Attachment = models.Attachment || model<IAttachment>('Attachment', AttachmentSchema)
export const TaskDependency =
  models.TaskDependency || model<ITaskDependency>('TaskDependency', TaskDependencySchema)
