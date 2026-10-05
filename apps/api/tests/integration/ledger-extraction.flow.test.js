'use strict';

/**
 * EXPERIMENTO (docs/EXPERIMENT_REFACTORING.md): o Ledger extraído para um serviço
 * próprio. Dois "processos" (duas composition roots, dois event buses, dois
 * repositórios) conversando SÓ por HTTP real em portas efêmeras:
 *
 *   monólito  (Billing, Watch, Scheduler, Search)  <== eventos + consultas HTTP ==>  serviço Ledger
 *
 * O código do contexto Ledger é exatamente o mesmo de antes. Parte dos testes
 * repete o fluxo P0 e prova que o comportamento se mantém; a outra parte
 * documenta o que MUDA quando a fronteira vira rede (consistência eventual,
 * entrega at-least-once, indisponibilidade). Esses são os "vazamentos".
 */

const request = require('supertest');
const { createApp } = require('../../src/app');
const { createHttpApp } = require('../../src/http/create-http-app');
const { startLedgerService } = require('../../src/services/ledger-service');
const { FakeFlightProvider } = require('../../src/integration/fake-flight-provider');

const TOKEN = 'internal-secret';
const USER = 'u-1';
const T0 = new Date('2026-10-10T12:00:00.000Z');
const horas = (n) => new Date(T0.getTime() + n * 3600 * 1000);
const quiet = { log() {}, warn() {}, error() {} };
const noSleep = async () => {};

// Rede controlável entre os dois serviços: pode segurar entregas ou derrubá-las.
function controlledFetch() {
  const control = { gate: null, failNext: 0, calls: 0 };
  const fetchImpl = async (url, init) => {
    control.calls += 1;
    const isEvent = init?.method === 'POST'; // the gate holds events, not reads
    if (isEvent && control.gate) await control.gate;
    if (control.failNext > 0) { control.failNext -= 1; throw new Error('ECONNREFUSED'); }
    return fetch(url, init);
  };
  return { control, fetchImpl };
}

async function montar({ giftCredits = 10, retry = { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 } } = {}) {
  const state = { now: T0 };
  const toLedger = controlledFetch();
  const toMonolith = controlledFetch();

  const ledgerService = await startLedgerService({
    port: 0, giftCredits, token: TOKEN, fetchImpl: toMonolith.fetchImpl, retry, sleep: noSleep, logger: quiet,
  });

  const app = createApp({
    ledgerUrl: ledgerService.url, internalToken: TOKEN, fetchImpl: toLedger.fetchImpl,
    bridgeRetry: retry, bridgeSleep: noSleep,
    flightProvider: new FakeFlightProvider({ seed: 3 }), clock: () => state.now,
  });
  const monolith = createHttpApp(app, { enableDevRoutes: true, logger: quiet });
  const http = request(monolith);

  // O serviço Ledger precisa saber onde está o monólito para responder eventos.
  const monolithServer = await new Promise((resolve) => { const s = monolith.listen(0, () => resolve(s)); });
  ledgerService.bridge.peerUrl = `http://127.0.0.1:${monolithServer.address().port}`;

  const settle = async () => {
    for (let i = 0; i < 6; i += 1) {
      await app.bridge.idle();
      await ledgerService.bridge.idle();
    }
  };
  const stop = async () => {
    await ledgerService.stop();
    await new Promise((resolve) => monolithServer.close(resolve));
  };
  return {
    app, http, ledgerService, settle, stop, toLedger, toMonolith,
    as: { 'x-user-id': USER },
    avancarPara: (h) => { state.now = horas(h); },
  };
}

const criarWatch = (ctx, over = {}) => ctx.http.post('/api/watches').set(ctx.as)
  .send({ origin: 'GRU', destination: 'LIS', departureDate: '2026-12-20', ...over });
const saldo = async (ctx) => (await ctx.http.get('/api/credits').set(ctx.as)).body.available;
const statusDoWatch = async (ctx, id) => (await ctx.http.get(`/api/watches/${id}`).set(ctx.as)).body.status;
const tick = (ctx) => ctx.http.post('/api/dev/scheduler/tick').set(ctx.as);

