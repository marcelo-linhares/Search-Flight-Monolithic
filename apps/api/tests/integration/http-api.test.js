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

  it('webhook: pagamento inexistente 404, sem corpo/sem transação 400, status desconhecido 400', async () => {
    const { http, as } = montar();
    await registrar(http);
    const { body: checkout } = await http.post('/api/payments').set(as('u-1')).send({ packId: 'STARTER' });
    const payload = { paymentIntentId: checkout.paymentIntentId, gatewayTransactionId: 'gw-1', gatewayStatus: 'succeeded' };

    expect((await http.post('/api/payments/webhook').send({ ...payload, paymentIntentId: 'x' })).status).toBe(404);
    expect((await http.post('/api/payments/webhook').send({ ...payload, gatewayTransactionId: undefined })).status).toBe(400);
    expect((await http.post('/api/payments/webhook').send({ ...payload, gatewayStatus: 'paid' })).status).toBe(400);
    expect((await http.post('/api/payments/webhook')).status).toBe(404); // sem corpo: paymentIntentId ausente
  });

  it('webhook repetido é idempotente: 204 de novo e o crédito entra uma vez só', async () => {
    const { http, as } = montar();
    await registrar(http);
    const { body: checkout } = await http.post('/api/payments').set(as('u-1')).send({ packId: 'STARTER' });
    const payload = { paymentIntentId: checkout.paymentIntentId, gatewayTransactionId: 'gw-1', gatewayStatus: 'succeeded' };

    expect((await http.post('/api/payments/webhook').send(payload)).status).toBe(204);
    expect((await http.post('/api/payments/webhook').send(payload)).status).toBe(204);

    expect((await http.get('/api/credits').set(as('u-1'))).body.available).toBe(60);
  });

  it('webhook "pending" não muda nada; o "succeeded" seguinte confirma', async () => {
    const { http, as } = montar();
    await registrar(http);
    const { body: checkout } = await http.post('/api/payments').set(as('u-1')).send({ packId: 'STARTER' });
    const hook = (gatewayStatus) => http.post('/api/payments/webhook')
      .send({ paymentIntentId: checkout.paymentIntentId, gatewayTransactionId: 'gw-1', gatewayStatus });

    expect((await hook('pending')).status).toBe(204);
    expect((await http.get('/api/payments').set(as('u-1'))).body[0].status).toBe('PENDING');
    expect((await http.get('/api/credits').set(as('u-1'))).body.available).toBe(10);

    expect((await hook('succeeded')).status).toBe(204);
    expect((await http.get('/api/payments').set(as('u-1'))).body[0].status).toBe('CONFIRMED');
  });

  it('webhook CONTRADITÓRIO ("failed" depois de "succeeded") continua 409 CONFLICT', async () => {
    const { http } = montar();
    await registrar(http);
    const { body: checkout } = await http.post('/api/payments').set({ 'x-user-id': 'u-1' }).send({ packId: 'STARTER' });
    const hook = (gatewayStatus) => http.post('/api/payments/webhook')
      .send({ paymentIntentId: checkout.paymentIntentId, gatewayTransactionId: 'gw-1', gatewayStatus });
    await hook('succeeded');

    const res = await hook('failed');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});
