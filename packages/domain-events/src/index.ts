/**
 * Shared contract between apps/api (Node.js monolith) and apps/mobile.
 * Server-internal events (e.g. BalanceExhausted, SearchTriggered) are NOT listed here:
 * only events that cross the transport boundary reach the client.
 */
export * from './dto'
export * from './events'
