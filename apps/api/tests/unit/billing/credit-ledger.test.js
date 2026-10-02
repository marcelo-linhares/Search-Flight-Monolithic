'use strict';

const { CreditLedger, LedgerStatus } = require('../../../src/billing/domain/aggregates');

// ─────────────────────────────────────────────────────────────
//  Como ler/escrever estes testes (padrão do projeto)
//
//  1. Testamos COMPORTAMENTO pela API pública do agregado: saldo, status e
//     eventos de domínio. Nunca campos privados nem detalhes internos.
//  2. Cada teste segue Arrange - Act - Assert e usa um ledger NOVO (sem
//     estado compartilhado entre testes).
//  3. Nome do teste = regra de negócio em uma frase ("quando X, então Y").
//  4. Eventos: conferimos `type` e os campos de negócio. Nunca eventId nem
//     occurredAt (são aleatórios/temporais).
//  5. TDD: escreva primeiro o `it.todo`, depois transforme em teste (RED),
//     faça passar (GREEN) e só então refatore.
// ─────────────────────────────────────────────────────────────

// Builder: ledger já com N créditos e SEM eventos pendentes, para que o teste
// olhe só os eventos produzidos pelo ACT.
function ledgerWithCredits(credits, userId = 'u-1') {
  const ledger = CreditLedger.openForUser(userId, credits);
  ledger.pullDomainEvents(); // descarta o GiftCreditsGranted do arrange
  return ledger;
}

// Ledger que acabou de ficar sem saldo (status SUSPENDED) e sem eventos pendentes.
function exhaustedLedger(userId = 'u-1') {
  const ledger = ledgerWithCredits(1, userId);
  ledger.debitForSearch({ watchRequestId: 'w-0', snapshotId: 's-0' });
  ledger.pullDomainEvents();
  return ledger;
}

const typesOf = (events) => events.map((e) => e.type);

describe('CreditLedger', () => {

  describe('openForUser()', () => {
    it('com créditos de presente: saldo igual ao presente, status ACTIVE e evento GiftCreditsGranted', () => {
      const ledger = CreditLedger.openForUser('u-1', 10);

      expect(ledger.computeBalance().available).toBe(10);
      expect(ledger.status).toBe(LedgerStatus.ACTIVE);
      expect(ledger.pullDomainEvents()).toMatchObject([
        { type: 'GiftCreditsGranted', userId: 'u-1', credits: 10 },
      ]);
    });

    it('sem créditos de presente: saldo zero e nenhum evento', () => {
      const ledger = CreditLedger.openForUser('u-1', 0);

      expect(ledger.computeBalance().available).toBe(0);
      expect(ledger.pullDomainEvents()).toEqual([]);
    });
  });

  describe('debitForSearch()', () => {
    it('debita 1 crédito e emite SearchCreditDebited com o saldo restante', () => {
      const ledger = ledgerWithCredits(3);

      const debited = ledger.debitForSearch({ watchRequestId: 'w-1', snapshotId: 's-1' });

      expect(debited).toBe(true);
      expect(ledger.computeBalance().available).toBe(2);
      expect(ledger.status).toBe(LedgerStatus.ACTIVE);
      expect(ledger.pullDomainEvents()).toMatchObject([
        { type: 'SearchCreditDebited', watchRequestId: 'w-1', snapshotId: 's-1', creditsRemaining: 2 },
      ]);
    });

    it('quando o débito zera o saldo: status SUSPENDED e BalanceExhausted logo após o débito', () => {
      const ledger = ledgerWithCredits(1);

      ledger.debitForSearch({ watchRequestId: 'w-1', snapshotId: 's-1' });

      expect(ledger.computeBalance().available).toBe(0);
      expect(ledger.status).toBe(LedgerStatus.SUSPENDED);
      expect(typesOf(ledger.pullDomainEvents())).toEqual(['SearchCreditDebited', 'BalanceExhausted']);
    });

    it('sem saldo: devolve false, não cria lançamento e não emite evento', () => {
      const ledger = exhaustedLedger();
      const entriesBefore = ledger.entries.length;

      const debited = ledger.debitForSearch({ watchRequestId: 'w-2', snapshotId: 's-2' });

      expect(debited).toBe(false);
      expect(ledger.entries).toHaveLength(entriesBefore);
      expect(ledger.pullDomainEvents()).toEqual([]);
    });
  });

  describe('creditFromPurchase()', () => {
    it('soma os créditos do pacote ao saldo', () => {
      const ledger = ledgerWithCredits(5);

      ledger.creditFromPurchase({ credits: 50, paymentIntentId: 'pi-1', packId: 'STARTER' });

      expect(ledger.computeBalance().available).toBe(55);
    });

    it('se estava SUSPENDED: volta a ACTIVE e emite BalanceRestored com o novo saldo', () => {
      const ledger = exhaustedLedger();

      ledger.creditFromPurchase({ credits: 50, paymentIntentId: 'pi-1', packId: 'STARTER' });

      expect(ledger.status).toBe(LedgerStatus.ACTIVE);
      expect(ledger.pullDomainEvents()).toMatchObject([
        { type: 'BalanceRestored', userId: 'u-1', newBalance: 50 },
      ]);
    });

    it('se já estava ACTIVE: não emite BalanceRestored', () => {
      const ledger = ledgerWithCredits(5);

      ledger.creditFromPurchase({ credits: 50, paymentIntentId: 'pi-1', packId: 'STARTER' });

      expect(ledger.pullDomainEvents()).toEqual([]);
    });
  });

  describe('creditFromRefund()', () => {
    it('remove do saldo os créditos devolvidos', () => {
      const ledger = ledgerWithCredits(60);

      ledger.creditFromRefund({ credits: 50, paymentIntentId: 'pi-1' });

      expect(ledger.computeBalance().available).toBe(10);
      expect(ledger.status).toBe(LedgerStatus.ACTIVE);
    });

    it('se o estorno zera o saldo: status SUSPENDED e BalanceExhausted', () => {
      const ledger = ledgerWithCredits(50);

      ledger.creditFromRefund({ credits: 50, paymentIntentId: 'pi-1' });

      expect(ledger.status).toBe(LedgerStatus.SUSPENDED);
      expect(typesOf(ledger.pullDomainEvents())).toEqual(['BalanceExhausted']);
    });
  });

  describe('pullDomainEvents()', () => {
    it('entrega os eventos uma única vez: a segunda chamada devolve lista vazia', () => {
      const ledger = CreditLedger.openForUser('u-1', 10);

      expect(ledger.pullDomainEvents()).toHaveLength(1);
      expect(ledger.pullDomainEvents()).toEqual([]);
    });
  });

  // ── Backlog de TDD: transforme cada todo em teste (RED), faça passar (GREEN) ──
  describe('próximos testes (a escrever)', () => {
    it.todo('creditsPerSearch maior que 1 debita essa quantidade por busca');
    it.todo('estorno quando o ledger já está SUSPENDED não emite um segundo BalanceExhausted');
    it.todo('computeBalance soma presente + compras - débitos - estornos (cenário completo)');
    it.todo('LedgerEntry é imutável e o histórico só cresce (append-only)');
    it.todo('DECISÃO DE DOMÍNIO: estorno maior que o saldo hoje é truncado em 0 (computeBalance usa Math.max); registrar a dívida?');
    it.todo('ledger aberto com 0 crédito já nasce ACTIVE com saldo 0: o primeiro débito devolve false');
  });
});
