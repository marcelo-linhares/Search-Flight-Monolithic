'use strict';

const {
  OnWatchCreated,
  OnWatchSuspendedDueToCredits,
  OnWatchReactivated,
  OnWatchStopped,
} = require('../../../src/scheduler/application/handlers');
const { T0, horas, watchCriado, ambiente } = require('./support');

describe('Scheduler reage ao ciclo de vida do Watch (por eventos)', () => {
  it('WatchCreated agenda uma busca ACTIVE com os dados do evento', async () => {
    const env = ambiente();

    await new OnWatchCreated(env.scheduleRepo, { clock: env.clock }).handle(watchCriado());

    const s = await env.scheduleRepo.findById('w-1');
    expect(s).toMatchObject({ userId: 'u-1', status: 'ACTIVE', origin: 'GRU', destination: 'LIS' });
    expect(s.nextRunAt).toBe(T0.toISOString());
  });

  it('WatchCreated suspenso agenda PAUSED', async () => {
    const env = ambiente();

    await new OnWatchCreated(env.scheduleRepo, { clock: env.clock }).handle(watchCriado({ status: 'suspended_credits' }));

    expect((await env.scheduleRepo.findById('w-1')).status).toBe('PAUSED');
  });

  it('WatchCreated repetido (evento reentregue) não duplica nem reinicia o schedule', async () => {
    const env = ambiente();
    const handler = new OnWatchCreated(env.scheduleRepo, { clock: env.clock });
    await handler.handle(watchCriado());
    const first = await env.scheduleRepo.findById('w-1');
    first.trigger(T0);
    await env.scheduleRepo.save(first);

    await handler.handle(watchCriado());

    expect((await env.scheduleRepo.findById('w-1')).nextRunAt).toBe(horas(4).toISOString());
  });

  it('WatchSuspendedDueToCredits pausa e WatchReactivated retoma (rodando já no próximo tick)', async () => {
    const env = ambiente();
    await new OnWatchCreated(env.scheduleRepo, { clock: env.clock }).handle(watchCriado());

    await new OnWatchSuspendedDueToCredits(env.scheduleRepo).handle({ watchRequestId: 'w-1' });
    expect((await env.scheduleRepo.findById('w-1')).status).toBe('PAUSED');

    await new OnWatchReactivated(env.scheduleRepo, { clock: () => horas(8) }).handle({ watchRequestId: 'w-1' });
    const s = await env.scheduleRepo.findById('w-1');
    expect(s.status).toBe('ACTIVE');
    expect(s.nextRunAt).toBe(horas(8).toISOString());
  });

  it.each(['WatchCancelled', 'WatchExpired'])('%s encerra o schedule sem publicar eventos', async (type) => {
    const env = ambiente();
    await new OnWatchCreated(env.scheduleRepo, { clock: env.clock }).handle(watchCriado());

    await new OnWatchStopped(env.scheduleRepo).handle({ type, watchRequestId: 'w-1' });

    expect((await env.scheduleRepo.findById('w-1')).status).toBe('ENDED');
    expect(env.bus.published).toEqual([]);
  });

  it('eventos de watch desconhecido são ignorados em silêncio', async () => {
    const env = ambiente();

    await expect(new OnWatchSuspendedDueToCredits(env.scheduleRepo).handle({ watchRequestId: 'x' })).resolves.toBeUndefined();
    await expect(new OnWatchReactivated(env.scheduleRepo, { clock: env.clock }).handle({ watchRequestId: 'x' })).resolves.toBeUndefined();
    await expect(new OnWatchStopped(env.scheduleRepo).handle({ watchRequestId: 'x' })).resolves.toBeUndefined();
  });
});
