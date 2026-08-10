type MessageHandler = (data: any) => void
type EventMap = {
  [key: string]: MessageHandler[]
}

export class RealtimeSocket {
  private ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 3000
  private messageQueue: string[] = []
  private eventListeners: EventMap = {}
  private isConnecting = false

  constructor(url?: string) {
    this.url = url || this.getWebSocketUrl()
  }

  private getWebSocketUrl(): string {
    if (typeof window === 'undefined') return ''
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/api/ws`
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting) {
        reject(new Error('Connection already in progress'))
        return
      }

      this.isConnecting = true

      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          console.log('🔗 WebSocket connected')
          this.isConnecting = false
          this.reconnectAttempts = 0
          this.flushMessageQueue()
          this.emit('connected', null)
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            this.emit(message.type, message.data)
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err)
          }
        }

        this.ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error)
          this.isConnecting = false
          reject(error)
        }

        this.ws.onclose = () => {
          console.log('🔌 WebSocket disconnected')
          this.isConnecting = false
          this.attemptReconnect()
        }
      } catch (err) {
        this.isConnecting = false
        reject(err)
      }
    })
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(
        `📡 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
      )
      setTimeout(() => {
        this.connect().catch((err) => {
          console.error('Reconnection failed:', err)
        })
      }, this.reconnectDelay)
    } else {
      console.error('❌ Max reconnection attempts reached')
    }
  }

  send(type: string, data: any = null): void {
    const message = JSON.stringify({ type, data })

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message)
    } else {
      this.messageQueue.push(message)
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift()
      if (message) {
        this.ws.send(message)
      }
    }
  }

  on(eventType: string, handler: MessageHandler): () => void {
    if (!this.eventListeners[eventType]) {
      this.eventListeners[eventType] = []
    }
    this.eventListeners[eventType].push(handler)

    // Return unsubscribe function
    return () => {
      const handlers = this.eventListeners[eventType]
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  private emit(eventType: string, data: any): void {
    const handlers = this.eventListeners[eventType]
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data)
        } catch (err) {
          console.error(`Error in event handler for ${eventType}:`, err)
        }
      })
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.messageQueue = []
    this.reconnectAttempts = 0
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
}

// Singleton instance
let socketInstance: RealtimeSocket | null = null

export function getRealtimeSocket(): RealtimeSocket {
  if (!socketInstance) {
    socketInstance = new RealtimeSocket()
  }
  return socketInstance
}
