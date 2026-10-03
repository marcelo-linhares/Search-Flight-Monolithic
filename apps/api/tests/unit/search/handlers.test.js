'use strict';

const { OnSearchJobTriggered } = require('../../../src/search/application/handlers');
const { disparo, portaCom, oferta, ambiente } = require('./support');

const handlerDe = (env, port) => new OnSearchJobTriggered(env.jobRepo, port, env.bus, { clock: env.clock });

describe('OnSearchJobTriggered (Scheduler -> Search)', () => {
  it('consulta o FlightPort com os critérios, guarda o snapshot e publica PriceSnapshotCaptured', async () => {
    const env = ambiente();
    const port = portaCom(oferta(2999.9));

    await handlerDe(env, port).handle(disparo({ returnDate: '2027-01-05' }));

    expect(port.calls).toEqual([
      expect.objectContaining({ origin: 'GRU', destination: 'LIS', departureDate: '2026-12-20', returnDate: '2027-01-05' }),
    ]);
    const job = await env.jobRepo.findByJobId('job-1');
    expect(job.status).toBe('COMPLETED');
    expect(job.snapshot.price.amount).toBe(2999.9);
    expect(env.bus.types()).toEqual(['PriceSnapshotCaptured']);
    expect(env.bus.published[0]).toMatchObject({ userId: 'u-1', watchRequestId: 'w-1', price: { amount: 2999.9, currency: 'BRL' } });
  });

  it('provider lança erro: job FAILED, SearchJobFailed publicado e NENHUM PriceSnapshotCaptured (sem cobrança)', async () => {
    const env = ambiente();

    await expect(handlerDe(env, portaCom(new Error('provider timeout'))).handle(disparo())).resolves.toBeUndefined();

    expect((await env.jobRepo.findByJobId('job-1')).status).toBe('FAILED');
    expect(env.bus.types()).toEqual(['SearchJobFailed']);
    expect(env.bus.published[0].reason).toBe('provider timeout');
  });

  it('sem ofertas (provider devolve null): job FAILED com motivo "no offers found"', async () => {
    const env = ambiente();

    await handlerDe(env, portaCom(null)).handle(disparo());

    expect(env.bus.types()).toEqual(['SearchJobFailed']);
    expect(env.bus.published[0].reason).toMatch(/no offers found/);
  });

  it('oferta mal formada do provider: job FAILED (não derruba o consumidor)', async () => {
    const env = ambiente();

    await handlerDe(env, portaCom({ price: { amount: 'abc', currency: 'BRL' } })).handle(disparo());

    expect((await env.jobRepo.findByJobId('job-1')).status).toBe('FAILED');
    expect(env.bus.types()).toEqual(['SearchJobFailed']);
  });

  it('é idempotente por jobId: evento reentregue não consulta o provider nem publica de novo', async () => {
    const env = ambiente();
    const port = portaCom(oferta());
    const handler = handlerDe(env, port);
    await handler.handle(disparo());

    await handler.handle(disparo());

    expect(port.calls).toHaveLength(1);
    expect(env.bus.published).toHaveLength(1);
  });

  it('jobIds diferentes do mesmo watch geram snapshots diferentes', async () => {
    const env = ambiente();
    const handler = handlerDe(env, portaCom(oferta()));

    await handler.handle(disparo({ jobId: 'job-1' }));
    await handler.handle(disparo({ jobId: 'job-2' }));

    expect(env.bus.types()).toEqual(['PriceSnapshotCaptured', 'PriceSnapshotCaptured']);
    expect(env.bus.published[0].snapshotId).not.toBe(env.bus.published[1].snapshotId);
  });
});
