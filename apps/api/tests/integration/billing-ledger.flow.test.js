'use strict';

/**
 * Teste de integração: Billing + Ledger conectados pelo event bus real
 * (em memória), montados pelo composition root (createApp).
 *
 * Aqui NÃO há fakes dos contextos: só os contextos Search e Identity são
 * simulados, publicando os eventos que eles publicariam (UserRegistered,
 * PriceSnapshotCaptured). O teste prova que os contextos conversam apenas por
 * eventos e que o fluxo de negócio completo funciona.
 */

const { createApp } = require('../../src/app');

const USER = 'u-1';

async function registerUser(app, userId = USER) {
  await app.eventBus.publish({ type: 'UserRegistered', userId });
}

async function searchRuns(app, times, userId = USER) {
  for (let i = 0; i < times; i += 1) {
    await app.eventBus.publish({
      type: 'PriceSnapshotCaptured', userId, watchRequestId: 'w-1', snapshotId: `s-${i}`,
    });
  }
}

async function buy(app, packId, gatewayStatus = 'succeeded', userId = USER) {
  const { paymentIntentId } = await app.billing.initiatePayment.execute({ userId, packId });
  await app.billing.confirmPayment.execute({
    paymentIntentId, gatewayTransactionId: `gw-${paymentIntentId}`, gatewayStatus,
  });
  return paymentIntentId;
}

const balance = (app, userId = USER) => app.ledger.getCreditBalance.execute({ userId });

describe('Billing + Ledger (fluxo completo por eventos)', () => {
  let app;
  let seen;

  beforeEach(() => {
    seen = [];
    app = createApp();
    // Observa tudo que passa pelo bus, na ordem.
    const original = app.eventBus.publish.bind(app.eventBus);
    app.eventBus.publish = async (event) => { seen.push(event.type); return original(event); };
  });

  it('novo usuário recebe 10 créditos de presente', async () => {
    await registerUser(app);

    expect(await balance(app)).toEqual({ userId: USER, available: 10, status: 'ACTIVE' });
    expect(seen).toEqual(['UserRegistered', 'GiftCreditsGranted']);
  });

  it('cada busca debita 1 crédito', async () => {
    await registerUser(app);

    await searchRuns(app, 3);

    expect((await balance(app)).available).toBe(7);
  });

  it('compra confirmada credita o ledger (Billing -> Ledger só por CreditsPurchased)', async () => {
    await registerUser(app);

    await buy(app, 'STARTER');

    expect((await balance(app)).available).toBe(60);
    expect(seen).toEqual(['UserRegistered', 'GiftCreditsGranted', 'PaymentConfirmed', 'CreditsPurchased']);
  });

  it('P0: créditos acabam, ledger suspende; compra reativa com BalanceRestored', async () => {
    await registerUser(app);
    await searchRuns(app, 10);
    expect(await balance(app)).toEqual({ userId: USER, available: 0, status: 'SUSPENDED' });
    expect(seen).toContain('BalanceExhausted');

    await buy(app, 'STARTER');

    expect(await balance(app)).toEqual({ userId: USER, available: 50, status: 'ACTIVE' });
    expect(seen.filter((t) => t === 'BalanceRestored')).toHaveLength(1);
  });

  it('busca com saldo zero não debita nem fica negativo', async () => {
    await registerUser(app);
    await searchRuns(app, 12);

    expect((await balance(app)).available).toBe(0);
  });

  it('pagamento recusado não altera o saldo e publica PaymentFailed', async () => {
    await registerUser(app);

    await buy(app, 'EXPLORER', 'failed');

    expect((await balance(app)).available).toBe(10);
    expect(seen).toContain('PaymentFailed');
    expect(seen).not.toContain('CreditsPurchased');
  });

  it('estorno remove os créditos do pacote', async () => {
    await registerUser(app);
    const paymentIntentId = await buy(app, 'STARTER');

    await app.billing.refundPayment.execute({ paymentIntentId });

    expect((await balance(app)).available).toBe(10);
    expect(seen).toContain('CreditsRefunded');
  });

  it('estorno que zera o saldo suspende o ledger', async () => {
    await registerUser(app);
    await searchRuns(app, 10);
    const paymentIntentId = await buy(app, 'STARTER');

    await app.billing.refundPayment.execute({ paymentIntentId });

    expect(await balance(app)).toEqual({ userId: USER, available: 0, status: 'SUSPENDED' });
  });

  it('histórico do ledger registra presente, débitos e compra; Billing lista o pagamento', async () => {
    await registerUser(app);
    await searchRuns(app, 2);
    await buy(app, 'STARTER');

    const history = await app.ledger.getLedgerHistory.execute({ userId: USER });
    const payments = await app.billing.listUserPayments.execute({ userId: USER });

    expect(history.map((e) => e.type)).toEqual(['CREDIT_PURCHASE', 'SEARCH_DEBIT', 'SEARCH_DEBIT', 'CREDIT_GIFT']);
    expect(payments).toEqual([expect.objectContaining({ packId: 'STARTER', status: 'CONFIRMED' })]);
  });

  it('evento duplicado do bus não credita duas vezes', async () => {
    await registerUser(app);
    const paymentIntentId = await buy(app, 'STARTER');

    await app.eventBus.publish({
      type: 'CreditsPurchased', userId: USER, credits: 50, packId: 'STARTER', paymentIntentId,
    });

    expect((await balance(app)).available).toBe(60);
  });

  it('usuários são independentes', async () => {
    await registerUser(app, 'u-1');
    await registerUser(app, 'u-2');

    await searchRuns(app, 10, 'u-1');
    await buy(app, 'STARTER', 'succeeded', 'u-2');

    expect((await balance(app, 'u-1')).status).toBe('SUSPENDED');
    expect(await balance(app, 'u-2')).toEqual({ userId: 'u-2', available: 60, status: 'ACTIVE' });
  });
});
