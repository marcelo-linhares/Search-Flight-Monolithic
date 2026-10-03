'use strict';

/**
 * Testes unitários dos use cases de aplicação (Billing).
 *
 * Padrão:
 *  - O handler é um "orquestrador": busca o agregado (repo), chama UM método de
 *    domínio, salva e publica os eventos. A regra de negócio já é testada nos
 *    testes do agregado; aqui testamos a ORQUESTRAÇÃO.
 *  - Portas (repositório e event bus) são substituídas por fakes em memória.
 *    Fake > jest.fn() com mockResolvedValue: o teste verifica o ESTADO final
 *    (o que ficou salvo, o que foi publicado), não detalhes de chamada.
 *  - Um `calls` compartilhado registra a ORDEM (save antes de publish).
 *  - Contextos só conversam por eventos: o input do handler é um evento
 *    (objeto simples) e o output são eventos publicados no bus.
 *  - `it.todo` = backlog de TDD.
 */

const { PaymentIntent, PaymentStatus } = require('../../../src/billing/domain/aggregates');
const { GatewayResultVO } = require('../../../src/billing/domain/value-objects');
const {
  InitiatePaymentUseCase,
  ConfirmPaymentUseCase,
  RefundPaymentUseCase,
  ListUserPayments,
  PaymentIntentNotFoundError,
} = require('../../../src/billing/application/use-cases');

// ── Fakes (portas em memória) ─────────────────

function makeCalls() { return []; }

