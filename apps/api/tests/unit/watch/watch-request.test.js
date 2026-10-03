'use strict';

const { ConflictError } = require('../../../src/shared/errors');
const { WatchRequest, WatchStatus } = require('../../../src/watch/domain/aggregates');

const AGORA = new Date('2026-10-10T12:00:00.000Z');
const DEPOIS_DO_FIM = new Date('2026-12-01T00:00:00.000Z'); // além dos 30 dias padrão

const dados = (over = {}) => ({
  userId: 'u-1', origin: 'GRU', destination: 'LIS', departureDate: '2026-12-20', ...over,
});

function novoWatch(over = {}, options = {}) {
  const watch = WatchRequest.create(dados(over), { now: AGORA, ...options });
  watch.pullDomainEvents(); // descarta WatchCreated do arrange
  return watch;
}

const tipos = (events) => events.map((e) => e.type);

describe('WatchRequest.create', () => {
  it('cria watch ACTIVE com rota, datas e política e emite WatchCreated', () => {
    const watch = WatchRequest.create(dados({ intervalHours: 6, durationDays: 20 }), { now: AGORA });

    expect(watch.status).toBe(WatchStatus.ACTIVE);
    expect(watch.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: 'WatchCreated',
        watchRequestId: watch.watchRequestId,
        userId: 'u-1',
        origin: 'GRU',
        destination: 'LIS',
        departureDate: '2026-12-20',
        returnDate: null,
        intervalHours: 6,
        expiresAt: '2026-10-30T12:00:00.000Z',
        status: 'active',
      }),
    ]);
  });

  it('sem créditos disponíveis nasce suspensa e emite WatchCreated + WatchSuspendedDueToCredits', () => {
    const watch = WatchRequest.create(dados(), { now: AGORA, creditsAvailable: false });

    expect(watch.status).toBe(WatchStatus.SUSPENDED_CREDITS);
    const events = watch.pullDomainEvents();
    expect(tipos(events)).toEqual(['WatchCreated', 'WatchSuspendedDueToCredits']);
    expect(events[0].status).toBe('suspended_credits');
  });

  it('exige usuário e valida rota, datas e política (ValidationError)', () => {
    const { ValidationError } = require('../../../src/shared/errors');

    expect(() => WatchRequest.create(dados({ userId: '' }), { now: AGORA })).toThrow(ValidationError);
    expect(() => WatchRequest.create(dados({ origin: 'XX' }), { now: AGORA })).toThrow(ValidationError);
    expect(() => WatchRequest.create(dados({ departureDate: '2020-01-01' }), { now: AGORA })).toThrow(ValidationError);
    expect(() => WatchRequest.create(dados({ intervalHours: 0 }), { now: AGORA })).toThrow(ValidationError);
  });

  it('ids são únicos', () => {
    expect(novoWatch().watchRequestId).not.toBe(novoWatch().watchRequestId);
  });
});

describe('WatchRequest.suspendForCredits', () => {
  it('ACTIVE -> SUSPENDED_CREDITS e emite WatchSuspendedDueToCredits', () => {
    const watch = novoWatch();

    expect(watch.suspendForCredits()).toBe(true);

    expect(watch.status).toBe(WatchStatus.SUSPENDED_CREDITS);
    expect(watch.pullDomainEvents()).toEqual([
      expect.objectContaining({ type: 'WatchSuspendedDueToCredits', userId: 'u-1', watchRequestId: watch.watchRequestId }),
    ]);
  });

  it('já suspensa, cancelada ou expirada: não faz nada e não emite evento', () => {
    const suspensa = novoWatch({}, { creditsAvailable: false });
    suspensa.pullDomainEvents();
    const cancelada = novoWatch();
    cancelada.cancel();
    cancelada.pullDomainEvents();

    expect(suspensa.suspendForCredits()).toBe(false);
    expect(cancelada.suspendForCredits()).toBe(false);
    expect(suspensa.pullDomainEvents()).toEqual([]);
    expect(cancelada.pullDomainEvents()).toEqual([]);
  });
});