describe('Ledger como serviço próprio: o fluxo P0 continua funcionando', () => {
  let ctx;
  afterEach(async () => { await ctx.stop(); });

  it('registrar o usuário no monólito cria a conta com créditos no serviço Ledger', async () => {
    ctx = await montar();

    await ctx.http.post('/api/users').send({ userId: USER });
    await ctx.settle();

    expect(await saldo(ctx)).toBe(10);
    expect(await ctx.ledgerService.ledger.getCreditBalance.execute({ userId: USER })).toMatchObject({ available: 10 });
  });

  it('créditos acabam: o Ledger (remoto) esgota, o monólito suspende os watches; compra reativa', async () => {
    ctx = await montar({ giftCredits: 2 });
    await ctx.http.post('/api/users').send({ userId: USER });
    await ctx.settle();
    const w1 = (await criarWatch(ctx)).body.watchRequestId;
    const w2 = (await criarWatch(ctx, { destination: 'MAD' })).body.watchRequestId;

    await tick(ctx);
    await ctx.settle();

    expect(await saldo(ctx)).toBe(0);
    expect(await statusDoWatch(ctx, w1)).toBe('suspended_credits');
    expect(await statusDoWatch(ctx, w2)).toBe('suspended_credits');

    const checkout = (await ctx.http.post('/api/payments').set(ctx.as).send({ packId: 'STARTER' })).body;
    await ctx.http.post('/api/payments/webhook').send({
      paymentIntentId: checkout.paymentIntentId, gatewayTransactionId: 'gw-1', gatewayStatus: 'succeeded',
    });
    await ctx.settle();

    expect(await saldo(ctx)).toBe(50);
    expect(await statusDoWatch(ctx, w1)).toBe('active');
    expect(await statusDoWatch(ctx, w2)).toBe('active');
    await tick(ctx);
    await ctx.settle();
    expect(await saldo(ctx)).toBe(48);
  });

  it('o histórico do Ledger também é lido do serviço remoto', async () => {
    ctx = await montar();
    await ctx.http.post('/api/users').send({ userId: USER });
    await ctx.settle();

    const res = await ctx.http.get('/api/credits/history').set(ctx.as);

    expect(res.status).toBe(200);
    expect(res.body.map((e) => e.type)).toEqual(['CREDIT_GIFT']);
  });

  it('o serviço só recebe os eventos que lhe interessam e só devolve os que outros contextos usam', async () => {
    ctx = await montar({ giftCredits: 1 });
    const seenByLedger = [];
    const original = ctx.ledgerService.eventBus.publish.bind(ctx.ledgerService.eventBus);
    ctx.ledgerService.eventBus.publish = async (e) => { seenByLedger.push(e.type); return original(e); };
    await ctx.http.post('/api/users').send({ userId: USER });
    await ctx.settle();
    await criarWatch(ctx);

    await tick(ctx);
    await ctx.settle();

    // Nada de WatchCreated, SearchJobTriggered etc. atravessou a fronteira.
    expect(seenByLedger.filter((t) => !t.startsWith('Search') || t === 'SearchCreditDebited')).not.toContain('WatchCreated');
    expect(seenByLedger).toEqual(expect.arrayContaining(['UserRegistered', 'PriceSnapshotCaptured']));
    expect(seenByLedger).not.toEqual(expect.arrayContaining(['WatchCreated', 'SearchJobTriggered']));
  });

  it('a fronteira exige o token interno: sem ele, 401 nos dois sentidos', async () => {
    ctx = await montar();

    const toLedger = await fetch(`${ctx.ledgerService.url}/internal/events`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'UserRegistered', userId: 'x' }),
    });
    const readLedger = await fetch(`${ctx.ledgerService.url}/internal/ledgers/x/balance`);

    expect(toLedger.status).toBe(401);
    expect(readLedger.status).toBe(401);
  });
});

