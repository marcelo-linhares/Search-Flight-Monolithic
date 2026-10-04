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

  // ── Estorno em duas etapas (out/2026) ──
  //  Billing pede (REFUND_REQUESTED) -> Ledger aceita ou rejeita -> Billing conclui
  //  (REFUNDED) ou volta para CONFIRMED. Billing nunca marca REFUNDED sozinho.
  const confirmado = () => {
    const intent = novo();
    intent.confirm(ok());
    intent.pullDomainEvents();
    return intent;
  };
  const solicitado = () => {
    const intent = confirmado();
    intent.requestRefund();
    intent.pullDomainEvents();
    return intent;
  };

  describe('requestRefund()', () => {
    it('a partir de CONFIRMED muda para REFUND_REQUESTED e emite RefundRequested com os créditos do pacote', () => {
      const intent = confirmado();

      intent.requestRefund();

      expect(intent.status).toBe(PaymentStatus.REFUND_REQUESTED);
      expect(intent.pullDomainEvents()).toMatchObject([
        { type: 'RefundRequested', userId: 'u-1', paymentIntentId: intent.paymentIntentId, credits: 50 },
      ]);
    });

    it.each(['PENDING', 'REFUND_REQUESTED', 'REFUNDED'])('não é permitido a partir de %s (ConflictError)', (status) => {
      const intent = novo();
      intent.status = status;

      expect(() => intent.requestRefund()).toThrow(/cannot request a refund from status/);
    });
  });

  describe('completeRefund()', () => {
    it('a partir de REFUND_REQUESTED muda para REFUNDED e emite CreditsRefunded', () => {
      const intent = solicitado();

      expect(intent.completeRefund()).toBe(true);

      expect(intent.status).toBe(PaymentStatus.REFUNDED);
      expect(intent.pullDomainEvents().map((e) => [e.type, e.credits])).toEqual([['CreditsRefunded', 50]]);
    });

    it('repetido (já REFUNDED): devolve false e não emite nada', () => {
      const intent = solicitado();
      intent.completeRefund();
      intent.pullDomainEvents();

      expect(intent.completeRefund()).toBe(false);
      expect(intent.pullDomainEvents()).toEqual([]);
    });

    it('sem pedido de estorno (CONFIRMED): ConflictError', () => {
      expect(() => confirmado().completeRefund()).toThrow(/cannot complete a refund from status "CONFIRMED"/);
    });
  });

  describe('rejectRefund()', () => {
    it('a partir de REFUND_REQUESTED volta para CONFIRMED e emite RefundFailed com o motivo', () => {
      const intent = solicitado();

      expect(intent.rejectRefund('insufficient_balance')).toBe(true);

      expect(intent.status).toBe(PaymentStatus.CONFIRMED);
      expect(intent.pullDomainEvents()).toMatchObject([
        { type: 'RefundFailed', userId: 'u-1', reason: 'insufficient_balance' },
      ]);
    });

    it('repetido (já CONFIRMED): devolve false e não emite nada', () => {
      const intent = confirmado();

      expect(intent.rejectRefund('insufficient_balance')).toBe(false);
      expect(intent.pullDomainEvents()).toEqual([]);
    });

    it('depois de REFUNDED: ConflictError (o estorno já foi concluído)', () => {
      const intent = solicitado();
      intent.completeRefund();

      expect(() => intent.rejectRefund('x')).toThrow(/cannot reject a refund from status "REFUNDED"/);
    });
  });

  it('um estorno rejeitado pode ser pedido de novo (saldo pode ter subido)', () => {
    const intent = solicitado();
    intent.rejectRefund('insufficient_balance');
    intent.pullDomainEvents();

    intent.requestRefund();

    expect(intent.status).toBe(PaymentStatus.REFUND_REQUESTED);
  });

  it('hasSettledWith: "succeeded" já está aplicado em CONFIRMED, REFUND_REQUESTED e REFUNDED', () => {
    [PaymentStatus.CONFIRMED, PaymentStatus.REFUND_REQUESTED, PaymentStatus.REFUNDED].forEach((status) => {
      const intent = novo();
      intent.status = status;

      expect(intent.hasSettledWith(ok())).toBe(true);
    });
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
