'use strict';

const { SearchJob } = require('../../../src/search/domain/aggregates');
const { InMemorySearchJobRepository } = require('../../../src/search/infrastructure/in-memory-search-job-repository');
const { T0 } = require('./support');

const novo = (jobId = 'job-1') => SearchJob.start({
  jobId, watchRequestId: 'w-1', userId: 'u-1',
  criteria: { origin: 'GRU', destination: 'LIS', departureDate: '2026-12-20' },
}, T0);

describe('InMemorySearchJobRepository', () => {
  it('findByJobId devolve null quando não existe', async () => {
    expect(await new InMemorySearchJobRepository().findByJobId('x')).toBeNull();
  });

  it('save + find preserva status, critérios e snapshot; instância nova sem eventos pendentes', async () => {
    const repo = new InMemorySearchJobRepository();
    const job = novo();
    job.complete({ price: { amount: 100, currency: 'BRL' }, provider: 'p' }, T0);

    await repo.save(job);
    const loaded = await repo.findByJobId('job-1');

    expect(loaded).not.toBe(job);
    expect(loaded.status).toBe('COMPLETED');
    expect(loaded.snapshot.price.amount).toBe(100);
    expect(loaded.criteria.destination).toBe('LIS');
    expect(loaded.pullDomainEvents()).toEqual([]);
  });

  it('preserva job FAILED com motivo', async () => {
    const repo = new InMemorySearchJobRepository();
    const job = novo();
    job.fail('boom', T0);
    await repo.save(job);

    expect((await repo.findByJobId('job-1')).failureReason).toBe('boom');
  });

  it('findCompletedByWatch devolve só jobs concluídos daquele watch e usuário', async () => {
    const repo = new InMemorySearchJobRepository();
    const ok = novo('a'); ok.complete({ price: { amount: 1, currency: 'BRL' } }, T0);
    const falho = novo('b'); falho.fail('x', T0);
    const pendente = novo('c');
    await Promise.all([ok, falho, pendente].map((j) => repo.save(j)));

    const found = await repo.findCompletedByWatch({ userId: 'u-1', watchRequestId: 'w-1' });

    expect(found.map((j) => j.jobId)).toEqual(['a']);
    expect(await repo.findCompletedByWatch({ userId: 'u-2', watchRequestId: 'w-1' })).toEqual([]);
  });
});
