'use strict';

const { ScheduledSearch } = require('../../../src/scheduler/domain/aggregates');
const { RunDueSearchesUseCase } = require('../../../src/scheduler/application/use-cases');
const { T0, horas, watchCriado, ambiente } = require('./support');

async function semear(env, ...payloads) {
  for (const p of payloads) {
    const s = ScheduledSearch.schedule(watchCriado(p), T0);
    s.pullDomainEvents();
    await env.scheduleRepo.save(s);
  }
}

const rodar = (env) => new RunDueSearchesUseCase(env.scheduleRepo, env.bus, { clock: env.clock }).execute();

describe('RunDueSearchesUseCase (um "tick" do scheduler)', () => {
  it('dispara SearchJobTriggered para cada watch vencido e devolve o resumo', async () => {
    const env = ambiente(T0);
    await semear(env, { watchRequestId: 'w-1' }, { watchRequestId: 'w-2', userId: 'u-2' });

    const result = await rodar(env);

    expect(result).toEqual({ triggered: 2, ended: 0 });
    expect(env.bus.types()).toEqual(['SearchJobTriggered', 'SearchJobTriggered']);
    expect(env.bus.published.map((e) => e.watchRequestId).sort()).toEqual(['w-1', 'w-2']);
  });

  it('segundo tick no mesmo instante não dispara de novo (a próxima rodada foi agendada e persistida)', async () => {
    const env = ambiente(T0);
    await semear(env, {});

    await rodar(env);
    const second = await rodar(env);

    expect(second).toEqual({ triggered: 0, ended: 0 });
    expect(env.bus.published).toHaveLength(1);
  });

  it('dispara de novo quando o intervalo passa', async () => {
    const env = ambiente(T0);
    await semear(env, { intervalHours: 4 });
    await rodar(env);

    env.clock = () => horas(4);
    const result = await rodar(env);

    expect(result.triggered).toBe(1);
  });

  it('não dispara schedules pausados (watch suspenso por falta de créditos)', async () => {
    const env = ambiente(T0);
    await semear(env, { status: 'suspended_credits' });

    expect(await rodar(env)).toEqual({ triggered: 0, ended: 0 });
    expect(env.bus.published).toEqual([]);
  });

  it('janela expirada: encerra o schedule e publica SearchWindowEnded em vez de buscar', async () => {
    const env = ambiente(new Date('2026-11-09T12:00:00.000Z'));
    await semear(env, { watchRequestId: 'w-1' });

    const result = await rodar(env);

    expect(result).toEqual({ triggered: 0, ended: 1 });
    expect(env.bus.types()).toEqual(['SearchWindowEnded']);
    expect((await env.scheduleRepo.findById('w-1')).status).toBe('ENDED');
  });

  it('janela expirada também encerra schedule pausado', async () => {
    const env = ambiente(new Date('2026-11-09T12:00:00.000Z'));
    await semear(env, { status: 'suspended_credits' });

    expect(await rodar(env)).toEqual({ triggered: 0, ended: 1 });
  });

  it('sem schedules: não faz nada', async () => {
    expect(await rodar(ambiente())).toEqual({ triggered: 0, ended: 0 });
  });
});
