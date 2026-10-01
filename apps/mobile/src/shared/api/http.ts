import type { Api } from './types'

/**
 * Typed fetch wrappers against the Node.js monolith (apps/api).
 * Route contract (one prefix per bounded context):
 *   POST /auth/login · GET/POST /watches · GET /watches/:id · GET /search/:watchId/history
 *   GET /ledger/balance · GET /ledger/history · GET /billing/packs · POST /billing/checkout
 *   GET /notifications · POST /notifications/:id/read
 */
export function createHttpApi(baseUrl: string, getToken: () => string | null): Api {
  async function req<T>(path: string, init?: RequestInit): Promise<T> {
    const token = getToken()
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    })
    if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}`)
    return (res.status === 204 ? undefined : await res.json()) as T
  }
  const post = <T>(path: string, body?: unknown) =>
    req<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

  return {
    auth: { login: (email, password) => post('/auth/login', { email, password }) },
    watch: {
      list: () => req('/watches'),
      get: (id) => req(`/watches/${id}`),
      create: (input) => post('/watches', input),
    },
    search: { history: (watchId) => req(`/search/${watchId}/history`) },
    ledger: { balance: async () => (await req<{ balance: number }>('/ledger/balance')).balance, history: () => req('/ledger/history') },
    billing: { packs: () => req('/billing/packs'), checkout: (packId) => post('/billing/checkout', { packId }) },
    notification: {
      list: () => req('/notifications'),
      markRead: (id) => post(`/notifications/${id}/read`),
    },
  }
}
