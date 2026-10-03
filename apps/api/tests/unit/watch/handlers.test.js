'use strict';

const { WatchRequest } = require('../../../src/watch/domain/aggregates');
const {
  OnBalanceExhausted,
  OnBalanceRestored,
  OnSearchWindowEnded,
} = require('../../../src/watch/application/handlers');
const { AGORA, ambiente, novoPedido } = require('./support');

async function semearWatches(env, pedidos) {
  const ids = [];
  for (const pedido of pedidos) {
    const w = WatchRequest.create(novoPedido(pedido), { now: AGORA });
    w.pullDomainEvents();
    await env.watchRepo.save(w);
    ids.push(w.watchRequestId);
  }
  return ids;
}

const statusDe = async (env, id) => (await env.watchRepo.findById(id)).status;

describe('OnBalanceExhausted (Ledger -> Watch Management)', () => {
  it('suspende todos os watches ativos do usuário e publica um WatchSuspendedDueToCredits por watch', async () => {
    const env = ambiente();
    const [a, b, outro] = await semearWatches(env, [{}, { destination: 'MAD' }, { userId: 'u-2' }]);

    await new OnBalanceExhausted(env.watchRepo, env.creditStatus, env.bus).handle({ userId: 'u-1' });

    expect(await statusDe(env, a)).toBe('suspended_credits');
    expect(await statusDe(env, b)).toBe('suspended_credits');
    expect(await statusDe(env, outro)).toBe('active');
    expect(env.bus.types()).toEqual(['WatchSuspendedDueToCredits', 'WatchSuspendedDueToCredits']);
  });

  it('não mexe em watches cancelados e é idempotente (segundo evento não publica nada)', async () => {
    const env = ambiente();
    const [ativo, cancelado] = await semearWatches(env, [{}, { destination: 'MAD' }]);
    const c = await env.watchRepo.findById(cancelado);
    c.cancel();
    await env.watchRepo.save(c);
    const handler = new OnBalanceExhausted(env.watchRepo, env.creditStatus, env.bus);

    await handler.handle({ userId: 'u-1' });
    env.bus.published.length = 0;
    await handler.handle({ userId: 'u-1' });

    expect(await statusDe(env, ativo)).toBe('suspended_credits');
    expect(await statusDe(env, cancelado)).toBe('cancelled');
    expect(env.bus.published).toEqual([]);
  });

  it('registra o usuário como esgotado para os próximos watches nascerem suspensos', async () => {
    const env = ambiente();

    await new OnBalanceExhausted(env.watchRepo, env.creditStatus, env.bus).handle({ userId: 'u-1' });

    expect(await env.creditStatus.isExhausted('u-1')).toBe(true);
  });
});

describe('OnBalanceRestored (Ledger -> Watch Management)', () => {
  it('reativa os watches suspensos do usuário e publica WatchReactivated', async () => {
    const env = ambiente();
    const [a, b] = await semearWatches(env, [{}, { destination: 'MAD' }]);
    await new OnBalanceExhausted(env.watchRepo, env.creditStatus, env.bus).handle({ userId: 'u-1' });
    env.bus.published.length = 0;

    await new OnBalanceRestored(env.watchRepo, env.creditStatus, env.bus, { clock: env.clock }).handle({ userId: 'u-1' });

    expect(await statusDe(env, a)).toBe('active');
    expect(await statusDe(env, b)).toBe('active');
    expect(env.bus.types()).toEqual(['WatchReactivated', 'WatchReactivated']);
    expect(await env.creditStatus.isExhausted('u-1')).toBe(false);
  });

  it('watch cuja janela já terminou expira em vez de reativar', async () => {
    const env = ambiente(new Date('2027-01-01T00:00:00.000Z')); // depois dos 30 dias
    const [id] = await semearWatches(env, [{}]);
    const w = await env.watchRepo.findById(id);
    w.suspendForCredits();
    await env.watchRepo.save(w);

    await new OnBalanceRestored(env.watchRepo, env.creditStatus, env.bus, { clock: env.clock }).handle({ userId: 'u-1' });

    expect(await statusDe(env, id)).toBe('expired');
    expect(env.bus.types()).toEqual(['WatchExpired']);
  });

  it('sem watches suspensos: só atualiza a projeção, sem eventos', async () => {
    const env = ambiente();
    await env.creditStatus.markExhausted('u-1');

    await new OnBalanceRestored(env.watchRepo, env.creditStatus, env.bus, { clock: env.clock }).handle({ userId: 'u-1' });

    expect(env.bus.published).toEqual([]);
    expect(await env.creditStatus.isExhausted('u-1')).toBe(false);
  });
});

describe('OnSearchWindowEnded (Scheduler -> Watch Management)', () => {
  it('expira o watch e publica WatchExpired', async () => {
    const env = ambiente();
    const [id] = await semearWatches(env, [{}]);

    await new OnSearchWindowEnded(env.watchRepo, env.bus).handle({ watchRequestId: id, userId: 'u-1' });

    expect(await statusDe(env, id)).toBe('expired');
    expect(env.bus.types()).toEqual(['WatchExpired']);
  });

  it('watch inexistente ou já expirado: ignora em silêncio', async () => {
    const env = ambiente();
    const [id] = await semearWatches(env, [{}]);
    const handler = new OnSearchWindowEnded(env.watchRepo, env.bus);
    await handler.handle({ watchRequestId: id, userId: 'u-1' });
    env.bus.published.length = 0;

    await handler.handle({ watchRequestId: id, userId: 'u-1' });
    await handler.handle({ watchRequestId: 'nao-existe', userId: 'u-1' });

    expect(env.bus.published).toEqual([]);
  });
});
