'use strict';

const { ScheduledSearch } = require('../../../src/scheduler/domain/aggregates');
const { InMemoryScheduleRepository } = require('../../../src/scheduler/infrastructure/in-memory-schedule-repository');
const { T0, watchCriado } = require('./support');

describe('InMemoryScheduleRepository', () => {
  it('findById devolve null quando não existe', async () => {
    expect(await new InMemoryScheduleRepository().findById('x')).toBeNull();
  });

  it('save + findById preserva o estado e devolve instância nova sem eventos pendentes', async () => {
    const repo = new InMemoryScheduleRepository();
    const s = ScheduledSearch.schedule(watchCriado(), T0);
    s.trigger(T0); // evento pendente

    await repo.save(s);
    const loaded = await repo.findById('w-1');

    expect(loaded).not.toBe(s);
    expect(loaded.nextRunAt).toBe(s.nextRunAt);
    expect(loaded.pullDomainEvents()).toEqual([]);
  });

  it('findOpen devolve só schedules não encerrados', async () => {
    const repo = new InMemoryScheduleRepository();
    const aberto = ScheduledSearch.schedule(watchCriado({ watchRequestId: 'w-1' }), T0);
    const pausado = ScheduledSearch.schedule(watchCriado({ watchRequestId: 'w-2', status: 'suspended_credits' }), T0);
    const encerrado = ScheduledSearch.schedule(watchCriado({ watchRequestId: 'w-3' }), T0);
    encerrado.cancel();
    await Promise.all([aberto, pausado, encerrado].map((s) => repo.save(s)));

    const open = await repo.findOpen();

    expect(open.map((s) => s.watchRequestId).sort()).toEqual(['w-1', 'w-2']);
  });
});
