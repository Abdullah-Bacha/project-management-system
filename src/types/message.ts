/** A direct message between two teammates. */
export interface DirectMessage {
  _id: string
  sender: string
  recipient: string
  text: string
  readAt?: string
  createdAt: string
}
