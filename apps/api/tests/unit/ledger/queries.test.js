'use strict';

const { CreditLedger } = require('../../../src/ledger/domain/aggregates');
const { InMemoryLedgerRepository } = require('../../../src/ledger/infrastructure/in-memory-ledger-repository');
const { GetCreditBalance, GetLedgerHistory, LedgerNotFoundError } = require('../../../src/ledger/application/queries');

async function repoWith(ledger) {
  const repo = new InMemoryLedgerRepository();
  await repo.save(ledger);
  return repo;
}

describe('GetCreditBalance', () => {
  it('devolve saldo disponível e status do ledger (fonte única do saldo)', async () => {
    const repo = await repoWith(CreditLedger.openForUser('u-1', 10));

    expect(await new GetCreditBalance(repo).execute({ userId: 'u-1' }))
      .toEqual({ userId: 'u-1', available: 10, status: 'ACTIVE' });
  });

  it('ledger esgotado aparece como SUSPENDED com saldo 0', async () => {
    const ledger = CreditLedger.openForUser('u-1', 1);
    ledger.debitForSearch({ watchRequestId: 'w-1', snapshotId: 's-1' });
    const repo = await repoWith(ledger);

    expect(await new GetCreditBalance(repo).execute({ userId: 'u-1' }))
      .toEqual({ userId: 'u-1', available: 0, status: 'SUSPENDED' });
  });

  it('usuário sem ledger: lança LedgerNotFoundError', async () => {
    await expect(new GetCreditBalance(new InMemoryLedgerRepository()).execute({ userId: 'u-9' }))
      .rejects.toBeInstanceOf(LedgerNotFoundError);
  });
});

describe('GetLedgerHistory', () => {
  it('lista os lançamentos do mais novo para o mais antigo, como dados simples', async () => {
    const ledger = CreditLedger.openForUser('u-1', 10);
    ledger.debitForSearch({ watchRequestId: 'w-1', snapshotId: 's-1' });
    ledger.creditFromPurchase({ credits: 50, paymentIntentId: 'pi-1', packId: 'STARTER' });
    const repo = await repoWith(ledger);

    const history = await new GetLedgerHistory(repo).execute({ userId: 'u-1' });

    expect(history.map((e) => [e.type, e.amount])).toEqual([
      ['CREDIT_PURCHASE', 50],
      ['SEARCH_DEBIT', -1],
      ['CREDIT_GIFT', 10],
    ]);
    expect(history[0]).toMatchObject({ referenceId: 'pi-1', description: 'Purchased pack STARTER' });
  });

  it('usuário sem ledger: lança LedgerNotFoundError', async () => {
    await expect(new GetLedgerHistory(new InMemoryLedgerRepository()).execute({ userId: 'u-9' }))
      .rejects.toThrow('Ledger for user "u-9" not found');
  });
});
