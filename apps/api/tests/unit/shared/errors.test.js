'use strict';

const {
  DomainError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} = require('../../../src/shared/errors');

describe('erros de domínio compartilhados', () => {
  it.each([
    [ValidationError, 400, 'VALIDATION_ERROR'],
    [ForbiddenError,  403, 'FORBIDDEN'],
    [NotFoundError,   404, 'NOT_FOUND'],
    [ConflictError,   409, 'CONFLICT'],
  ])('%p mapeia para HTTP %i com código %s', (ErrorClass, status, code) => {
    const err = new ErrorClass('mensagem');

    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
    expect(err.httpStatus).toBe(status);
    expect(err.code).toBe(code);
    expect(err.message).toBe('mensagem');
    expect(err.name).toBe(ErrorClass.name);
  });
});

describe('erros de Billing e Ledger usam a hierarquia compartilhada', () => {
  const { PaymentIntentNotFoundError } = require('../../../src/billing/application/use-cases');
  const { LedgerNotFoundError } = require('../../../src/ledger/application/queries');
  const { PackDefinitionVO, PaymentAmountVO, GatewayResultVO } = require('../../../src/billing/domain/value-objects');
  const { PaymentIntent } = require('../../../src/billing/domain/aggregates');

  it('PaymentIntentNotFoundError e LedgerNotFoundError são NotFoundError (404)', () => {
    expect(new PaymentIntentNotFoundError('x')).toBeInstanceOf(NotFoundError);
    expect(new LedgerNotFoundError('u-1')).toBeInstanceOf(NotFoundError);
  });

  it('pacote desconhecido, valor inválido e gateway sem id são ValidationError (400)', () => {
    expect(() => PackDefinitionVO.fromId('GOLD')).toThrow(ValidationError);
    expect(() => new PaymentAmountVO(-1, 'BRL')).toThrow(ValidationError);
    expect(() => new GatewayResultVO({ status: 'succeeded' })).toThrow(ValidationError);
  });

  it('transição inválida de PaymentIntent é ConflictError (409)', () => {
    const intent = PaymentIntent.initiate({ userId: 'u-1', packId: 'STARTER' });

    expect(() => intent.requestRefund()).toThrow(ConflictError);
  });
});