describe('WatchRequest.reactivate', () => {
  function suspensa() {
    const w = novoWatch();
    w.suspendForCredits();
    w.pullDomainEvents();
    return w;
  }

  it('SUSPENDED_CREDITS -> ACTIVE e emite WatchReactivated', () => {
    const watch = suspensa();

    expect(watch.reactivate(AGORA)).toBe(true);

    expect(watch.status).toBe(WatchStatus.ACTIVE);
    expect(tipos(watch.pullDomainEvents())).toEqual(['WatchReactivated']);
  });

  it('se a janela de busca já terminou, expira em vez de reativar', () => {
    const watch = suspensa();

    expect(watch.reactivate(DEPOIS_DO_FIM)).toBe(false);

    expect(watch.status).toBe(WatchStatus.EXPIRED);
    expect(tipos(watch.pullDomainEvents())).toEqual(['WatchExpired']);
  });

  it('watch ACTIVE ou cancelada não muda e não emite evento', () => {
    const ativa = novoWatch();

    expect(ativa.reactivate(AGORA)).toBe(false);
    expect(ativa.pullDomainEvents()).toEqual([]);
  });
});

describe('WatchRequest.cancel', () => {
  it.each([
    ['ativa', () => novoWatch()],
    ['suspensa', () => novoWatch({}, { creditsAvailable: false })],
  ])('cancela watch %s e emite WatchCancelled', (_, build) => {
    const watch = build();
    watch.pullDomainEvents();

    watch.cancel();

    expect(watch.status).toBe(WatchStatus.CANCELLED);
    expect(tipos(watch.pullDomainEvents())).toEqual(['WatchCancelled']);
  });

  it('cancelar de novo ou depois de expirada lança ConflictError', () => {
    const cancelada = novoWatch();
    cancelada.cancel();
    const expirada = novoWatch();
    expirada.expire();

    expect(() => cancelada.cancel()).toThrow(ConflictError);
    expect(() => expirada.cancel()).toThrow(/cannot cancel from status "expired"/);
  });
});

describe('WatchRequest.expire', () => {
  it('ACTIVE e SUSPENDED viram EXPIRED e emitem WatchExpired uma única vez', () => {
    const watch = novoWatch();

    expect(watch.expire()).toBe(true);
    expect(watch.expire()).toBe(false);

    expect(watch.status).toBe(WatchStatus.EXPIRED);
    expect(tipos(watch.pullDomainEvents())).toEqual(['WatchExpired']);
  });

  it('watch cancelada não expira', () => {
    const watch = novoWatch();
    watch.cancel();
    watch.pullDomainEvents();

    expect(watch.expire()).toBe(false);
    expect(watch.status).toBe(WatchStatus.CANCELLED);
  });
});

describe('WatchRequest consultas', () => {
  it('belongsTo compara o dono; toDto expõe só dados simples (contrato da API)', () => {
    const watch = novoWatch({ returnDate: '2027-01-05' });

    expect(watch.belongsTo('u-1')).toBe(true);
    expect(watch.belongsTo('u-2')).toBe(false);
    expect(watch.toDto()).toEqual({
      watchRequestId: watch.watchRequestId,
      userId: 'u-1',
      origin: 'GRU',
      destination: 'LIS',
      departureDate: '2026-12-20',
      returnDate: '2027-01-05',
      intervalHours: 4,
      expiresAt: '2026-11-09T12:00:00.000Z',
      status: 'active',
      createdAt: '2026-10-10T12:00:00.000Z',
    });
  });

  it('pullDomainEvents esvazia a fila', () => {
    const watch = WatchRequest.create(dados(), { now: AGORA });
    watch.pullDomainEvents();

    expect(watch.pullDomainEvents()).toEqual([]);
  });
});
