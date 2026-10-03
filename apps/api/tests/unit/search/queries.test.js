'use strict';

const { OnSearchJobTriggered } = require('../../../src/search/application/handlers');
const { GetPriceHistory } = require('../../../src/search/application/queries');
const { disparo, portaCom, oferta, ambiente } = require('./support');

async function registrar(env, jobId, amount, instant, over = {}) {
  const clock = () => new Date(instant);
  await new OnSearchJobTriggered(env.jobRepo, portaCom(oferta(amount)), env.bus, { clock }).handle(disparo({ jobId, ...over }));
}

describe('GetPriceHistory', () => {
  it('lista os snapshots do watch do mais antigo ao mais novo, com o menor e o mais recente', async () => {
    const env = ambiente();
    await registrar(env, 'j2', 2800, '2026-10-11T12:00:00.000Z');
    await registrar(env, 'j1', 3000, '2026-10-10T12:00:00.000Z');
    await registrar(env, 'j3', 3100, '2026-10-12T12:00:00.000Z');

    const history = await new GetPriceHistory(env.jobRepo).execute({ userId: 'u-1', watchRequestId: 'w-1' });

    expect(history.watchRequestId).toBe('w-1');
    expect(history.snapshots.map((s) => s.amount)).toEqual([3000, 2800, 3100]);
    expect(history.snapshots[0]).toEqual({
      snapshotId: expect.any(String), amount: 3000, currency: 'BRL', provider: 'fake-air', capturedAt: '2026-10-10T12:00:00.000Z',
    });
    expect(history.lowest.amount).toBe(2800);
    expect(history.latest.amount).toBe(3100);
  });

  it('ignora jobs com falha, outros watches e outros usuários', async () => {
    const env = ambiente();
    await registrar(env, 'j1', 3000, '2026-10-10T12:00:00.000Z');
    await registrar(env, 'j2', 100, '2026-10-10T13:00:00.000Z', { watchRequestId: 'w-2' });
    await registrar(env, 'j3', 100, '2026-10-10T14:00:00.000Z', { userId: 'u-2' });
    await new OnSearchJobTriggered(env.jobRepo, portaCom(new Error('x')), env.bus, { clock: env.clock }).handle(disparo({ jobId: 'j4' }));

    const history = await new GetPriceHistory(env.jobRepo).execute({ userId: 'u-1', watchRequestId: 'w-1' });

    expect(history.snapshots).toHaveLength(1);
  });

  it('sem snapshots: lista vazia e lowest/latest nulos', async () => {
    const history = await new GetPriceHistory(ambiente().jobRepo).execute({ userId: 'u-1', watchRequestId: 'w-1' });

    expect(history).toEqual({ watchRequestId: 'w-1', snapshots: [], lowest: null, latest: null });
  });
});
