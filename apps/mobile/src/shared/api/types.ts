import type {
  AlertDTO, CheckoutResultDTO, CreateWatchInput, CreditPackDTO,
  LedgerEntryDTO, PricePointDTO, UserDTO, WatchDTO,
} from '@searchfly/domain-events'

/** One interface per bounded context — mirrors apps/api/src/modules/*. */
export interface AuthApi { login(email: string, password: string): Promise<UserDTO> }
export interface WatchApi {
  list(): Promise<WatchDTO[]>
  get(id: string): Promise<WatchDTO>
  create(input: CreateWatchInput): Promise<WatchDTO>
}
export interface SearchApi { history(watchId: string): Promise<PricePointDTO[]> }
export interface LedgerApi { balance(): Promise<number>; history(): Promise<LedgerEntryDTO[]> }
export interface BillingApi { packs(): Promise<CreditPackDTO[]>; checkout(packId: string): Promise<CheckoutResultDTO> }
export interface NotificationApi { list(): Promise<AlertDTO[]>; markRead(id: string): Promise<void> }

export interface Api {
  auth: AuthApi
  watch: WatchApi
  search: SearchApi
  ledger: LedgerApi
  billing: BillingApi
  notification: NotificationApi
}
