import { createHttpApi } from './http'
import { createMockApi } from './mock/api'
import type { Api } from './types'

export type { Api } from './types'

let token: string | null = null
export const setAuthToken = (t: string | null) => { token = t }

const baseUrl = process.env.EXPO_PUBLIC_API_URL
export const USE_MOCK = !baseUrl

/** Single entry point for REST calls. Falls back to the in-memory mock server when no API URL is set. */
export const api: Api = baseUrl ? createHttpApi(baseUrl, () => token) : createMockApi()
