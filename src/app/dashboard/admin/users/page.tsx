'use client'

import { useState } from 'react'
import { UserPlus, X, Mail, User as UserIcon, Lock, ShieldAlert, Phone } from 'lucide-react'
import { adminUsersService, type AdminUser } from '@/services/admin.service'
import { useAuthStore } from '@/store/authStore'
import { useAuth } from '@/hooks/useAuth'
import { useLoad } from '@/hooks/useLoad'
import { useToast } from '@/hooks/useToast'
import { ROLE_LABELS, ASSIGNABLE_ROLES } from '@/lib/roles'
import { UserCard } from '@/features/users/UserCard'
import { AvatarPicker } from '@/features/users/AvatarPicker'
import { usePresence } from '@/hooks/usePresence'
import { EditUserModal } from '@/features/users/EditUserModal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { EmptyState, ErrorState } from '@/components/ui/PageState'
import type { UserRole } from '@/types'
import { errorMessage } from '@/services/client'
import { AdminOnly } from '@/features/auth/AdminOnly'

const ROLE_FILTERS: (UserRole | 'all')[] = ['all', 'admin', 'team_leader', 'developer']

function AdminUsersContent() {
  const { user: me } = useAuth()
  const [filter, setFilter] = useState<UserRole | 'all'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  // Who has a TaskFlow tab open, refreshed every few seconds.
  const presence = usePresence()
  const { notify, toastNode } = useToast()

  const list = useLoad(
    () => adminUsersService.list(filter === 'all' ? undefined : filter),
    [filter]
  )
  const users = list.data?.users

  const handleRoleChange = async (id: string, role: UserRole) => {
    setBusyId(id)
    try {
      const updated = await adminUsersService.update(id, { role })
      // Apply the answer directly: replace the row, or drop it if it no
      // longer matches the active role filter.
      list.setData((current) =>
        current && {
          ...current,
          users: current.users.flatMap((u) =>
            u._id !== id ? [u] : filter === 'all' || updated.role === filter ? [updated] : []
          ),
        }
      )
      notify('success', 'Role updated')
    } catch (e) {
      notify('error', errorMessage(e, 'Failed to update role'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Users</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Create admins, team leaders and developers.
          </p>
        </div>
        {!showCreate && (
          <Button onClick={() => setShowCreate(true)} icon={<UserPlus className="h-4 w-4" />}>
            Create user
          </Button>
        )}
      </header>

      {showCreate && (
        <CreateUserForm
          onCancel={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            void list.reload()
          }}
        />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2" role="status" aria-live="polite" aria-label="Online users">
        {presence.counts ? (
          <>
            <span className="inline-flex items-center gap-2 rounded-full bg-positive-subtle px-3 py-1 text-xs font-medium text-positive-strong">
              <span aria-hidden className="h-2 w-2 rounded-full bg-positive" />
              {presence.counts.online} online
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-surface-sunken px-3 py-1 text-xs font-medium text-ink-muted">
              <span aria-hidden className="h-2 w-2 rounded-full bg-ink-faint" />
              {presence.counts.offline} offline
            </span>
          </>
        ) : presence.error ? (
          <span className="text-xs text-ink-faint">Online status is unavailable right now.</span>
        ) : (
          <span className="inline-block h-6 w-40 animate-pulse rounded-full bg-surface-sunken" aria-hidden />
        )}
      </div>

      <div className="mt-4 flex gap-1.5 overflow-x-auto">
        {ROLE_FILTERS.map((role) => (
          <button
            key={role}
            onClick={() => setFilter(role)}
            className={
              filter === role
                ? 'shrink-0 rounded-full bg-interactive px-3.5 py-1.5 text-xs font-medium text-on-brand'
                : 'shrink-0 rounded-full bg-surface-sunken px-3.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-hairline'
            }
          >
            {role === 'all' ? 'All' : ROLE_LABELS[role]}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {list.loading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-14 rounded-xl" />
            ))}
          </div>
        ) : !users ? (
          <ErrorState message={list.error} status={list.errorStatus} onRetry={list.reload} />
        ) : users.length === 0 ? (
          <EmptyState icon={<UserIcon className="h-6 w-6" />} title="No users in this filter" />
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {users.map((u, i) => (
              <UserCard
                key={u._id}
                user={u}
                index={i}
                isMe={u._id === me?._id}
                busy={busyId === u._id}
                onRoleChange={(role) => handleRoleChange(u._id, role)}
                onEdit={() => setEditing(u)}
                presence={presence.byId.get(u._id)}
              />
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <EditUserModal
          user={editing}
          isMe={editing._id === me?._id}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            // Replace the row (or drop it if it no longer matches the role filter).
            list.setData((current) =>
              current && {
                ...current,
                users: current.users.flatMap((u) => (u._id !== updated._id ? [u] : filter === 'all' || updated.role === filter ? [updated] : [])),
              }
            )
            if (updated._id === me?._id) {
              const store = useAuthStore.getState()
              if (store.user) store.setUser({ ...store.user, name: updated.name, phone: updated.phone, profilePicture: updated.profilePicture })
            }
            setEditing(null)
            notify('success', `Saved changes to ${updated.name}`)
          }}
        />
      )}

      {toastNode}
    </div>
  )
}

function CreateUserForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'developer' as UserRole,
    phone: '',
    profilePicture: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (form.name.trim().length < 2) return setError('Name must be at least 2 characters')
    if (form.password.length < 6) return setError('Password must be at least 6 characters')

    setLoading(true)
    try {
      await adminUsersService.create({
        name: form.name.trim(),
        email: form.email,
        password: form.password,
        role: form.role,
        ...(form.phone.trim() && { phone: form.phone.trim() }),
        ...(form.profilePicture && { profilePicture: form.profilePicture }),
      })
      onCreated()
    } catch (e) {
      setError(errorMessage(e, 'Failed to create user'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-rise mt-5 rounded-card border border-hairline bg-surface p-5 shadow-card"
    >
      <div className="mb-5">
        <AvatarPicker name={form.name} value={form.profilePicture} onChange={(profilePicture) => setForm({ ...form, profilePicture })} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Input
          label="Full name"
          placeholder="e.g. Ayesha Khan"
          autoComplete="off"
          icon={<UserIcon className="h-4 w-4" />}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Input
          label="Email"
          type="email"
          placeholder="name@company.com"
          autoComplete="off"
          icon={<Mail className="h-4 w-4" />}
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Input
          label="Temporary password"
          type="password"
          placeholder="At least 6 characters"
          autoComplete="new-password"
          icon={<Lock className="h-4 w-4" />}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          helperText="They can change this after signing in"
        />
        <Input
          label="Contact number (optional)"
          type="tel"
          placeholder="+92 300 1234567"
          icon={<Phone className="h-4 w-4" />}
          value={form.phone}
          maxLength={30}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <Select
          label="Role"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
        >
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </div>

      {error && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-critical-strong">
          <ShieldAlert className="h-3.5 w-3.5" />
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2 border-t border-hairline pt-4">
        <Button type="submit" isLoading={loading}>
          Create user
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} icon={<X className="h-4 w-4" />}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export default function AdminUsersPage() {
  return (
    <AdminOnly>
      <AdminUsersContent />
    </AdminOnly>
  )
}
