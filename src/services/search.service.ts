import { api } from '@/services/client'
import type { SearchResults } from '@/types'

export const searchService = {
  /** Pass an AbortSignal so a slow answer for an old term cannot overwrite a newer one. */
  search: async (q: string, signal?: AbortSignal) => {
    const { data } = await api.get<SearchResults>('/api/search', { params: { q }, signal })
    return data
  },
}
