'use strict';

const { ScheduledSearch, ScheduleStatus } = require('../../../src/scheduler/domain/aggregates');
const { T0, horas, watchCriado } = require('./support');

const novo = (over = {}) => {
  const s = ScheduledSearch.schedule(watchCriado(over), T0);
  s.pullDomainEvents();
  return s;
};

describe('ScheduledSearch.schedule', () => {
  it('nasce ACTIVE e pronta para a primeira busca imediatamente', () => {
    const s = ScheduledSearch.schedule(watchCriado(), T0);

    expect(s.status).toBe(ScheduleStatus.ACTIVE);
    expect(s.nextRunAt).toBe(T0.toISOString());
    expect(s.isDue(T0)).toBe(true);
    expect(s.pullDomainEvents()).toEqual([]); // agendar não é um fato de negócio
  });

  it('watch criado suspenso (sem créditos) nasce PAUSED e nunca vence', () => {
    const s = ScheduledSearch.schedule(watchCriado({ status: 'suspended_credits' }), T0);

    expect(s.status).toBe(ScheduleStatus.PAUSED);
    expect(s.isDue(horas(100))).toBe(false);
  });
});

describe('ScheduledSearch.trigger', () => {
  it('emite SearchJobTriggered com os critérios da busca e agenda a próxima rodada pelo intervalo', () => {
    const s = novo({ intervalHours: 6, returnDate: '2027-01-05' });

    s.trigger(T0);

    expect(s.nextRunAt).toBe(horas(6).toISOString());
    expect(s.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: 'SearchJobTriggered',
        jobId: expect.any(String),
        watchRequestId: 'w-1',
        userId: 'u-1',
        origin: 'GRU',
        destination: 'LIS',
        departureDate: '2026-12-20',
        returnDate: '2027-01-05',
        triggeredAt: T0.toISOString(),
      }),
    ]);
  });

  it('cada disparo tem um jobId novo (chave de idempotência da Search)', () => {
    const s = novo({ intervalHours: 1 });
    s.trigger(T0);
    s.trigger(horas(1));

    const [a, b] = s.pullDomainEvents();
    expect(a.jobId).not.toBe(b.jobId);
  });

  it('não dispara antes da hora, pausada ou depois de encerrada (ConflictError)', () => {
    const { ConflictError } = require('../../../src/shared/errors');
    const s = novo();
    s.trigger(T0);

    expect(() => s.trigger(horas(1))).toThrow(ConflictError);

    const pausada = novo();
    pausada.pause();
    expect(() => pausada.trigger(T0)).toThrow(/cannot trigger/);
  });

  it('atraso grande não gera várias buscas: a próxima rodada conta a partir de agora', () => {
    const s = novo({ intervalHours: 4 });

    s.trigger(horas(30)); // o servidor ficou parado 30h

    expect(s.nextRunAt).toBe(horas(34).toISOString());
  });
});

describe('ScheduledSearch.isDue / hasEnded', () => {
  it('vence quando chega a hora e fica fora de prazo ao passar da expiração', () => {
    const s = novo({ intervalHours: 4 });
    s.trigger(T0);

    expect(s.isDue(horas(3))).toBe(false);
    expect(s.isDue(horas(4))).toBe(true);
    expect(s.isDue(new Date('2026-11-09T12:00:00.000Z'))).toBe(false); // expirou
  });

  it('hasEnded é true a partir da expiração e só para schedules não encerrados', () => {
    const s = novo();

    expect(s.hasEnded(new Date('2026-11-09T11:59:59.000Z'))).toBe(false);
    expect(s.hasEnded(new Date('2026-11-09T12:00:00.000Z'))).toBe(true);

    s.cancel();
    expect(s.hasEnded(new Date('2027-01-01T00:00:00.000Z'))).toBe(false);
  });
});

describe('pause / resume / end / cancel', () => {
  it('pause: ACTIVE -> PAUSED (true) e repetir devolve false', () => {
    const s = novo();

    expect(s.pause()).toBe(true);
    expect(s.pause()).toBe(false);
    expect(s.status).toBe(ScheduleStatus.PAUSED);
  });

  it('resume: PAUSED -> ACTIVE e a busca roda na próxima rodada (agora)', () => {
    const s = novo({ intervalHours: 4 });
    s.trigger(T0);
    s.pause();

    expect(s.resume(horas(10))).toBe(true);

    expect(s.status).toBe(ScheduleStatus.ACTIVE);
    expect(s.nextRunAt).toBe(horas(10).toISOString());
    expect(s.resume(horas(11))).toBe(false); // já ativa
  });

  it('end: encerra, emite SearchWindowEnded uma vez e não dispara mais', () => {
    const s = novo();
    const fim = new Date('2026-11-09T12:00:00.000Z');

    expect(s.end(fim)).toBe(true);
    expect(s.end(fim)).toBe(false);

    expect(s.status).toBe(ScheduleStatus.ENDED);
    expect(s.pullDomainEvents()).toEqual([
      expect.objectContaining({ type: 'SearchWindowEnded', watchRequestId: 'w-1', userId: 'u-1', endedAt: fim.toISOString() }),
    ]);
    expect(s.isDue(fim)).toBe(false);
  });

  it('cancel: encerra em silêncio (sem evento) e é idempotente', () => {
    const s = novo();

    expect(s.cancel()).toBe(true);
    expect(s.cancel()).toBe(false);

    expect(s.status).toBe(ScheduleStatus.ENDED);
    expect(s.pullDomainEvents()).toEqual([]);
  });

  it('schedule encerrado não pausa nem retoma', () => {
    const s = novo();
    s.cancel();

    expect(s.pause()).toBe(false);
    expect(s.resume(T0)).toBe(false);
  });
});
