'use strict';

const { PaymentIntent, PaymentStatus } = require('../../../src/billing/domain/aggregates');
const { GatewayResultVO } = require('../../../src/billing/domain/value-objects');
const { InMemoryPaymentIntentRepository } = require('../../../src/billing/infrastructure/in-memory-payment-intent-repository');

describe('InMemoryPaymentIntentRepository', () => {
  it('findById devolve null quando não existe', async () => {
    expect(await new InMemoryPaymentIntentRepository().findById('x')).toBeNull();
  });

  it('save + find preserva pacote, valor, status e resultado do gateway', async () => {
    const repo = new InMemoryPaymentIntentRepository();
    const intent = PaymentIntent.initiate({ userId: 'u-1', packId: 'STARTER' });
    intent.confirm(new GatewayResultVO({ gatewayTransactionId: 'gw-1', status: 'succeeded' }));

    await repo.save(intent);
    const loaded = await repo.findById(intent.paymentIntentId);

    expect(loaded.status).toBe(PaymentStatus.CONFIRMED);
    expect(loaded.pack.id).toBe('STARTER');
    expect(loaded.amount.amount).toBe(9.9);
    expect(loaded.gatewayResult.gatewayTransactionId).toBe('gw-1');
  });

  it('devolve instância nova e sem eventos pendentes', async () => {
    const repo = new InMemoryPaymentIntentRepository();
    const intent = PaymentIntent.initiate({ userId: 'u-1', packId: 'STARTER' });
    intent.confirm(new GatewayResultVO({ gatewayTransactionId: 'gw-1', status: 'succeeded' }));
    await repo.save(intent);

    const loaded = await repo.findById(intent.paymentIntentId);

    expect(loaded).not.toBe(intent);
    expect(loaded.pullDomainEvents()).toEqual([]);
  });

  it('findByUserId devolve só os pagamentos daquele usuário', async () => {
    const repo = new InMemoryPaymentIntentRepository();
    await repo.save(PaymentIntent.initiate({ userId: 'u-1', packId: 'STARTER' }));
    await repo.save(PaymentIntent.initiate({ userId: 'u-1', packId: 'EXPLORER' }));
    await repo.save(PaymentIntent.initiate({ userId: 'u-2', packId: 'STARTER' }));

    expect(await repo.findByUserId('u-1')).toHaveLength(2);
    expect(await repo.findByUserId('u-3')).toEqual([]);
  });
});
