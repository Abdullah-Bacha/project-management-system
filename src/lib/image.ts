/** Largest side of a stored profile photo, in pixels. */
export const AVATAR_SIZE = 192
/** Biggest file a person may pick (it is shrunk before it is sent). */
export const MAX_PICKED_BYTES = 8 * 1024 * 1024

/**
 * Turn a picked image into a small square JPEG data URL (centre-cropped, 192px).
 * Shrinking in the browser keeps the stored photo to a few tens of KB.
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.')
  if (file.size > MAX_PICKED_BYTES) throw new Error('That image is too large (max 8 MB).')

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('That file could not be read as an image.'))
      el.src = url
    })
    const side = Math.min(img.width, img.height)
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_SIZE
    canvas.height = AVATAR_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Your browser cannot process images.')
    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
    return canvas.toDataURL('image/jpeg', 0.8)
  } finally {
    URL.revokeObjectURL(url)
  }
}
