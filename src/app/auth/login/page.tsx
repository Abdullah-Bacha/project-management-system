import { LoginForm } from '@/components/auth/LoginForm'

export const metadata = {
  title: 'Login - TaskFlow',
  description: 'Sign in to your TaskFlow account',
}

export default function LoginPage() {
  return (
    <div className="flex justify-center">
      <LoginForm />
    </div>
  )
}
