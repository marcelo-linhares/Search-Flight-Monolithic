const { PaymentIntent, PaymentStatus } = require('../../../src/billing/domain/aggregates');
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