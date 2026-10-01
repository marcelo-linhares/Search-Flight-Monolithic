import type {
  AlertDTO, CheckoutResultDTO, CreateWatchInput, CreditPackDTO, LedgerEntryDTO,
  PricePointDTO, PushPayload, UserDTO, WatchDTO,
} from '@searchfly/domain-events'
import { airportByCode } from '../../format/airports'

/**
 * In-memory stand-in for the Node.js monolith, so the app runs without a backend.
 * It reproduces the server-side event chain and delivers it over a fake "push channel":
 *   BalanceExhausted → WatchSuspendedDueToCredits → (Notification BC) push
 *   CreditsPurchased → BalanceRestored → WatchReactivated → push
 */
type PushListener = (p: PushPayload) => void

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
let seq = 0
const nid = (p: string) => `${p}_${++seq}`
const nowIso = () => new Date().toISOString()

const PACKS: CreditPackDTO[] = [
  { id: 'starter', name: 'Starter', credits: 50, priceCents: 990 },
  { id: 'explorer', name: 'Explorer', credits: 150, priceCents: 2490, recommended: true },
  { id: 'power', name: 'Power', credits: 500, priceCents: 6990 },
]

const state = {
  user: { id: 'u_1', name: 'Marcelo Linhares', email: 'mlinharesdev@gmail.com' } as UserDTO,
  balance: 12,
  watches: [] as WatchDTO[],
  ledger: [] as LedgerEntryDTO[],
  alerts: [] as AlertDTO[],
  listeners: new Set<PushListener>(),
}

function push(payload: PushPayload) {
  if (payload.alert) state.alerts.unshift({ ...payload.alert, read: false })
  state.listeners.forEach((l) => l(payload))
}

function debit(amount: number, reason: string, watchId?: string) {
  state.balance = Math.max(0, state.balance - amount)
  state.ledger.unshift({ id: nid('le'), kind: 'debit', amount, reason, watchId, createdAt: nowIso() })
}

function seeded(seed: string) {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return () => ((h = (h * 1664525 + 1013904223) >>> 0) / 0xffffffff)
}

