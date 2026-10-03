'use strict';

const { CreditLedger } = require('../../../src/ledger/domain/aggregates');
const { InMemoryLedgerRepository } = require('../../../src/ledger/infrastructure/in-memory-ledger-repository');

describe('InMemoryLedgerRepository', () => {
  it('findByUserId devolve null quando não existe', async () => {
    expect(await new InMemoryLedgerRepository().findByUserId('u-1')).toBeNull();
  });

  it('save + find preserva id, saldo, status e lançamentos', async () => {
    const repo = new InMemoryLedgerRepository();
    const ledger = CreditLedger.openForUser('u-1', 1);
    ledger.debitForSearch({ watchRequestId: 'w-1', snapshotId: 's-1' });

    await repo.save(ledger);
    const loaded = await repo.findByUserId('u-1');

    expect(loaded.ledgerId).toBe(ledger.ledgerId);
    expect(loaded.status).toBe('SUSPENDED');
    expect(loaded.entries).toHaveLength(2);
    expect(loaded.computeBalance().available).toBe(0);
  });

  it('devolve instância NOVA a cada leitura (alterar sem save não persiste)', async () => {
    const repo = new InMemoryLedgerRepository();
    await repo.save(CreditLedger.openForUser('u-1', 10));

    const a = await repo.findByUserId('u-1');
    a.creditFromPurchase({ credits: 50, paymentIntentId: 'pi-1', packId: 'STARTER' });
    const b = await repo.findByUserId('u-1');

    expect(b).not.toBe(a);
    expect(b.computeBalance().available).toBe(10);
  });

  it('não persiste eventos de domínio pendentes', async () => {
    const repo = new InMemoryLedgerRepository();
    await repo.save(CreditLedger.openForUser('u-1', 10)); // tem GiftCreditsGranted pendente

    expect((await repo.findByUserId('u-1')).pullDomainEvents()).toEqual([]);
  });
});
