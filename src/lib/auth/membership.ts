/**
 * Pure membership predicates.
 *
 * Kept free of database and request concerns so they can be tested directly —
 * these two functions are what stand between a user and someone else's data.
 *
 * Ids arrive in several shapes depending on whether a document was populated:
 * an ObjectId, a populated `{ _id }` document, or a plain string. Everything
 * is normalised to a string before comparing. `Array.includes(userId)` on a
 * list of ObjectIds silently never matches, which is exactly the kind of bug
 * these guards must not have.
 */

type IdLike = string | { _id?: unknown; toString(): string } | null | undefined

export function toId(value: IdLike): string | null {
  if (value === null || value === undefined) return null

  if (typeof value === 'object' && '_id' in value && value._id != null) {
    return String(value._id)
  }

  const asString = String(value)
  return asString === '' || asString === '[object Object]' ? null : asString
}

export interface ProjectLike {
  owner?: IdLike
  members?: IdLike[]
}

export function isProjectOwner(project: ProjectLike, userId: string): boolean {
  if (!userId) return false
  const owner = toId(project?.owner)
  return owner !== null && owner === userId
}

export function isProjectMember(project: ProjectLike, userId: string): boolean {
  if (!userId) return false
  if (isProjectOwner(project, userId)) return true

  return (project?.members ?? []).some((member) => toId(member) === userId)
}
