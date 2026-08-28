import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_REGION, getRegion, type Region } from '../lib/currency'
import { useAuth } from './AuthContext'

const REGION_KEY = 'verta.region'

interface RegionContextValue {
  region: Region
  setRegion: (code: string) => void
}

const RegionContext = createContext<RegionContextValue | null>(null)

export function RegionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [region, setRegionState] = useState<Region>(() => getRegion(localStorage.getItem(REGION_KEY)))

  // Si la cuenta tiene un país guardado, la moneda lo sigue (al iniciar sesión o cambiarlo)
  useEffect(() => {
    if (user?.country) setRegionState(getRegion(user.country))
  }, [user?.country])

  const setRegion = useCallback((code: string) => {
    localStorage.setItem(REGION_KEY, code)
    setRegionState(getRegion(code))
  }, [])

  const value = useMemo(() => ({ region, setRegion }), [region, setRegion])

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>
}

export function useRegion() {
  const ctx = useContext(RegionContext)
  if (!ctx) throw new Error('useRegion debe usarse dentro de RegionProvider')
  return ctx
}

export { DEFAULT_REGION }
