'use strict';

/**
 * Integração do fluxo P0 inteiro, com os contextos REAIS conectados pelo event
 * bus (em memória): Watch Management, Scheduler, Search, Ledger e Billing.
 * Só o provedor de voos é falso (FakeFlightProvider) e o relógio é controlado.
 *
 * Prova que os contextos conversam apenas por eventos:
 *   WatchCreated -> Scheduler -> SearchJobTriggered -> Search -> PriceSnapshotCaptured
 *   -> Ledger (debita) -> BalanceExhausted -> Watch (suspende) -> Scheduler (pausa)
 *   CreditsPurchased -> Ledger -> BalanceRestored -> Watch (reativa) -> Scheduler (retoma)
 */

const { createApp } = require('../../src/app');
const { FakeFlightProvider } = require('../../src/integration/fake-flight-provider');

const USER = 'u-1';
const T0 = new Date('2026-10-10T12:00:00.000Z');
const horas = (n) => new Date(T0.getTime() + n * 3600 * 1000);

function montar({ giftCredits = 10, flightProvider = new FakeFlightProvider({ seed: 3 }) } = {}) {
  const state = { now: T0 };
  const app = createApp({ giftCredits, flightProvider, clock: () => state.now });
  const seen = [];
  const original = app.eventBus.publish.bind(app.eventBus);
  app.eventBus.publish = async (event) => { seen.push(event.type); return original(event); };
  return { app, seen, flightProvider, avancarPara: (h) => { state.now = horas(h); } };
}

const registrar = (app, userId = USER) => app.eventBus.publish({ type: 'UserRegistered', userId });
const criarWatch = (app, over = {}) => app.watch.createWatch.execute({
  userId: USER, origin: 'GRU', destination: 'LIS', departureDate: '2026-12-20', ...over,
});
const saldo = async (app, userId = USER) => (await app.ledger.getCreditBalance.execute({ userId })).available;
const statusDe = async (app, id) => (await app.watch.watchRepo.findById(id)).status;
const contar = (seen, type) => seen.filter((t) => t === type).length;

