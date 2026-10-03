'use strict';

const { InProcessEventBus } = require('../../../src/shared/in-process-event-bus');

describe('InProcessEventBus', () => {
  it('entrega o evento aos assinantes do tipo, na ordem de assinatura', async () => {
    const bus = new InProcessEventBus();
    const order = [];
    bus.subscribe('A', async () => { order.push('h1'); });
    bus.subscribe('A', async () => { order.push('h2'); });

    await bus.publish({ type: 'A' });

    expect(order).toEqual(['h1', 'h2']);
  });

  it('não entrega a assinantes de outro tipo', async () => {
    const bus = new InProcessEventBus();
    const other = jest.fn();
    bus.subscribe('B', other);

    await bus.publish({ type: 'A' });

    expect(other).not.toHaveBeenCalled();
  });

  it('publicar sem assinantes não falha', async () => {
    await expect(new InProcessEventBus().publish({ type: 'A' })).resolves.toBeUndefined();
  });

  it('espera cada handler assíncrono terminar antes do próximo', async () => {
    const bus = new InProcessEventBus();
    const order = [];
    bus.subscribe('A', () => new Promise((r) => setTimeout(() => { order.push('lento'); r(); }, 10)));
    bus.subscribe('A', async () => { order.push('rapido'); });

    await bus.publish({ type: 'A' });

    expect(order).toEqual(['lento', 'rapido']);
  });

  it('handler que falha não impede os demais; publish rejeita com AggregateError', async () => {
    const bus = new InProcessEventBus();
    const second = jest.fn();
    bus.subscribe('A', () => { throw new Error('boom'); });
    bus.subscribe('A', second);

    const promise = bus.publish({ type: 'A' });

    await expect(promise).rejects.toBeInstanceOf(AggregateError);
    await promise.catch((e) => expect(e.errors[0].message).toBe('boom'));
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('subscribe devolve uma função que cancela a assinatura', async () => {
    const bus = new InProcessEventBus();
    const handler = jest.fn();
    const unsubscribe = bus.subscribe('A', handler);

    unsubscribe();
    await bus.publish({ type: 'A' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('rejeita handler que não é função e evento sem type', async () => {
    const bus = new InProcessEventBus();

    expect(() => bus.subscribe('A', 'nope')).toThrow(/must be a function/);
    await expect(bus.publish({})).rejects.toThrow(/string "type"/);
    await expect(bus.publish(null)).rejects.toThrow(/string "type"/);
  });

  it('onPublish observa todo evento publicado', async () => {
    const seen = [];
    const bus = new InProcessEventBus({ onPublish: (e) => seen.push(e.type) });

    await bus.publish({ type: 'A' });
    await bus.publish({ type: 'B' });

    expect(seen).toEqual(['A', 'B']);
  });
});
