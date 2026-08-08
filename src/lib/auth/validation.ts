import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export const tokenSchema = z.object({
  refreshToken: z.string(),
})

export type LoginInput = z.infer<typeof loginSchema>
export type TokenInput = z.infer<typeof tokenSchema>