export const mockServer = {
  onPush(l: PushListener) {
    state.listeners.add(l)
    return () => { state.listeners.delete(l) }
  },

  async login(email: string): Promise<UserDTO> {
    await sleep(500)
    return { ...state.user, email: email || state.user.email }
  },

  async listWatches() { await sleep(250); return state.watches.map((w) => ({ ...w })) },
  async getWatch(id: string) {
    const w = state.watches.find((x) => x.id === id)
    if (!w) throw new Error('watch not found')
    return { ...w }
  },
  async createWatch(input: CreateWatchInput): Promise<WatchDTO> {
    await sleep(600)
    const o = airportByCode(input.origin)
    const d = airportByCode(input.destination)
    const base = d?.basePriceCents || 210000
    const w: WatchDTO = {
      id: nid('w'),
      origin: input.origin.toUpperCase(),
      destination: input.destination.toUpperCase(),
      originCity: o?.city ?? input.origin.toUpperCase(),
      destinationCity: d?.city ?? input.destination.toUpperCase(),
      departDate: input.departDate,
      returnDate: input.returnDate,
      targetPriceCents: input.targetPriceCents,
      currentPriceCents: base,
      status: 'active',
      expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
      createdAt: nowIso(),
    }
    state.watches.unshift(w)
    debit(1, `Search run · ${w.origin}→${w.destination}`, w.id)
    push({
      event: { type: 'AlertReceived', alertId: 'pending', kind: 'watch_created' },
      alert: {
        id: nid('al'), kind: 'watch_created', watchId: w.id, createdAt: nowIso(),
        title: `Watch created: ${w.origin} → ${w.destination}`,
        body: "Tracking started. You'll be notified on significant price drops.",
      },
    })
    return { ...w }
  },

  async history(watchId: string): Promise<PricePointDTO[]> {
    await sleep(200)
    const w = state.watches.find((x) => x.id === watchId)
    const end = w?.currentPriceCents ?? 250000
    const rnd = seeded(watchId)
    const pts: PricePointDTO[] = []
    let p = end * 1.08
    for (let i = 13; i >= 0; i--) {
      p = i === 0 ? end : Math.max(end * 0.9, p * (0.985 + rnd() * 0.02))
      pts.push({ at: new Date(Date.now() - i * 864e5).toISOString(), cents: Math.round(p) })
    }
    return pts
  },

  async balance() { await sleep(150); return state.balance },
  async ledgerHistory() { await sleep(200); return state.ledger.map((e) => ({ ...e })) },
  async packs() { await sleep(200); return PACKS },

  /** Stripe Checkout stub. Confirmation arrives asynchronously via the push channel. */
  async checkout(packId: string): Promise<CheckoutResultDTO> {
    await sleep(900)
    const pack = PACKS.find((p) => p.id === packId)
    if (!pack) throw new Error('unknown pack')
    const result = { invoiceId: nid('inv'), packId, credits: pack.credits, priceCents: pack.priceCents }
    void (async () => {
      await sleep(1400) // webhook: payment.confirmed → CreditsPurchased
      state.balance += pack.credits
      state.ledger.unshift({ id: nid('le'), kind: 'credit', amount: pack.credits, reason: `${pack.name} pack`, createdAt: nowIso() })
      push({ event: { type: 'BalanceRestored', newBalance: state.balance } })
      for (const w of state.watches.filter((x) => x.status === 'suspended_credits')) {
        await sleep(700)
        w.status = 'active'
        push({
          event: { type: 'WatchReactivated', watchId: w.id },
          alert: {
            id: nid('al'), kind: 'watch_reactivated', watchId: w.id, createdAt: nowIso(),
            title: `${w.origin} → ${w.destination} is tracking again`,
            body: 'Credits restored. Next search run in ~2 min.',
          },
        })
      }
    })()
    return result
  },

  async listAlerts() { await sleep(200); return state.alerts.map((a) => ({ ...a })) },
  async markRead(id: string) { const a = state.alerts.find((x) => x.id === id); if (a) a.read = true },
}

/** Demo-only triggers (Profile → Demo controls) to exercise the P0 and price-drop flows. */
export const mockControls = {
  /** S1 — Low credits warning */
  setLowCredits() { state.balance = 2 },
  /** P0: Scheduler → Search → Ledger BalanceExhausted → Watch Mgmt suspends → Notification pushes */
  async exhaustCredits() {
    state.balance = 0
    state.ledger.unshift({ id: nid('le'), kind: 'debit', amount: 1, reason: 'Search run · balance exhausted', createdAt: nowIso() })
    for (const w of state.watches.filter((x) => x.status === 'active')) {
      w.status = 'suspended_credits'
      await sleep(400)
      push({
        event: { type: 'WatchSuspendedDueToCredits', watchId: w.id },
        alert: {
          id: nid('al'), kind: 'watch_suspended', watchId: w.id, createdAt: nowIso(),
          title: `${w.origin} → ${w.destination} watch paused`,
          body: 'Credits exhausted. Top up to resume price tracking.',
        },
      })
    }
  },
  async priceDrop() {
    const w = state.watches.find((x) => x.status === 'active')
    if (!w) return
    const from = w.currentPriceCents
    const to = Math.round(from * 0.92)
    w.currentPriceCents = to
    w.lastDropPct = 8
    push({
      event: { type: 'PriceDropDetected', watchId: w.id, fromCents: from, toCents: to },
      alert: {
        id: nid('al'), kind: 'price_drop', watchId: w.id, createdAt: nowIso(),
        title: `Price dip: ${w.origin} → ${w.destination}`,
        body: 'Fare dropped 8% versus last week’s average.',
      },
    })
  },
}
