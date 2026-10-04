'use strict';

/**
 * Handlers do Billing para as respostas do Ledger ao pedido de estorno
 * (etapa 2 do estorno em duas etapas): RefundAccepted e RefundRejected.
 * Mesmo padrão dos outros testes: fakes em memória, estado final e ordem save -> publish.
 */

const { PaymentIntent, PaymentStatus } = require('../../../src/billing/domain/aggregates');
const { GatewayResultVO } = require('../../../src/billing/domain/value-objects');
const { OnRefundAccepted, OnRefundRejected } = require('../../../src/billing/application/handlers');
const { PaymentIntentNotFoundError } = require('../../../src/billing/application/use-cases');

function makeCalls() { return []; }

function fakeIntentRepo(calls, intents = []) {
  const store = new Map(intents.map((i) => [i.paymentIntentId, i]));
  return {
    async findById(id) { return store.get(id) ?? null; },
    async save(intent) { calls.push('save'); store.set(intent.paymentIntentId, intent); },
  };
}

function fakeEventBus(calls) {
  const published = [];
  return {
    published,
    types: () => published.map((e) => e.type),
    async publish(event) { calls.push(`publish:${event.type}`); published.push(event); },
  };
}

function refundRequestedIntent() {
  const intent = PaymentIntent.initiate({ userId: 'u-1', packId: 'STARTER' });
  intent.confirm(new GatewayResultVO({ gatewayTransactionId: 'gw-1', status: 'succeeded' }));
  intent.requestRefund();
  intent.pullDomainEvents();
  return intent;
}

describe('OnRefundAccepted', () => {
  it('conclui o estorno: REFUNDED, salva e publica CreditsRefunded (nessa ordem)', async () => {
    const calls = makeCalls();
    const intent = refundRequestedIntent();
    const bus = fakeEventBus(calls);

    await new OnRefundAccepted(fakeIntentRepo(calls, [intent]), bus)
      .handle({ paymentIntentId: intent.paymentIntentId });

    expect(intent.status).toBe(PaymentStatus.REFUNDED);
    expect(bus.types()).toEqual(['CreditsRefunded']);
    expect(calls).toEqual(['save', 'publish:CreditsRefunded']);
  });

  it('evento reentregue: ignora (sem save e sem eventos)', async () => {
    const calls = makeCalls();
    const intent = refundRequestedIntent();
    const bus = fakeEventBus(calls);
    const handler = new OnRefundAccepted(fakeIntentRepo(calls, [intent]), bus);
    await handler.handle({ paymentIntentId: intent.paymentIntentId });
    calls.length = 0;
    bus.published.length = 0;

    await handler.handle({ paymentIntentId: intent.paymentIntentId });

    expect(calls).toEqual([]);
    expect(bus.published).toEqual([]);
  });

  it('PaymentIntent inexistente: lança PaymentIntentNotFoundError', async () => {
    const calls = makeCalls();

    await expect(new OnRefundAccepted(fakeIntentRepo(calls), fakeEventBus(calls)).handle({ paymentIntentId: 'x' }))
      .rejects.toBeInstanceOf(PaymentIntentNotFoundError);
  });
});

describe('OnRefundRejected', () => {
  it('volta para CONFIRMED, salva e publica RefundFailed com o motivo do Ledger', async () => {
    const calls = makeCalls();
    const intent = refundRequestedIntent();
    const bus = fakeEventBus(calls);

    await new OnRefundRejected(fakeIntentRepo(calls, [intent]), bus)
      .handle({ paymentIntentId: intent.paymentIntentId, reason: 'insufficient_balance' });

    expect(intent.status).toBe(PaymentStatus.CONFIRMED);
    expect(bus.published).toMatchObject([{ type: 'RefundFailed', reason: 'insufficient_balance' }]);
    expect(calls).toEqual(['save', 'publish:RefundFailed']);
  });

  it('evento reentregue: ignora (sem save e sem eventos)', async () => {
    const calls = makeCalls();
    const intent = refundRequestedIntent();
    const bus = fakeEventBus(calls);
    const handler = new OnRefundRejected(fakeIntentRepo(calls, [intent]), bus);
    const event = { paymentIntentId: intent.paymentIntentId, reason: 'insufficient_balance' };
    await handler.handle(event);
    calls.length = 0;
    bus.published.length = 0;

    await handler.handle(event);

    expect(calls).toEqual([]);
    expect(bus.published).toEqual([]);
  });

  it('PaymentIntent inexistente: lança PaymentIntentNotFoundError', async () => {
    const calls = makeCalls();

    await expect(new OnRefundRejected(fakeIntentRepo(calls), fakeEventBus(calls))
      .handle({ paymentIntentId: 'x', reason: 'r' })).rejects.toBeInstanceOf(PaymentIntentNotFoundError);
  });
});
