import { Zap } from 'lucide-react'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-sunken p-4">
      {/* Soft brand wash behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-brand-300/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent/20 blur-3xl"
      />

      <div className="animate-rise relative w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent text-white">
            <Zap className="h-5 w-5" fill="currentColor" />
          </span>
          <span className="text-xl font-semibold tracking-tight text-ink">
            TaskFlow
          </span>
        </div>

        {children}
      </div>
    </div>
  )
}
