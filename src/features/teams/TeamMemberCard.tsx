'use client'

import { useState } from 'react'
import { ArrowLeft, Crown, Mail, MessageCircle, Phone, ShieldCheck, Users2 } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Button, buttonStyles } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ROLE_BADGE_CLASSES, ROLE_LABELS } from '@/lib/roles'
import { TeamMemberChat } from './TeamMemberChat'
import type { UserSummary } from '@/types'

interface TeamMemberCardProps {
  member: UserSummary
  teamName: string
  isTeamLeader: boolean
  isSelf: boolean
  onClose: () => void
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-surface-sunken px-3.5 py-3">
      <span className="mt-0.5 text-ink-faint">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{label}</p>
        <div className="mt-0.5 break-words text-sm text-ink">{children}</div>
      </div>
    </div>
  )
}

/** Side drawer with a teammate's full profile, plus a direct chat. */
export function TeamMemberCard({
  member,
  teamName,
  isTeamLeader,
  isSelf,
  onClose,
}: TeamMemberCardProps) {
  const [chatting, setChatting] = useState(false)
  const role = member.role

  return (
    <Modal
      title={chatting ? `Chat with ${member.name}` : 'Team member'}
      placement="right"
      onClose={onClose}
    >
      {chatting ? (
        <>
          <div className="flex shrink-0 items-center gap-3 border-b border-hairline px-5 py-3">
            <button
              onClick={() => setChatting(false)}
              className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-sunken hover:text-ink"
              aria-label="Back to profile"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <Avatar name={member.name} src={member.profilePicture} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{member.name}</p>
              <p className="truncate text-xs text-ink-muted">{role ? ROLE_LABELS[role] : ''}</p>
            </div>
          </div>
          <TeamMemberChat member={member} />
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
            <div className="h-20 bg-gradient-to-br from-brand-500 to-accent" />
            <div className="px-5 pb-5">
              <Avatar
                name={member.name}
                src={member.profilePicture}
                size="xl"
                className="-mt-10 ring-4 ring-surface"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-ink">{member.name}</h3>
                {isSelf && (
                  <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                    You
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {role && (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_BADGE_CLASSES[role]}`}
                  >
                    <ShieldCheck className="h-3 w-3" />
                    {ROLE_LABELS[role]}
                  </span>
                )}
                {isTeamLeader && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-caution-subtle px-2.5 py-1 text-xs font-medium text-caution-strong">
                    <Crown className="h-3 w-3" />
                    Team lead
                  </span>
                )}
              </div>

              <div className="mt-5 space-y-2">
                <Detail icon={<Mail className="h-4 w-4" />} label="Email">
                  <a href={`mailto:${member.email}`} className="text-interactive hover:underline">
                    {member.email}
                  </a>
                </Detail>
                <Detail icon={<Phone className="h-4 w-4" />} label="Contact number">
                  {member.phone ? (
                    <a href={`tel:${member.phone}`} className="text-interactive hover:underline">
                      {member.phone}
                    </a>
                  ) : (
                    <span className="text-ink-muted">Not provided</span>
                  )}
                </Detail>
                <Detail icon={<Users2 className="h-4 w-4" />} label="Team">
                  {teamName}
                </Detail>
              </div>

              {!isSelf && (
                <div className="mt-5 flex gap-2">
                  <Button
                    fullWidth
                    icon={<MessageCircle className="h-4 w-4" />}
                    onClick={() => setChatting(true)}
                  >
                    Chat
                  </Button>
                  {member.phone && (
                    <a
                      href={`tel:${member.phone}`}
                      className={buttonStyles({ variant: 'secondary' })}
                      aria-label={`Call ${member.name}`}
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