function fakeIntentRepo(calls, intents = []) {
  const store = new Map(intents.map((i) => [i.paymentIntentId, i]));
  return {
    store,
    async findById(id) { return store.get(id) ?? null; },
    async findByUserId(userId) { return [...store.values()].filter((i) => i.userId === userId); },
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

// ── Builders de estado ────────────────────────

function pendingIntent(packId = 'STARTER', userId = 'u-1') {
  return PaymentIntent.initiate({ userId, packId });
}

// ─────────────────────────────────────────────
describe('ConfirmPaymentUseCase', () => {
  const webhook = (over = {}) => ({
    paymentIntentId: undefined, // preenchido em cada teste
    gatewayTransactionId: 'gw-1',
    gatewayStatus: 'succeeded',
    ...over,
  });

  it('gateway "succeeded": confirma, salva e publica PaymentConfirmed e CreditsPurchased', async () => {
    const calls = makeCalls();
    const intent = pendingIntent('STARTER');
    const repo = fakeIntentRepo(calls, [intent]);
    const bus = fakeEventBus(calls);

    await new ConfirmPaymentUseCase(repo, bus).execute(
      webhook({ paymentIntentId: intent.paymentIntentId }),
    );

    expect((await repo.findById(intent.paymentIntentId)).status).toBe(PaymentStatus.CONFIRMED);
    expect(bus.types()).toEqual(['PaymentConfirmed', 'CreditsPurchased']);
    expect(bus.published[1]).toMatchObject({
      userId: 'u-1', packId: 'STARTER', credits: 50, paymentIntentId: intent.paymentIntentId,
    });
  });

  it('gateway "failed": marca FAILED e publica PaymentFailed com o motivo', async () => {
    const calls = makeCalls();
    const intent = pendingIntent('STARTER');
    const repo = fakeIntentRepo(calls, [intent]);
    const bus = fakeEventBus(calls);

    await new ConfirmPaymentUseCase(repo, bus).execute(
      webhook({ paymentIntentId: intent.paymentIntentId, gatewayStatus: 'failed' }),
    );

    expect((await repo.findById(intent.paymentIntentId)).status).toBe(PaymentStatus.FAILED);
    expect(bus.types()).toEqual(['PaymentFailed']);
    expect(bus.published[0].reason).toBe('Gateway status: failed');
  });

  it('PaymentIntent inexistente: lança erro e não salva nem publica', async () => {
    const calls = makeCalls();
    const bus = fakeEventBus(calls);

    await expect(
      new ConfirmPaymentUseCase(fakeIntentRepo(calls), bus)
        .execute(webhook({ paymentIntentId: 'nao-existe' })),
    ).rejects.toThrow('PaymentIntent "nao-existe" not found');

    expect(calls).toEqual([]);
  });

  it('webhook sem gatewayTransactionId: rejeita antes de alterar qualquer coisa', async () => {
    const calls = makeCalls();
    const intent = pendingIntent('STARTER');
    const bus = fakeEventBus(calls);

    await expect(
      new ConfirmPaymentUseCase(fakeIntentRepo(calls, [intent]), bus).execute(
        webhook({ paymentIntentId: intent.paymentIntentId, gatewayTransactionId: undefined }),
      ),
    ).rejects.toThrow(/gatewayTransactionId required/);

    expect(intent.status).toBe(PaymentStatus.PENDING);
    expect(calls).toEqual([]);
  });

  it('webhook duplicado: segunda confirmação lança erro e não publica de novo', async () => {
    const calls = makeCalls();
    const intent = pendingIntent('STARTER');
    const repo = fakeIntentRepo(calls, [intent]);
    const bus = fakeEventBus(calls);
    const useCase = new ConfirmPaymentUseCase(repo, bus);
    const input = webhook({ paymentIntentId: intent.paymentIntentId });
    await useCase.execute(input);

    await expect(useCase.execute(input)).rejects.toThrow(/cannot confirm from status "CONFIRMED"/);

    expect(bus.types()).toEqual(['PaymentConfirmed', 'CreditsPurchased']); // só os da 1ª vez
  });

  it('salva o agregado ANTES de publicar eventos', async () => {
    const calls = makeCalls();
    const intent = pendingIntent('STARTER');
    const bus = fakeEventBus(calls);

    await new ConfirmPaymentUseCase(fakeIntentRepo(calls, [intent]), bus).execute(
      webhook({ paymentIntentId: intent.paymentIntentId }),
    );

    expect(calls).toEqual(['save', 'publish:PaymentConfirmed', 'publish:CreditsPurchased']);
  });

  // DECISÃO DE DOMÍNIO: qualquer status diferente de "succeeded" (inclusive
  // "pending") cai no ramo else e marca o pagamento como FAILED. Um webhook
  // "pending" deveria manter o PaymentIntent PENDING.
  it.todo('gatewayStatus "pending" mantém o PaymentIntent PENDING (não falha)');
  // Gateways reenviam webhooks. Lançar erro no duplicado pode gerar retries
  // infinitos; o comum é responder OK e ignorar.
  it.todo('webhook duplicado é idempotente (ignora em vez de lançar erro)');
});

// ─────────────────────────────────────────────
describe('InitiatePaymentUseCase', () => {
  it('cria um PaymentIntent PENDING, salva e devolve os dados do checkout', async () => {
    const calls = makeCalls();
    const repo = fakeIntentRepo(calls);
    const bus = fakeEventBus(calls);

    const checkout = await new InitiatePaymentUseCase(repo, bus).execute({ userId: 'u-1', packId: 'EXPLORER' });

    expect(checkout).toMatchObject({
      packId: 'EXPLORER', credits: 200, amount: 29.9, currency: 'BRL', status: PaymentStatus.PENDING,
    });
    const saved = await repo.findById(checkout.paymentIntentId);
    expect(saved).toMatchObject({ userId: 'u-1', status: PaymentStatus.PENDING });
  });

  it('não publica evento: o gateway ainda não respondeu', async () => {
    const calls = makeCalls();
    const bus = fakeEventBus(calls);

    await new InitiatePaymentUseCase(fakeIntentRepo(calls), bus).execute({ userId: 'u-1', packId: 'STARTER' });

    expect(bus.published).toEqual([]);
  });

  it('pacote desconhecido: lança erro e não salva', async () => {
    const calls = makeCalls();

    await expect(
      new InitiatePaymentUseCase(fakeIntentRepo(calls), fakeEventBus(calls)).execute({ userId: 'u-1', packId: 'GOLD' }),
    ).rejects.toThrow(/unknown pack id "GOLD"/);

    expect(calls).toEqual([]);
  });
});

// ─────────────────────────────────────────────
describe('RefundPaymentUseCase', () => {
  function confirmedIntent() {
    const intent = pendingIntent('STARTER');
    intent.confirm(new GatewayResultVO({ gatewayTransactionId: 'gw-1', status: 'succeeded' }));
    intent.pullDomainEvents();
    return intent;
  }

  it('estorna pagamento confirmado: REFUNDED e publica CreditsRefunded com os créditos do pacote', async () => {
    const calls = makeCalls();
    const intent = confirmedIntent();
    const repo = fakeIntentRepo(calls, [intent]);
    const bus = fakeEventBus(calls);

    await new RefundPaymentUseCase(repo, bus).execute({ paymentIntentId: intent.paymentIntentId });

    expect((await repo.findById(intent.paymentIntentId)).status).toBe(PaymentStatus.REFUNDED);
    expect(bus.types()).toEqual(['CreditsRefunded']);
    expect(bus.published[0]).toMatchObject({ userId: 'u-1', credits: 50, paymentIntentId: intent.paymentIntentId });
    expect(calls).toEqual(['save', 'publish:CreditsRefunded']);
  });

  it('pagamento PENDING não pode ser estornado', async () => {
    const calls = makeCalls();
    const intent = pendingIntent();
    const bus = fakeEventBus(calls);

    await expect(
      new RefundPaymentUseCase(fakeIntentRepo(calls, [intent]), bus).execute({ paymentIntentId: intent.paymentIntentId }),
    ).rejects.toThrow(/cannot refund from status "PENDING"/);

    expect(bus.published).toEqual([]);
  });

  it('PaymentIntent inexistente: lança PaymentIntentNotFoundError', async () => {
    const calls = makeCalls();

    await expect(
      new RefundPaymentUseCase(fakeIntentRepo(calls), fakeEventBus(calls)).execute({ paymentIntentId: 'x' }),
    ).rejects.toBeInstanceOf(PaymentIntentNotFoundError);
  });
});

// ─────────────────────────────────────────────
describe('ListUserPayments', () => {
  it('lista só os pagamentos do usuário, do mais novo para o mais antigo', async () => {
    const calls = makeCalls();
    const old = pendingIntent('STARTER', 'u-1');
    old.createdAt = '2026-01-01T00:00:00.000Z';
    const recent = pendingIntent('EXPLORER', 'u-1');
    recent.createdAt = '2026-02-01T00:00:00.000Z';
    const other = pendingIntent('STARTER', 'u-2');
    const repo = fakeIntentRepo(calls, [old, recent, other]);

    const list = await new ListUserPayments(repo).execute({ userId: 'u-1' });

    expect(list.map((p) => p.packId)).toEqual(['EXPLORER', 'STARTER']);
    expect(list[0]).toMatchObject({ credits: 200, amount: 29.9, currency: 'BRL', status: PaymentStatus.PENDING });
  });

  it('usuário sem pagamentos: lista vazia', async () => {
    expect(await new ListUserPayments(fakeIntentRepo(makeCalls())).execute({ userId: 'u-1' })).toEqual([]);
  });
});
