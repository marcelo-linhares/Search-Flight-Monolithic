'use strict';

/**
 * Testes da API REST (Express + supertest) sobre o app completo em memória.
 *
 * Foco: contrato HTTP (status, formato do JSON, erros) e que cada rota chama o
 * caso de uso certo. As regras de negócio já estão testadas nos testes de
 * domínio, de use cases e no fluxo entre contextos.
 *
 * Autenticação: ainda não existe o contexto Identity; as rotas de usuário
 * leem o cabeçalho `x-user-id` (substituto temporário de um token).
 */

const request = require('supertest');
const { createApp } = require('../../src/app');
const { createHttpApp } = require('../../src/http/create-http-app');
const { FakeFlightProvider } = require('../../src/integration/fake-flight-provider');

const T0 = new Date('2026-10-10T12:00:00.000Z');

function montar({ giftCredits = 10, enableDevRoutes = true } = {}) {
  const state = { now: T0 };
  const app = createApp({ giftCredits, flightProvider: new FakeFlightProvider({ seed: 5 }), clock: () => state.now });
  const http = request(createHttpApp(app, { enableDevRoutes, logger: { error: () => {} } }));
  const as = (userId) => ({ 'x-user-id': userId });
  return { app, http, as, avancar: (h) => { state.now = new Date(T0.getTime() + h * 3600 * 1000); } };
}

const novoWatch = (over = {}) => ({ origin: 'GRU', destination: 'LIS', departureDate: '2026-12-20', ...over });

async function registrar(http, userId = 'u-1') {
  return http.post('/api/users').send({ userId });
}

