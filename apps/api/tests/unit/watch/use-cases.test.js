'use strict';

const { NotFoundError, ConflictError, ValidationError } = require('../../../src/shared/errors');
const {
  CreateWatchUseCase,
  CancelWatchUseCase,
  GetWatchUseCase,
  ListUserWatchesUseCase,
} = require('../../../src/watch/application/use-cases');
const { ambiente, novoPedido } = require('./support');

describe('CreateWatchUseCase', () => {
  it('cria watch ativo, salva e publica WatchCreated', async () => {
    const { watchRepo, creditStatus, bus, clock } = ambiente();

    const dto = await new CreateWatchUseCase(watchRepo, creditStatus, bus, { clock }).execute(novoPedido());

    expect(dto).toMatchObject({ userId: 'u-1', origin: 'GRU', destination: 'LIS', status: 'active', intervalHours: 4 });
    expect((await watchRepo.findById(dto.watchRequestId)).status).toBe('active');
    expect(bus.types()).toEqual(['WatchCreated']);
  });

  it('usuário sem créditos (segundo o Ledger) cria watch já suspenso', async () => {
    const { watchRepo, creditStatus, bus, clock } = ambiente();
    await creditStatus.markExhausted('u-1');

    const dto = await new CreateWatchUseCase(watchRepo, creditStatus, bus, { clock }).execute(novoPedido());

    expect(dto.status).toBe('suspended_credits');
    expect(bus.types()).toEqual(['WatchCreated', 'WatchSuspendedDueToCredits']);
  });

  it('dados inválidos: ValidationError e nada é salvo nem publicado', async () => {
    const { watchRepo, creditStatus, bus, clock } = ambiente();

    await expect(
      new CreateWatchUseCase(watchRepo, creditStatus, bus, { clock }).execute(novoPedido({ origin: 'XX' })),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(bus.published).toEqual([]);
    expect(await watchRepo.findByUserId('u-1')).toEqual([]);
  });
});

describe('CancelWatchUseCase', () => {
  async function comWatch() {
    const env = ambiente();
    const dto = await new CreateWatchUseCase(env.watchRepo, env.creditStatus, env.bus, { clock: env.clock }).execute(novoPedido());
    env.bus.published.length = 0;
    return { ...env, id: dto.watchRequestId };
  }

  it('dono cancela: status cancelled e WatchCancelled publicado', async () => {
    const { watchRepo, bus, id } = await comWatch();

    const dto = await new CancelWatchUseCase(watchRepo, bus).execute({ userId: 'u-1', watchRequestId: id });

    expect(dto.status).toBe('cancelled');
    expect((await watchRepo.findById(id)).status).toBe('cancelled');
    expect(bus.types()).toEqual(['WatchCancelled']);
  });

  it('watch inexistente ou de outro usuário: NotFoundError (não revela que existe)', async () => {
    const { watchRepo, bus, id } = await comWatch();
    const useCase = new CancelWatchUseCase(watchRepo, bus);

    await expect(useCase.execute({ userId: 'u-1', watchRequestId: 'nao-existe' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(useCase.execute({ userId: 'u-2', watchRequestId: id })).rejects.toBeInstanceOf(NotFoundError);
    expect((await watchRepo.findById(id)).status).toBe('active');
  });

  it('cancelar duas vezes: ConflictError', async () => {
    const { watchRepo, bus, id } = await comWatch();
    const useCase = new CancelWatchUseCase(watchRepo, bus);
    await useCase.execute({ userId: 'u-1', watchRequestId: id });

    await expect(useCase.execute({ userId: 'u-1', watchRequestId: id })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('GetWatchUseCase e ListUserWatchesUseCase', () => {
  it('GetWatch devolve o DTO do dono e NotFoundError para os demais', async () => {
    const { watchRepo, creditStatus, bus, clock } = ambiente();
    const { watchRequestId } = await new CreateWatchUseCase(watchRepo, creditStatus, bus, { clock }).execute(novoPedido());
    const get = new GetWatchUseCase(watchRepo);

    expect((await get.execute({ userId: 'u-1', watchRequestId })).origin).toBe('GRU');
    await expect(get.execute({ userId: 'u-2', watchRequestId })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('ListUserWatches lista só os do usuário, como DTOs', async () => {
    const { watchRepo, creditStatus, bus, clock } = ambiente();
    const create = new CreateWatchUseCase(watchRepo, creditStatus, bus, { clock });
    await create.execute(novoPedido());
    await create.execute(novoPedido({ destination: 'MAD' }));
    await create.execute(novoPedido({ userId: 'u-2' }));

    const list = await new ListUserWatchesUseCase(watchRepo).execute({ userId: 'u-1' });

    expect(list).toHaveLength(2);
    expect(list.every((w) => w.userId === 'u-1')).toBe(true);
    expect(await new ListUserWatchesUseCase(watchRepo).execute({ userId: 'u-9' })).toEqual([]);
  });
});
