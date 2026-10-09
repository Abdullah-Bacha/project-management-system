'use client'

import { useRef, useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { fileToAvatarDataUrl } from '@/lib/image'

/** Choose a profile photo. Shows a preview (or the person's initial), and can remove it again. */
export function AvatarPicker({ name, value, onChange }: { name: string; value: string; onChange: (dataUrl: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const pick = async (file?: File) => {
    if (!file) return
    setError('')
    setBusy(true)
    try {
      onChange(await fileToAvatarDataUrl(file))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use that image.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = '' // allow choosing the same file again
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink-soft">Profile photo (optional)</p>
      <div className="flex items-center gap-4">
        <Avatar name={name} src={value || undefined} size="xl" />
        <div className="min-w-0">
          <input
            ref={input}
            id="profile-photo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" isLoading={busy} icon={<Camera className="h-4 w-4" />} onClick={() => input.current?.click()}>
              {value ? 'Change photo' : 'Add photo'}
            </Button>
            {value && (
              <Button type="button" variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => onChange('')}>
                Remove
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-ink-faint">PNG, JPG or WebP. It is cropped to a square and shrunk.</p>
          {error && (
            <p role="alert" className="mt-1 text-xs text-critical-strong">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
