// src/hooks/useLoadingState.ts
import { create } from 'zustand'

interface LoadingState {
  isLoading: boolean
  loadingMessage: string
  loadingProgress: number
  error: string | null
  setLoading: (loading: boolean, message?: string) => void
  setProgress: (progress: number) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useLoadingState = create<LoadingState>((set) => ({
  isLoading: true, // Start with loading true for initial page load
  loadingMessage: 'Memuat peta...',
  loadingProgress: 0,
  error: null,

  setLoading: (loading, message = '') => 
    set({ 
      isLoading: loading, 
      loadingMessage: message || (loading ? 'Memuat...' : 'Selesai'),
      error: loading ? null : undefined // Clear error when loading starts
    }),

  setProgress: (progress) => 
    set({ loadingProgress: Math.max(0, Math.min(100, progress)) }),

  setError: (error) => 
    set({ 
      error, 
      isLoading: false, 
      loadingProgress: 0 
    }),

  reset: () => 
    set({ 
      isLoading: false, 
      loadingMessage: '', 
      loadingProgress: 0, 
      error: null 
    })
}))

// Hook for components that need loading state
export const useAppLoading = () => {
  const loadingState = useLoadingState()
  
  const startLoading = (message = 'Memuat...') => {
    loadingState.setLoading(true, message)
    loadingState.setProgress(0)
  }

  const updateProgress = (progress: number, message?: string) => {
    loadingState.setProgress(progress)
    if (message) {
      loadingState.setLoading(true, message)
    }
  }

  const finishLoading = () => {
    loadingState.setLoading(false)
    loadingState.setProgress(100)
  }

  const showError = (error: string) => {
    loadingState.setError(error)
  }

  return {
    ...loadingState,
    startLoading,
    updateProgress,
    finishLoading,
    showError
  }
}