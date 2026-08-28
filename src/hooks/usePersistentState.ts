import { useEffect, useState } from 'react'

export function usePersistentState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // almacenamiento no disponible: la demo sigue funcionando en memoria
    }
  }, [key, state])

  return [state, setState] as const
}