describe('Search orchestrator: fluxo P0 entre contextos', () => {
  it('um tick busca o preço de um watch ativo e o Ledger debita 1 crédito', async () => {
    const { app, seen } = montar();
    await registrar(app);
    await criarWatch(app);

    const result = await app.scheduler.runDueSearches.execute();

    expect(result).toEqual({ triggered: 1, ended: 0 });
    expect(await saldo(app)).toBe(9);
    expect(seen).toEqual([
      'UserRegistered', 'GiftCreditsGranted', 'WatchCreated',
      'SearchJobTriggered', 'PriceSnapshotCaptured', 'SearchCreditDebited',
    ]);
  });

  it('respeita o intervalo: só busca de novo depois de 4h', async () => {
    const { app, avancarPara } = montar();
    await registrar(app);
    await criarWatch(app);
    await app.scheduler.runDueSearches.execute();

    avancarPara(3);
    expect((await app.scheduler.runDueSearches.execute()).triggered).toBe(0);
    avancarPara(4);
    expect((await app.scheduler.runDueSearches.execute()).triggered).toBe(1);
    expect(await saldo(app)).toBe(8);
  });

  it('créditos acabam: watches são suspensos, schedules pausados e nenhuma busca roda; compra reativa tudo', async () => {
    const { app, seen, avancarPara } = montar({ giftCredits: 2 });
    await registrar(app);
    const w1 = (await criarWatch(app)).watchRequestId;
    const w2 = (await criarWatch(app, { destination: 'MAD' })).watchRequestId;

    await app.scheduler.runDueSearches.execute(); // 2 buscas = 2 créditos

    expect(await saldo(app)).toBe(0);
    expect(await statusDe(app, w1)).toBe('suspended_credits');
    expect(await statusDe(app, w2)).toBe('suspended_credits');
    expect(contar(seen, 'BalanceExhausted')).toBe(1);
    expect(contar(seen, 'WatchSuspendedDueToCredits')).toBe(2);

    avancarPara(8);
    expect(await app.scheduler.runDueSearches.execute()).toEqual({ triggered: 0, ended: 0 });

    const { paymentIntentId } = await app.billing.initiatePayment.execute({ userId: USER, packId: 'STARTER' });
    await app.billing.confirmPayment.execute({ paymentIntentId, gatewayTransactionId: 'gw-1', gatewayStatus: 'succeeded' });

    expect(await saldo(app)).toBe(50);
    expect(await statusDe(app, w1)).toBe('active');
    expect(await statusDe(app, w2)).toBe('active');
    expect(contar(seen, 'WatchReactivated')).toBe(2);

    expect((await app.scheduler.runDueSearches.execute()).triggered).toBe(2); // retoma já no próximo tick
    expect(await saldo(app)).toBe(48);
  });

  it('usuário sem créditos cria watch já suspenso e nenhuma busca roda', async () => {
    const { app, flightProvider } = montar({ giftCredits: 1 });
    await registrar(app);
    const w1 = (await criarWatch(app)).watchRequestId;
    await app.scheduler.runDueSearches.execute(); // gasta o único crédito
    expect(await saldo(app)).toBe(0);

    const w2 = await criarWatch(app, { destination: 'MAD' });

    expect(w2.status).toBe('suspended_credits');
    expect(await statusDe(app, w1)).toBe('suspended_credits');
    const antes = flightProvider.calls.length;
    expect((await app.scheduler.runDueSearches.execute()).triggered).toBe(0);
    expect(flightProvider.calls).toHaveLength(antes);
  });

  it('falha do provedor não cobra crédito (SearchJobFailed, sem PriceSnapshotCaptured)', async () => {
    const { app, seen, flightProvider } = montar();
    await registrar(app);
    await criarWatch(app);
    flightProvider.failNext(1, 'provider down');

    await app.scheduler.runDueSearches.execute();

    expect(await saldo(app)).toBe(10);
    expect(seen).toContain('SearchJobFailed');
    expect(seen).not.toContain('PriceSnapshotCaptured');
  });

  it('cancelar o watch interrompe as buscas', async () => {
    const { app, seen, avancarPara } = montar();
    await registrar(app);
    const { watchRequestId } = await criarWatch(app);
    await app.watch.cancelWatch.execute({ userId: USER, watchRequestId });

    avancarPara(5);
    const result = await app.scheduler.runDueSearches.execute();

    expect(result).toEqual({ triggered: 0, ended: 0 });
    expect(contar(seen, 'SearchJobTriggered')).toBe(0);
    expect(await saldo(app)).toBe(10);
  });

  it('fim da janela: Scheduler publica SearchWindowEnded e o Watch expira', async () => {
    const { app, seen, avancarPara } = montar();
    await registrar(app);
    const { watchRequestId } = await criarWatch(app, { durationDays: 2 });
    await app.scheduler.runDueSearches.execute();

    avancarPara(49); // além dos 2 dias
    const result = await app.scheduler.runDueSearches.execute();

    expect(result).toEqual({ triggered: 0, ended: 1 });
    expect(await statusDe(app, watchRequestId)).toBe('expired');
    expect(seen.slice(-2)).toEqual(['SearchWindowEnded', 'WatchExpired']);
    avancarPara(60);
    expect(await app.scheduler.runDueSearches.execute()).toEqual({ triggered: 0, ended: 0 });
  });

  it('histórico de preços acumula um snapshot por busca bem-sucedida', async () => {
    const { app, avancarPara } = montar();
    await registrar(app);
    const { watchRequestId } = await criarWatch(app);
    for (const h of [0, 4, 8]) {
      avancarPara(h);
      await app.scheduler.runDueSearches.execute();
    }

    const history = await app.search.getPriceHistory.execute({ userId: USER, watchRequestId });

    expect(history.snapshots).toHaveLength(3);
    expect(history.snapshots.map((s) => s.capturedAt)).toEqual([horas(0), horas(4), horas(8)].map((d) => d.toISOString()));
    expect(history.lowest.amount).toBe(Math.min(...history.snapshots.map((x) => x.amount)));
  });

  it('SearchJobTriggered reentregue não cobra duas vezes (idempotência por jobId)', async () => {
    const { app, seen } = montar();
    await registrar(app);
    await criarWatch(app);
    await app.scheduler.runDueSearches.execute();
    const job = (await app.search.jobRepo.findCompletedByWatch({ userId: USER, watchRequestId: (await app.watch.listUserWatches.execute({ userId: USER }))[0].watchRequestId }))[0];

    await app.eventBus.publish({
      type: 'SearchJobTriggered', jobId: job.jobId, watchRequestId: job.watchRequestId, userId: USER,
      origin: 'GRU', destination: 'LIS', departureDate: '2026-12-20', returnDate: null,
    });

    expect(await saldo(app)).toBe(9);
    expect(contar(seen, 'PriceSnapshotCaptured')).toBe(1);
  });

  it('usuários são independentes entre si', async () => {
    const { app } = montar({ giftCredits: 1 });
    await registrar(app, 'u-1');
    await registrar(app, 'u-2');
    await criarWatch(app, { userId: 'u-1' });
    await criarWatch(app, { userId: 'u-2', destination: 'MAD' });

    await app.scheduler.runDueSearches.execute();

    expect(await saldo(app, 'u-1')).toBe(0);
    expect(await saldo(app, 'u-2')).toBe(0);
    const w1 = (await app.watch.listUserWatches.execute({ userId: 'u-1' }))[0];
    const w2 = (await app.watch.listUserWatches.execute({ userId: 'u-2' }))[0];
    expect([w1.status, w2.status]).toEqual(['suspended_credits', 'suspended_credits']);
  });
});