describe('Ledger como serviço próprio: o que MUDA quando a fronteira vira rede (vazamentos)', () => {
  let ctx;
  afterEach(async () => { await ctx.stop(); });

  // VAZAMENTO 1: consistência eventual. Antes, depois de publish() o Ledger já tinha reagido.
  it('leitura logo após o registro: o saldo ainda não existe (404) até o evento chegar', async () => {
    ctx = await montar();
    let release;
    ctx.toLedger.control.gate = new Promise((resolve) => { release = resolve; });

    await ctx.http.post('/api/users').send({ userId: USER });
    const antes = await ctx.http.get('/api/credits').set(ctx.as);
    release();
    await ctx.settle();
    const depois = await ctx.http.get('/api/credits').set(ctx.as);

    expect(antes.status).toBe(404);
    expect(depois.status).toBe(200);
    expect(depois.body.available).toBe(10);
  });

  // VAZAMENTO 2: o caso de uso de estorno devolvia o status FINAL porque o bus em
  // processo esperava os handlers. Agora devolve REFUND_REQUESTED e o final chega depois.
  it('estorno: o caso de uso devolve REFUND_REQUESTED e o status final chega de forma assíncrona', async () => {
    ctx = await montar();
    await ctx.http.post('/api/users').send({ userId: USER });
    await ctx.settle();
    const checkout = (await ctx.http.post('/api/payments').set(ctx.as).send({ packId: 'STARTER' })).body;
    await ctx.http.post('/api/payments/webhook').send({
      paymentIntentId: checkout.paymentIntentId, gatewayTransactionId: 'gw-1', gatewayStatus: 'succeeded',
    });
    await ctx.settle();
    let release;
    ctx.toLedger.control.gate = new Promise((resolve) => { release = resolve; });

    const result = await ctx.app.billing.refundPayment.execute({ paymentIntentId: checkout.paymentIntentId });
    release();
    await ctx.settle();
    const final = (await ctx.http.get('/api/payments').set(ctx.as)).body[0].status;

    expect(result.status).toBe('REFUND_REQUESTED'); // no monólito puro era 'REFUNDED'
    expect(final).toBe('REFUNDED');
    expect(await saldo(ctx)).toBe(10);
  });

  it('estorno maior que o saldo: o Ledger remoto recusa e o pagamento volta a CONFIRMED', async () => {
    ctx = await montar({ giftCredits: 1 });
    await ctx.http.post('/api/users').send({ userId: USER });
    await ctx.settle();
    const checkout = (await ctx.http.post('/api/payments').set(ctx.as).send({ packId: 'STARTER' })).body;
    await ctx.http.post('/api/payments/webhook').send({
      paymentIntentId: checkout.paymentIntentId, gatewayTransactionId: 'gw-1', gatewayStatus: 'succeeded',
    });
    await ctx.settle();
    await criarWatch(ctx);
    await tick(ctx); // gasta 1 crédito: saldo 50 < ... (1 + 50 - 1 = 50) ainda cobre; força saldo menor abaixo
    await ctx.settle();
    for (let h = 4; h <= 4 * 49; h += 4) { ctx.avancarPara(h); await tick(ctx); await ctx.settle(); }
    expect(await saldo(ctx)).toBeLessThan(50);

    await ctx.app.billing.refundPayment.execute({ paymentIntentId: checkout.paymentIntentId });
    await ctx.settle();

    expect((await ctx.http.get('/api/payments').set(ctx.as)).body[0].status).toBe('CONFIRMED');
  });

  // VAZAMENTO 3: entrega at-least-once. Duplicatas não podem cobrar duas vezes.
  it('o mesmo PriceSnapshotCaptured entregue duas vezes debita uma vez só', async () => {
    ctx = await montar();
    await ctx.http.post('/api/users').send({ userId: USER });
    await ctx.settle();
    const event = { type: 'PriceSnapshotCaptured', eventId: 'dup-1', userId: USER, watchRequestId: 'w-1', snapshotId: 's-1' };
    const send = () => fetch(`${ctx.ledgerService.url}/internal/events`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-token': TOKEN }, body: JSON.stringify(event),
    });

    expect((await send()).status).toBe(202);
    expect((await send()).status).toBe(202);

    expect(await saldo(ctx)).toBe(9);
    expect(ctx.ledgerService.bridge.stats.duplicatesIgnored).toBe(1);
  });

  // VAZAMENTO 4: indisponibilidade. A busca continua rodando sem o Ledger (janela de "overdraft").
  it('Ledger fora do ar por pouco tempo: as buscas continuam e a cobrança chega depois (retry)', async () => {
    ctx = await montar();
    await ctx.http.post('/api/users').send({ userId: USER });
    await ctx.settle();
    await criarWatch(ctx);
    ctx.toLedger.control.failNext = 2; // as duas primeiras tentativas falham

    await tick(ctx);
    await ctx.settle();

    expect(ctx.app.flightProvider.calls.length).toBeGreaterThan(0);
    expect(await saldo(ctx)).toBe(9); // entregue na 3ª tentativa
    expect(ctx.app.bridge.stats.deadLetters).toEqual([]);
  });

  it('Ledger fora do ar por muito tempo: o evento vai para a dead-letter e a busca fica SEM cobrança', async () => {
    ctx = await montar();
    await ctx.http.post('/api/users').send({ userId: USER });
    await ctx.settle();
    await criarWatch(ctx);
    ctx.toLedger.control.failNext = 3; // esgota as 3 tentativas

    await tick(ctx);
    await ctx.settle();

    expect(ctx.app.flightProvider.calls.length).toBeGreaterThan(0); // a busca aconteceu
    expect(await saldo(ctx)).toBe(10);                               // e ninguém cobrou
    expect(ctx.app.bridge.stats.deadLetters.map((d) => d.event.type)).toEqual(['PriceSnapshotCaptured']);
  });

  it('consulta de saldo com o Ledger fora do ar: 503 (antes isso não podia falhar)', async () => {
    ctx = await montar();
    await ctx.http.post('/api/users').send({ userId: USER });
    await ctx.settle();
    ctx.toLedger.control.failNext = 1;

    const res = await ctx.http.get('/api/credits').set(ctx.as);

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
