import Image from 'next/image'

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
        {/* The KeyDevs logo as transparent artwork: dark for the light theme, white for the dark theme. */}
        <header className="mb-8 flex flex-col items-center text-center">
          <Image src="/keydevs-light.png" alt="KeyDevs Technologies" width={560} height={285} priority className="h-24 w-auto dark:hidden" />
          <Image src="/keydevs-dark.png" alt="KeyDevs Technologies" width={560} height={285} priority className="hidden h-24 w-auto dark:block" />
          <p className="mt-3 text-xs font-medium uppercase tracking-[0.2em] text-ink-muted">Project Management System</p>
        </header>

        {children}
      </div>
    </div>
  )
}
