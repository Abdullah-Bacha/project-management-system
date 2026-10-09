import { z } from 'zod'

/**
 * A small profile photo sent as a data URL (the browser shrinks it to ~192px
 * first): PNG / JPEG / WebP only (never SVG, which can carry script), bounded size.
 */
export const profilePictureSchema = z
  .string()
  .max(200_000)
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Invalid image')

/** For updates: a photo, or an empty string to remove it. */
export const profilePictureUpdateSchema = z.union([z.literal(''), profilePictureSchema])
