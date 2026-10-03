'use strict';

const { startServer } = require('../../src/server');
const { createApp } = require('../../src/app');
const { FakeFlightProvider } = require('../../src/integration/fake-flight-provider');

const silent = { error: () => {}, log: () => {} };

async function json(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

async function esperar(condicao, ms = 2000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (await condicao()) return true;
    await new Promise((r) => setTimeout(r, 15));
  }
  return false;
}

describe('startServer', () => {
  let server;
  afterEach(async () => { if (server) await server.stop(); server = null; });

  it('sobe na porta pedida, responde /health e para limpando o timer do scheduler', async () => {
    server = await startServer({ port: 0, tickMs: 0, logger: silent });

    const res = await json(`http://127.0.0.1:${server.port}/health`);

    expect(res).toEqual({ status: 200, body: { status: 'ok' } });
  });

  it('roda o scheduler sozinho a cada tickMs: o watch é buscado e o saldo cai sem ninguém chamar o tick', async () => {
    const app = createApp({ flightProvider: new FakeFlightProvider({ seed: 2 }) });
    server = await startServer({ port: 0, tickMs: 20, app, logger: silent });
    const base = `http://127.0.0.1:${server.port}`;
    const h = { 'x-user-id': 'u-1' };
    await json(`${base}/api/users`, { method: 'POST', body: JSON.stringify({ userId: 'u-1' }) });
    const future = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    await json(`${base}/api/watches`, {
      method: 'POST', headers: h, body: JSON.stringify({ origin: 'GRU', destination: 'LIS', departureDate: future }),
    });

    const debitou = await esperar(async () => (await json(`${base}/api/credits`, { headers: h })).body.available === 9);
    expect(debitou).toBe(true);
  });

  it('erro dentro de um tick é registrado e não derruba o servidor', async () => {
    const errors = [];
    const app = createApp();
    app.scheduler.runDueSearches.execute = async () => { throw new Error('tick quebrou'); };
    server = await startServer({ port: 0, tickMs: 10, app, logger: { error: (e) => errors.push(e.message), log: () => {} } });

    await esperar(async () => errors.length > 0);

    expect(errors[0]).toBe('tick quebrou');
    expect((await json(`http://127.0.0.1:${server.port}/health`)).status).toBe(200);
  });
});