describe('infra da API', () => {
  it('GET /health responde ok sem autenticação', async () => {
    const { http } = montar();

    const res = await http.get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('rota inexistente: 404 com corpo de erro padronizado', async () => {
    const { http } = montar();

    const res = await http.get('/api/nada');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'ROUTE_NOT_FOUND', message: 'Route GET /api/nada not found' } });
  });

  it('JSON inválido: 400 INVALID_JSON', async () => {
    const { http } = montar();

    const res = await http.post('/api/users').set('Content-Type', 'application/json').send('{ nope');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('rotas de usuário sem x-user-id: 401 UNAUTHENTICATED', async () => {
    const { http } = montar();

    for (const [method, path] of [['get', '/api/credits'], ['get', '/api/watches'], ['post', '/api/payments'], ['post', '/api/watches']]) {
      const res = await http[method](path);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('erro inesperado: 500 genérico, sem vazar detalhes', async () => {
    const { app, http, as } = montar();
    app.billing.listCreditPacks.execute = async () => { throw new Error('segredo interno'); };

    const res = await http.get('/api/credit-packs').set(as('u-1'));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });
});

describe('POST /api/users (substituto temporário do Identity)', () => {
  it('registra o usuário: 201 e o Ledger abre a conta com o presente', async () => {
    const { http, as } = montar();

    const res = await registrar(http);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ userId: 'u-1' });
    expect((await http.get('/api/credits').set(as('u-1'))).body.available).toBe(10);
  });

  it('userId ausente: 400', async () => {
    const { http } = montar();

    const res = await http.post('/api/users').send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('créditos (Ledger)', () => {
  it('GET /api/credits devolve saldo e status', async () => {
    const { http, as } = montar();
    await registrar(http);

    const res = await http.get('/api/credits').set(as('u-1'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 'u-1', available: 10, status: 'ACTIVE' });
  });

  it('usuário sem ledger: 404 NOT_FOUND', async () => {
    const { http, as } = montar();

    const res = await http.get('/api/credits').set(as('desconhecido'));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('GET /api/credits/history lista lançamentos do mais novo ao mais antigo', async () => {
    const { http, as } = montar();
    await registrar(http);

    const res = await http.get('/api/credits/history').set(as('u-1'));

    expect(res.status).toBe(200);
    expect(res.body.map((e) => e.type)).toEqual(['CREDIT_GIFT']);
  });
});

describe('compras (Billing)', () => {
  it('GET /api/credit-packs lista o catálogo', async () => {
    const { http, as } = montar();

    const res = await http.get('/api/credit-packs').set(as('u-1'));

    expect(res.status).toBe(200);
    expect(res.body.map((p) => p.packId)).toEqual(['STARTER', 'EXPLORER', 'PROFESSIONAL']);
  });

  it('POST /api/payments cria o checkout (201) e GET /api/payments lista os pagamentos', async () => {
    const { http, as } = montar();
    await registrar(http);

    const created = await http.post('/api/payments').set(as('u-1')).send({ packId: 'STARTER' });
    const list = await http.get('/api/payments').set(as('u-1'));

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ packId: 'STARTER', credits: 50, amount: 9.9, currency: 'BRL', status: 'PENDING' });
    expect(list.body).toEqual([expect.objectContaining({ paymentIntentId: created.body.paymentIntentId, status: 'PENDING' })]);
  });

  it('pacote desconhecido: 400 VALIDATION_ERROR', async () => {
    const { http, as } = montar();

    const res = await http.post('/api/payments').set(as('u-1')).send({ packId: 'GOLD' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('webhook "succeeded": 204, credita o saldo e o pagamento fica CONFIRMED', async () => {
    const { http, as } = montar();
    await registrar(http);
    const { body: checkout } = await http.post('/api/payments').set(as('u-1')).send({ packId: 'STARTER' });

    const hook = await http.post('/api/payments/webhook').send({
      paymentIntentId: checkout.paymentIntentId, gatewayTransactionId: 'gw-1', gatewayStatus: 'succeeded',
    });

    expect(hook.status).toBe(204);
    expect((await http.get('/api/credits').set(as('u-1'))).body.available).toBe(60);
    expect((await http.get('/api/payments').set(as('u-1'))).body[0].status).toBe('CONFIRMED');
  });

  it('webhook "failed": 204 e o saldo não muda', async () => {
    const { http, as } = montar();
    await registrar(http);
    const { body: checkout } = await http.post('/api/payments').set(as('u-1')).send({ packId: 'STARTER' });

    const hook = await http.post('/api/payments/webhook').send({
      paymentIntentId: checkout.paymentIntentId, gatewayTransactionId: 'gw-1', gatewayStatus: 'failed',
    });

    expect(hook.status).toBe(204);
    expect((await http.get('/api/credits').set(as('u-1'))).body.available).toBe(10);
    expect((await http.get('/api/payments').set(as('u-1'))).body[0].status).toBe('FAILED');
  });

  it('webhook: pagamento inexistente 404, repetido 409, sem corpo/sem transação 400', async () => {
    const { http, as } = montar();
    await registrar(http);
    const { body: checkout } = await http.post('/api/payments').set(as('u-1')).send({ packId: 'STARTER' });
    const payload = { paymentIntentId: checkout.paymentIntentId, gatewayTransactionId: 'gw-1', gatewayStatus: 'succeeded' };

    expect((await http.post('/api/payments/webhook').send({ ...payload, paymentIntentId: 'x' })).status).toBe(404);
    expect((await http.post('/api/payments/webhook').send({ ...payload, gatewayTransactionId: undefined })).status).toBe(400);
    expect((await http.post('/api/payments/webhook')).status).toBe(404); // sem corpo: paymentIntentId ausente
    expect((await http.post('/api/payments/webhook').send(payload)).status).toBe(204);
    const repetido = await http.post('/api/payments/webhook').send(payload);
    expect(repetido.status).toBe(409);
    expect(repetido.body.error.code).toBe('CONFLICT');
  });
});

describe('watches (Watch Management)', () => {
  it('POST /api/watches cria o watch (201) com status active', async () => {
    const { http, as } = montar();
    await registrar(http);

    const res = await http.post('/api/watches').set(as('u-1')).send(novoWatch({ intervalHours: 6 }));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      userId: 'u-1', origin: 'GRU', destination: 'LIS', departureDate: '2026-12-20', intervalHours: 6, status: 'active',
    });
    expect(res.body.watchRequestId).toEqual(expect.any(String));
  });

  it('dados inválidos: 400 com a mensagem do domínio', async () => {
    const { http, as } = montar();

    const res = await http.post('/api/watches').set(as('u-1')).send(novoWatch({ origin: 'XX' }));

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: expect.stringContaining('origin') });
  });

  it('GET /api/watches lista só os do usuário e GET /api/watches/:id devolve um', async () => {
    const { http, as } = montar();
    await http.post('/api/watches').set(as('u-1')).send(novoWatch());
    await http.post('/api/watches').set(as('u-2')).send(novoWatch({ destination: 'MAD' }));

    const list = await http.get('/api/watches').set(as('u-1'));
    const one = await http.get(`/api/watches/${list.body[0].watchRequestId}`).set(as('u-1'));

    expect(list.body).toHaveLength(1);
    expect(one.status).toBe(200);
    expect(one.body.destination).toBe('LIS');
  });

  it('watch de outro usuário ou inexistente: 404 (não revela que existe)', async () => {
    const { http, as } = montar();
    const { body } = await http.post('/api/watches').set(as('u-1')).send(novoWatch());

    expect((await http.get(`/api/watches/${body.watchRequestId}`).set(as('u-2'))).status).toBe(404);
    expect((await http.get('/api/watches/nao-existe').set(as('u-1'))).status).toBe(404);
    expect((await http.delete(`/api/watches/${body.watchRequestId}`).set(as('u-2'))).status).toBe(404);
    expect((await http.get(`/api/watches/${body.watchRequestId}/price-history`).set(as('u-2'))).status).toBe(404);
  });

  it('DELETE /api/watches/:id cancela (200) e cancelar de novo dá 409', async () => {
    const { http, as } = montar();
    const { body } = await http.post('/api/watches').set(as('u-1')).send(novoWatch());

    const first = await http.delete(`/api/watches/${body.watchRequestId}`).set(as('u-1'));
    const second = await http.delete(`/api/watches/${body.watchRequestId}`).set(as('u-1'));

    expect(first.status).toBe(200);
    expect(first.body.status).toBe('cancelled');
    expect(second.status).toBe(409);
  });
});

describe('fluxo completo pela API (com o scheduler disparado manualmente)', () => {
  it('registrar -> criar watch -> tick -> saldo cai e o histórico de preços aparece', async () => {
    const { http, as, avancar } = montar();
    await registrar(http);
    const { body: watch } = await http.post('/api/watches').set(as('u-1')).send(novoWatch());

    const tick1 = await http.post('/api/dev/scheduler/tick').send();
    avancar(4);
    const tick2 = await http.post('/api/dev/scheduler/tick').send();
    const history = await http.get(`/api/watches/${watch.watchRequestId}/price-history`).set(as('u-1'));
    const credits = await http.get('/api/credits').set(as('u-1'));

    expect(tick1.body).toEqual({ triggered: 1, ended: 0 });
    expect(tick2.body).toEqual({ triggered: 1, ended: 0 });
    expect(credits.body.available).toBe(8);
    expect(history.status).toBe(200);
    expect(history.body.snapshots).toHaveLength(2);
    expect(history.body.lowest).toEqual(expect.objectContaining({ currency: 'BRL', amount: expect.any(Number) }));
  });

  it('créditos acabam pela API: watch vira suspended_credits e volta a active após a compra', async () => {
    const { http, as, avancar } = montar({ giftCredits: 1 });
    await registrar(http);
    const { body: watch } = await http.post('/api/watches').set(as('u-1')).send(novoWatch());
    await http.post('/api/dev/scheduler/tick').send();

    expect((await http.get(`/api/watches/${watch.watchRequestId}`).set(as('u-1'))).body.status).toBe('suspended_credits');
    expect((await http.get('/api/credits').set(as('u-1'))).body).toMatchObject({ available: 0, status: 'SUSPENDED' });

    const { body: checkout } = await http.post('/api/payments').set(as('u-1')).send({ packId: 'STARTER' });
    await http.post('/api/payments/webhook').send({
      paymentIntentId: checkout.paymentIntentId, gatewayTransactionId: 'gw-1', gatewayStatus: 'succeeded',
    });
    avancar(1);

    expect((await http.get(`/api/watches/${watch.watchRequestId}`).set(as('u-1'))).body.status).toBe('active');
    expect((await http.post('/api/dev/scheduler/tick').send()).body.triggered).toBe(1);
  });

  it('rotas de desenvolvimento ficam desligadas por padrão (404)', async () => {
    const { http } = montar({ enableDevRoutes: false });

    expect((await http.post('/api/dev/scheduler/tick').send()).status).toBe(404);
  });
});
