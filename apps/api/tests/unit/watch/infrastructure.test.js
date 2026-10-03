'use strict';

const { WatchRequest } = require('../../../src/watch/domain/aggregates');
const { InMemoryWatchRepository } = require('../../../src/watch/infrastructure/in-memory-watch-repository');
const { InMemoryCreditStatusStore } = require('../../../src/watch/infrastructure/in-memory-credit-status-store');
const { AGORA, novoPedido } = require('./support');

describe('InMemoryWatchRepository', () => {
  it('findById devolve null quando não existe', async () => {
    expect(await new InMemoryWatchRepository().findById('x')).toBeNull();
  });

  it('save + findById preserva todos os dados do watch', async () => {
    const repo = new InMemoryWatchRepository();
    const watch = WatchRequest.create(novoPedido({ returnDate: '2027-01-05', intervalHours: 2 }), { now: AGORA });
    watch.suspendForCredits();

    await repo.save(watch);
    const loaded = await repo.findById(watch.watchRequestId);

    expect(loaded.toDto()).toEqual(watch.toDto());
    expect(loaded.status).toBe('suspended_credits');
  });

  it('devolve instância nova e sem eventos pendentes (como um banco de dados)', async () => {
    const repo = new InMemoryWatchRepository();
    const watch = WatchRequest.create(novoPedido(), { now: AGORA }); // tem WatchCreated pendente
    await repo.save(watch);

    const loaded = await repo.findById(watch.watchRequestId);

    expect(loaded).not.toBe(watch);
    expect(loaded.pullDomainEvents()).toEqual([]);
  });

  it('findByUserId devolve só os watches do usuário, do mais novo ao mais antigo', async () => {
    const repo = new InMemoryWatchRepository();
    const velho = WatchRequest.create(novoPedido(), { now: new Date('2026-10-01T00:00:00.000Z') });
    const novo = WatchRequest.create(novoPedido({ destination: 'MAD' }), { now: new Date('2026-10-05T00:00:00.000Z') });
    const outro = WatchRequest.create(novoPedido({ userId: 'u-2' }), { now: AGORA });
    await Promise.all([velho, novo, outro].map((w) => repo.save(w)));

    const list = await repo.findByUserId('u-1');

    expect(list.map((w) => w.route.destination)).toEqual(['MAD', 'LIS']);
    expect(await repo.findByUserId('u-9')).toEqual([]);
  });
});

describe('InMemoryCreditStatusStore (projeção local dos eventos do Ledger)', () => {
  it('usuário desconhecido não está esgotado', async () => {
    expect(await new InMemoryCreditStatusStore().isExhausted('u-1')).toBe(false);
  });

  it('markExhausted e markRestored alternam o estado do usuário', async () => {
    const store = new InMemoryCreditStatusStore();

    await store.markExhausted('u-1');
    expect(await store.isExhausted('u-1')).toBe(true);
    expect(await store.isExhausted('u-2')).toBe(false);

    await store.markRestored('u-1');
    expect(await store.isExhausted('u-1')).toBe(false);
  });
});
