'use client'

import { useEffect, useState } from 'react'
import { Activity } from 'lucide-react'

interface RealtimeStatusProps {
  lastUpdated?: Date | null
  isLoading?: boolean
  isConnected?: boolean
}

export function RealtimeStatus({
  lastUpdated,
  isLoading = false,
  isConnected = true,
}: RealtimeStatusProps) {
  const [timeAgo, setTimeAgo] = useState<string>('')

  useEffect(() => {
    if (!lastUpdated) return

    const updateTimeAgo = () => {
      const now = new Date()
      const diff = Math.floor((now.getTime() - new Date(lastUpdated).getTime()) / 1000)

      if (diff < 60) {
        setTimeAgo('just now')
      } else if (diff < 3600) {
        setTimeAgo(`${Math.floor(diff / 60)}m ago`)
      } else if (diff < 86400) {
        setTimeAgo(`${Math.floor(diff / 3600)}h ago`)
      } else {
        setTimeAgo(`${Math.floor(diff / 86400)}d ago`)
      }
    }

    updateTimeAgo()
    const interval = setInterval(updateTimeAgo, 10000)

    return () => clearInterval(interval)
  }, [lastUpdated])

  const statusColor = isConnected ? 'text-green-500' : 'text-amber-500'
  const statusText = isConnected ? 'Live' : 'Offline'

  return (
    <div className="flex items-center gap-2 text-sm text-gray-500">
      <Activity className={`h-4 w-4 ${statusColor}`} />
      <span>{statusText}</span>
      {!isLoading && lastUpdated && <span className="text-xs">• {timeAgo}</span>}
      {isLoading && <span className="text-xs">• updating...</span>}
    </div>
  )
}
