const { PaymentIntent, PaymentStatus, CreditPack } = require('../../../src/billing/domain/aggregates');
const { GatewayResultVO } = require('../../../src/billing/domain/value-objects');

describe('PaymentIntent', () => {

  // RED → escrever este teste ANTES de implementar confirm()
  describe('confirm()', () => {
    it('muda status para CONFIRMED e emite CreditsPurchased', () => {
      const intent = PaymentIntent.initiate({ userId: 'u-1', packId: 'STARTER' });
      const result = new GatewayResultVO({ gatewayTransactionId: 'gw-1', status: 'succeeded' });

      intent.confirm(result);

      expect(intent.status).toBe(PaymentStatus.CONFIRMED);
      const events = intent.pullDomainEvents();
      expect(events).toHaveLength(2);
      expect(events[1].type).toBe('CreditsPurchased');
      expect(events[1].credits).toBe(50); // pack STARTER
    });

    it('lança erro se já estava CONFIRMED (idempotência)', () => {
      const intent = PaymentIntent.initiate({ userId: 'u-1', packId: 'STARTER' });
      const result = new GatewayResultVO({ gatewayTransactionId: 'gw-1', status: 'succeeded' });
      intent.confirm(result);

      expect(() => intent.confirm(result)).toThrow('cannot confirm from status');
    });
  });
});
// ── Complementos: regras de guarda, fail(), refund() e CreditPack ──────────
describe('PaymentIntent (regras adicionais)', () => {
  const ok   = () => new GatewayResultVO({ gatewayTransactionId: 'gw-1', status: 'succeeded' });
  const nope = () => new GatewayResultVO({ gatewayTransactionId: 'gw-1', status: 'failed' });
  const novo = () => PaymentIntent.initiate({ userId: 'u-1', packId: 'STARTER' });

  it('initiate cria PENDING com valor do pacote e não emite eventos', () => {
    const intent = novo();

    expect(intent.status).toBe(PaymentStatus.PENDING);
    expect(intent.amount).toMatchObject({ amount: 9.9, currency: 'BRL' });
    expect(intent.pullDomainEvents()).toEqual([]);
  });

  it('confirm exige um GatewayResultVO', () => {
    expect(() => novo().confirm({ status: 'succeeded' })).toThrow('expected GatewayResultVO');
  });

  it('confirm rejeita resultado de gateway que não é "succeeded"', () => {
    expect(() => novo().confirm(nope())).toThrow('gateway result is not succeeded');
  });

  it('fail muda para FAILED, guarda o resultado e emite PaymentFailed com o motivo', () => {
    const intent = novo();

    intent.fail(nope(), 'card declined');

    expect(intent.status).toBe(PaymentStatus.FAILED);
    expect(intent.gatewayResult.isFailed()).toBe(true);
    expect(intent.pullDomainEvents().map((e) => [e.type, e.reason])).toEqual([['PaymentFailed', 'card declined']]);
  });

  it('fail só é permitido a partir de PENDING', () => {
    const intent = novo();
    intent.confirm(ok());

    expect(() => intent.fail(nope(), 'x')).toThrow('cannot fail from status "CONFIRMED"');
  });

  it('refund a partir de CONFIRMED muda para REFUNDED e emite CreditsRefunded com os créditos do pacote', () => {
    const intent = novo();
    intent.confirm(ok());
    intent.pullDomainEvents();

    intent.refund();

    expect(intent.status).toBe(PaymentStatus.REFUNDED);
    expect(intent.pullDomainEvents().map((e) => [e.type, e.credits])).toEqual([['CreditsRefunded', 50]]);
  });

  it('refund só é permitido a partir de CONFIRMED', () => {
    expect(() => novo().refund()).toThrow('cannot refund from status "PENDING"');
  });

  it('pullDomainEvents esvazia a fila', () => {
    const intent = novo();
    intent.confirm(ok());
    intent.pullDomainEvents();

    expect(intent.pullDomainEvents()).toEqual([]);
  });
});

describe('CreditPack', () => {
  it('fromPaymentConfirmed cria o recibo imutável a partir do evento', () => {
    const pack = CreditPack.fromPaymentConfirmed({
      userId: 'u-1', packId: 'STARTER', credits: 50, paymentIntentId: 'pi-1',
    });

    expect(pack).toMatchObject({ userId: 'u-1', packId: 'STARTER', credits: 50, paymentIntentId: 'pi-1' });
    expect(Object.isFrozen(pack)).toBe(true);
  });
});
