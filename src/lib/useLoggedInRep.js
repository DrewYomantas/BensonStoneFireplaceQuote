import { useState, useEffect } from 'react'
import { getSalesOsStorage, ensureSalesOsBoot } from './salesOsStorageBoot.js'
import { getRep } from './repStorage.js'

const META_KEY = 'loggedInRepId'

export default function useLoggedInRep() {
  const [rep, setRep] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ensureSalesOsBoot()
      .then(async () => {
        if (cancelled) return
        try {
          const storage = getSalesOsStorage()
          const metaResult = await storage.getMeta(META_KEY)
          if (metaResult.ok && metaResult.data) {
            const found = await getRep(storage, metaResult.data)
            if (!cancelled && found && found.active) setRep(found)
          }
        } catch { /* storage unavailable — stay at null rep, show login */ }
        if (!cancelled) setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function login(newRep) {
    const storage = getSalesOsStorage()
    await storage.setMeta(META_KEY, newRep.id)
    setRep(newRep)
  }

  async function logout() {
    const storage = getSalesOsStorage()
    await storage.setMeta(META_KEY, null)
    setRep(null)
  }

  return { rep, loading, login, logout }
}
