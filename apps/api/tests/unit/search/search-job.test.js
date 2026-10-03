'use strict';

const { ConflictError } = require('../../../src/shared/errors');
const { SearchJob, SearchJobStatus } = require('../../../src/search/domain/aggregates');
const { T0 } = require('./support');

const novo = () => SearchJob.start({
  jobId: 'job-1', watchRequestId: 'w-1', userId: 'u-1',
  criteria: { origin: 'GRU', destination: 'LIS', departureDate: '2026-12-20', returnDate: '2027-01-05' },
}, T0);

const oferta = { price: { amount: 3200.5, currency: 'BRL' }, provider: 'fake-air' };

describe('SearchJob.start', () => {
  it('nasce PENDING com os critérios e sem eventos', () => {
    const job = novo();

    expect(job).toMatchObject({ jobId: 'job-1', watchRequestId: 'w-1', userId: 'u-1', status: SearchJobStatus.PENDING });
    expect(job.criteria).toMatchObject({ origin: 'GRU', destination: 'LIS' });
    expect(job.snapshot).toBeNull();
    expect(job.pullDomainEvents()).toEqual([]);
  });
});

describe('SearchJob.complete', () => {
  it('registra o snapshot de preço e emite PriceSnapshotCaptured (o Ledger debita a partir dele)', () => {
    const job = novo();

    job.complete(oferta, T0);

    expect(job.status).toBe(SearchJobStatus.COMPLETED);
    expect(job.snapshot).toMatchObject({ snapshotId: expect.any(String), capturedAt: T0.toISOString(), provider: 'fake-air' });
    expect(job.snapshot.price).toMatchObject({ amount: 3200.5, currency: 'BRL' });
    expect(job.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: 'PriceSnapshotCaptured',
        userId: 'u-1',
        watchRequestId: 'w-1',
        snapshotId: job.snapshot.snapshotId,
        jobId: 'job-1',
        origin: 'GRU',
        destination: 'LIS',
        departureDate: '2026-12-20',
        returnDate: '2027-01-05',
        price: { amount: 3200.5, currency: 'BRL' },
        provider: 'fake-air',
        capturedAt: T0.toISOString(),
      }),
    ]);
  });

  it('oferta com preço inválido: ValidationError e o job continua PENDING', () => {
    const { ValidationError } = require('../../../src/shared/errors');
    const job = novo();

    expect(() => job.complete({ price: { amount: NaN, currency: 'BRL' } }, T0)).toThrow(ValidationError);
    expect(() => job.complete(null, T0)).toThrow(ValidationError);

    expect(job.status).toBe(SearchJobStatus.PENDING);
    expect(job.pullDomainEvents()).toEqual([]);
  });

  it('não completa duas vezes nem depois de falhar (ConflictError)', () => {
    const concluido = novo();
    concluido.complete(oferta, T0);
    const falho = novo();
    falho.fail('provider down', T0);

    expect(() => concluido.complete(oferta, T0)).toThrow(ConflictError);
    expect(() => falho.complete(oferta, T0)).toThrow(/cannot complete from status "FAILED"/);
  });
});

describe('SearchJob.fail', () => {
  it('marca FAILED com o motivo e emite SearchJobFailed (sem PriceSnapshotCaptured: ninguém é cobrado)', () => {
    const job = novo();

    job.fail('provider timeout', T0);

    expect(job.status).toBe(SearchJobStatus.FAILED);
    expect(job.failureReason).toBe('provider timeout');
    expect(job.snapshot).toBeNull();
    expect(job.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: 'SearchJobFailed', userId: 'u-1', watchRequestId: 'w-1', jobId: 'job-1',
        reason: 'provider timeout', failedAt: T0.toISOString(),
      }),
    ]);
  });

  it('não falha depois de concluído nem duas vezes (ConflictError)', () => {
    const concluido = novo();
    concluido.complete(oferta, T0);
    const falho = novo();
    falho.fail('x', T0);

    expect(() => concluido.fail('x', T0)).toThrow(ConflictError);
    expect(() => falho.fail('y', T0)).toThrow(ConflictError);
  });
});
