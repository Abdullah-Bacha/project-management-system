'use client'

import { useState } from 'react'
import { Lock, Mail, Phone, ShieldAlert, User as UserIcon } from 'lucide-react'
import { adminUsersService, type AdminUser } from '@/services/admin.service'
import { errorMessage } from '@/services/client'
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '@/lib/roles'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { USER_STATUSES, type UserRole, type UserStatus } from '@/types'
import { AvatarPicker } from './AvatarPicker'

const STATUS_LABELS: Record<UserStatus, string> = { active: 'Active', invited: 'Invited', suspended: 'Suspended' }

/**
 * Edit an account: photo, name, contact number, role and status. The email is
 * the account's identity and is shown, not changed. Only what changed is sent.
 */
export function EditUserModal({
  user,
  isMe,
  onClose,
  onSaved,
}: {
  user: AdminUser
  isMe: boolean
  onClose: () => void
  onSaved: (user: AdminUser) => void
}) {
  const [name, setName] = useState(user.name)
  const [phone, setPhone] = useState(user.phone ?? '')
  const [photo, setPhoto] = useState(user.profilePicture ?? '')
  const [role, setRole] = useState<UserRole>(user.role)
  const [status, setStatus] = useState<UserStatus>(user.status)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (saving) return
    setError('')
    if (name.trim().length < 2) return setError('Name must be at least 2 characters')

    const changes = {
      ...(name.trim() !== user.name && { name: name.trim() }),
      ...(phone.trim() !== (user.phone ?? '') && { phone: phone.trim() }),
      ...(photo !== (user.profilePicture ?? '') && { profilePicture: photo }),
      ...(role !== user.role && { role }),
      ...(status !== user.status && { status }),
    }
    if (Object.keys(changes).length === 0) return onClose()

    setSaving(true)
    try {
      onSaved(await adminUsersService.update(user._id, changes))
    } catch (e) {
      setError(errorMessage(e, 'Could not save the changes'))
      setSaving(false)
    }
  }

  return (
    <Modal title="Edit user" placement="right" onClose={saving ? () => {} : onClose}>
      <form
        id="edit-user-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"
      >
        {error && (
          <p role="alert" className="flex items-center gap-1.5 rounded-lg bg-critical-subtle px-3 py-2 text-sm text-critical-strong">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        <AvatarPicker name={name} value={photo} onChange={setPhoto} />

        <Input label="Full name" icon={<UserIcon className="h-4 w-4" />} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        <Input label="Email" icon={<Mail className="h-4 w-4" />} value={user.email} disabled readOnly helperText="The email is the account's sign-in and cannot be changed here" />
        <Input label="Contact number (optional)" type="tel" icon={<Phone className="h-4 w-4" />} value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as UserRole)} disabled={isMe}>
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as UserStatus)} disabled={isMe}>
            {USER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        {isMe ? (
          <p className="flex items-center gap-1.5 text-xs text-ink-faint">
            <Lock className="h-3 w-3" />
            You cannot change your own role or status.
          </p>
        ) : (
          status === 'suspended' && <p className="text-xs text-caution-strong">A suspended account is signed out and cannot sign in until it is made Active again.</p>
        )}
      </form>

      <footer className="flex shrink-0 gap-3 border-t border-hairline p-4">
        <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" form="edit-user-form" isLoading={saving} className="flex-1">
          Save changes
        </Button>
      </footer>
    </Modal>
  )
}
