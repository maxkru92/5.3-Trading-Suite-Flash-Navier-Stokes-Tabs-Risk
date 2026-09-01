'use client'

import { createContext, useContext } from 'react'

export interface KruppApi {
  injectCrash: (severity: number, durationMs: number) => void
  resetSim: () => void
  flatten: () => void
  flattenOptions: () => void
  setToken: (token: string) => void
  clearToken: () => void
}

export const KruppApiContext = createContext<KruppApi | null>(null)

export function useKruppApi(): KruppApi {
  const api = useContext(KruppApiContext)
  if (!api) throw new Error('KruppApiContext missing — wrap page in provider')
  return api
}
