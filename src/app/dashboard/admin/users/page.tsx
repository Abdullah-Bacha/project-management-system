'use client'

import { useState, useEffect } from 'react'
import { UserPlus, X, Mail, User as UserIcon, Lock, ShieldAlert } from 'lucide-react'
import { adminUsersService } from '@/services/admin.service'
import { useAuth } from '@/hooks/useAuth'
import { UserRole } from '@/types'
import { ROLE_LABELS, ROLE_BADGE_CLASSES, ASSIGNABLE_ROLES } from '@/lib/roles'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toast } from '@/components/ui/Toast'

const ROLE_FILTERS: (UserRole | 'all')[] = ['all', 'admin', 'team_leader', 'developer']

export default function AdminUsersPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<UserRole | 'all'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<{
    type: 'error' | 'success'
    message: string
  } | null>(null)

  const load = async () => {
    try {
      setLoading(true)
      const data = await adminUsersService.list(filter === 'all' ? undefined : filter)
      setUsers(data.users)
    } catch (e: any) {
      setToast({
        type: 'error',
        message: e.response?.status === 403 ? 'Admin access required' : 'Failed to load users',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  const handleRoleChange = async (id: string, role: UserRole) => {
    setBusyId(id)
    try {
      await adminUsersService.update(id, { role })
      setToast({ type: 'success', message: 'Role updated' })
      await load()
    } catch (e: any) {
      setToast({
        type: 'error',
        message: e.response?.data?.error || 'Failed to update role',
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Users</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Create project managers, team leaders and developers.
          </p>
        </div>
        {!showCreate && (
          <Button
            onClick={() => setShowCreate(true)}
            icon={<UserPlus className="h-4 w-4" />}
          >
            Create user
          </Button>
        )}
      </header>

      {showCreate && (
        <CreateUserForm
          onCancel={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            load()
          }}
        />
      )}

      <div className="mt-6 flex gap-1.5 overflow-x-auto">
        {ROLE_FILTERS.map((role) => (
          <button
            key={role}
            onClick={() => setFilter(role)}
            className={
              filter === role
                ? 'shrink-0 rounded-full bg-brand-600 px-3.5 py-1.5 text-xs font-medium text-white'
                : 'shrink-0 rounded-full bg-surface-sunken px-3.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-hairline'
            }
          >
            {role === 'all' ? 'All' : ROLE_LABELS[role]}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
        {loading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-14 rounded-xl" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <UserIcon className="h-6 w-6" />
            </span>
            <h3 className="mt-4 font-medium text-ink">No users in this filter</h3>
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {users.map((u, i) => (
              <li
                key={u._id}
                className="animate-rise flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-sunken"
                style={{ animationDelay: `${Math.min(i, 8) * 0.03}s` }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent text-sm font-semibold text-white">
                  {u.name?.charAt(0).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{u.name}</p>
                  <p className="truncate text-sm text-ink-muted">{u.email}</p>
                </div>

                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${ROLE_BADGE_CLASSES[u.role as UserRole]}`}
                >
                  {ROLE_LABELS[u.role as UserRole] ?? u.role}
                </span>

                <select
                  value={u.role}
                  disabled={busyId === u._id || u._id === me?._id}
                  onChange={(e) => handleRoleChange(u._id, e.target.value as UserRole)}
                  title={u._id === me?._id ? 'You cannot change your own role' : 'Change role'}
                  className="h-9 rounded-lg border border-hairline bg-surface px-2.5 text-xs text-ink disabled:opacity-40"
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </div>

      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
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
      await adminUsersService.create(form)
      onCreated()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-rise mt-5 rounded-card border border-hairline bg-surface p-5 shadow-card"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Full name"
          icon={<UserIcon className="h-4 w-4" />}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Input
          label="Email"
          type="email"
          icon={<Mail className="h-4 w-4" />}
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Input
          label="Temporary password"
          type="password"
          icon={<Lock className="h-4 w-4" />}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          helperText="They can change this after signing in"
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-soft">Role</label>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink transition-all focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-critical">
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
