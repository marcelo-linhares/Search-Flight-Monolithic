import { create } from 'zustand'
import type { UserDTO } from '@searchfly/domain-events'
import { api, setAuthToken } from '../api'
import { requestPushPermission } from '../push'

interface AuthState {
  user: UserDTO | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  async login(email, password) {
    const user = await api.auth.login(email, password)
    setAuthToken(user.id) // real backend: replace with the session token from the login response
    set({ user })
    void requestPushPermission()
  },
  logout() { setAuthToken(null); set({ user: null }) },
}))
