import { useCallback, useEffect, useState } from 'react'
import { fetchCatalog } from '../services/api'
import type { PokemonSummary } from '../types/pokemon'

export interface CatalogApi {
  catalog: PokemonSummary[]
  loading: boolean
  error: string | null
  retry: () => void
}

/**
 * Fetch do único endpoint REST (/api/pokemon) com loading/error/retry.
 * Sem TanStack Query: um endpoint estático com cache no servidor não justifica
 * a dependência (decisão documentada no README do client).
 */
export function useCatalog(): CatalogApi {
  const [catalog, setCatalog] = useState<PokemonSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    fetchCatalog()
      .then((data) => {
        if (alive) {
          setCatalog(data)
          setError(null)
        }
      })
      .catch(() => {
        if (alive) setError('Não foi possível carregar o catálogo local.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [attempt])

  const retry = useCallback(() => {
    setLoading(true)
    setAttempt((value) => value + 1)
  }, [])

  return { catalog, loading, error, retry }
}
