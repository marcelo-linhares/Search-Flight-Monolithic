'use strict';

/**
 * Testes unitários dos handlers de aplicação (Ledger).
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

const { CreditLedger, LedgerStatus } = require('../../../src/ledger/domain/aggregates');
const {
  OnUserRegistered,
  OnCreditsPurchased,
  OnPriceSnapshotCaptured,
  OnCreditsRefunded,
} = require('../../../src/ledger/application/handlers');

// ── Fakes (portas em memória) ─────────────────

function makeCalls() { return []; }

function fakeLedgerRepo(calls, ledgers = []) {
  const store = new Map(ledgers.map((l) => [l.userId, l]));
  return {
    store,
    async findByUserId(userId) { return store.get(userId) ?? null; },
    async save(ledger) { calls.push('save'); store.set(ledger.userId, ledger); },
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

function ledgerWithCredits(credits, userId = 'u-1') {
  const ledger = CreditLedger.openForUser(userId, credits);
  ledger.pullDomainEvents(); // descarta GiftCreditsGranted do arrange
  return ledger;
}

function exhaustedLedger(userId = 'u-1') {
  const ledger = ledgerWithCredits(1, userId);
  ledger.debitForSearch({ watchRequestId: 'w-0', snapshotId: 's-0' });
  ledger.pullDomainEvents();
  return ledger;
}

// ─────────────────────────────────────────────
describe('OnUserRegistered', () => {
  it('abre o ledger com 10 créditos de presente e publica GiftCreditsGranted', async () => {
    const calls = makeCalls();
    const repo = fakeLedgerRepo(calls);
    const bus = fakeEventBus(calls);

    await new OnUserRegistered(repo, bus).handle({ userId: 'u-1' });

    const ledger = await repo.findByUserId('u-1');
    expect(ledger.computeBalance().available).toBe(10);
    expect(ledger.status).toBe(LedgerStatus.ACTIVE);
    expect(bus.types()).toEqual(['GiftCreditsGranted']);
    expect(bus.published[0]).toMatchObject({ userId: 'u-1', credits: 10 });
  });

  it('o valor do presente é configurável', async () => {
    const calls = makeCalls();
    const repo = fakeLedgerRepo(calls);

    await new OnUserRegistered(repo, fakeEventBus(calls), { giftCredits: 3 }).handle({ userId: 'u-1' });

    expect((await repo.findByUserId('u-1')).computeBalance().available).toBe(3);
  });

  it('é idempotente: segundo UserRegistered não duplica o presente nem publica de novo', async () => {
    const calls = makeCalls();
    const repo = fakeLedgerRepo(calls);
    const bus = fakeEventBus(calls);
    const handler = new OnUserRegistered(repo, bus);
    await handler.handle({ userId: 'u-1' });

    await handler.handle({ userId: 'u-1' });

    expect((await repo.findByUserId('u-1')).computeBalance().available).toBe(10);
    expect(bus.types()).toEqual(['GiftCreditsGranted']);
  });

  it('salva antes de publicar', async () => {
    const calls = makeCalls();

    await new OnUserRegistered(fakeLedgerRepo(calls), fakeEventBus(calls)).handle({ userId: 'u-1' });

    expect(calls).toEqual(['save', 'publish:GiftCreditsGranted']);
  });
});

// ─────────────────────────────────────────────
describe('OnCreditsPurchased', () => {
  it('credita o pacote no ledger do usuário e salva', async () => {
    const calls = makeCalls();
    const repo = fakeLedgerRepo(calls, [ledgerWithCredits(5)]);
    const bus = fakeEventBus(calls);

    await new OnCreditsPurchased(repo, bus).handle({
      userId: 'u-1', credits: 50, paymentIntentId: 'pi-1', packId: 'STARTER',
    });

    expect((await repo.findByUserId('u-1')).computeBalance().available).toBe(55);
    expect(calls).toContain('save');
  });

  it('ledger suspenso volta a ACTIVE e publica BalanceRestored', async () => {
    const calls = makeCalls();
    const repo = fakeLedgerRepo(calls, [exhaustedLedger()]);
    const bus = fakeEventBus(calls);

    await new OnCreditsPurchased(repo, bus).handle({
      userId: 'u-1', credits: 50, paymentIntentId: 'pi-1', packId: 'STARTER',
    });

    expect((await repo.findByUserId('u-1')).status).toBe(LedgerStatus.ACTIVE);
    expect(bus.types()).toEqual(['BalanceRestored']);
    expect(bus.published[0]).toMatchObject({ userId: 'u-1', newBalance: 50 });
  });

  it('ledger ativo: credita sem publicar evento', async () => {
    const calls = makeCalls();
    const bus = fakeEventBus(calls);

    await new OnCreditsPurchased(fakeLedgerRepo(calls, [ledgerWithCredits(5)]), bus).handle({
      userId: 'u-1', credits: 50, paymentIntentId: 'pi-1', packId: 'STARTER',
    });

    expect(bus.published).toEqual([]);
  });

  it('sem ledger (primeira compra): cria um com 0 de gift e credita o pacote', async () => {
    const calls = makeCalls();
    const repo = fakeLedgerRepo(calls); // vazio
    const bus = fakeEventBus(calls);

    await new OnCreditsPurchased(repo, bus).handle({
      userId: 'u-9', credits: 200, paymentIntentId: 'pi-9', packId: 'EXPLORER',
    });

    const ledger = await repo.findByUserId('u-9');
    expect(ledger.computeBalance().available).toBe(200);
    expect(bus.published).toEqual([]); // sem GiftCreditsGranted: gift era 0
  });

  it('salva o agregado ANTES de publicar eventos', async () => {
    const calls = makeCalls();
    const repo = fakeLedgerRepo(calls, [exhaustedLedger()]);
    const bus = fakeEventBus(calls);

    await new OnCreditsPurchased(repo, bus).handle({
      userId: 'u-1', credits: 50, paymentIntentId: 'pi-1', packId: 'STARTER',
    });

    expect(calls).toEqual(['save', 'publish:BalanceRestored']);
  });
});

describe('OnCreditsPurchased (idempotência)', () => {
  it('evento CreditsPurchased reentregue não credita o mesmo pagamento duas vezes', async () => {
    const calls = makeCalls();
    const repo = fakeLedgerRepo(calls, [ledgerWithCredits(5)]);
    const handler = new OnCreditsPurchased(repo, fakeEventBus(calls));
    const event = { userId: 'u-1', credits: 50, paymentIntentId: 'pi-1', packId: 'STARTER' };

    await handler.handle(event);
    await handler.handle(event);

    expect((await repo.findByUserId('u-1')).computeBalance().available).toBe(55);
  });
});

// ─────────────────────────────────────────────
describe('OnPriceSnapshotCaptured', () => {
  const snapshotEvent = { userId: 'u-1', watchRequestId: 'w-1', snapshotId: 's-1' };

  it('debita 1 crédito e publica SearchCreditDebited', async () => {
    const calls = makeCalls();
    const repo = fakeLedgerRepo(calls, [ledgerWithCredits(10)]);
    const bus = fakeEventBus(calls);

    await new OnPriceSnapshotCaptured(repo, bus).handle(snapshotEvent);

    expect((await repo.findByUserId('u-1')).computeBalance().available).toBe(9);
    expect(bus.types()).toEqual(['SearchCreditDebited']);
    expect(bus.published[0]).toMatchObject({
      userId: 'u-1', watchRequestId: 'w-1', snapshotId: 's-1', creditsRemaining: 9,
    });
  });

  it('último crédito: publica SearchCreditDebited e BalanceExhausted (Scheduler pausa os watches)', async () => {
    const calls = makeCalls();
    const repo = fakeLedgerRepo(calls, [ledgerWithCredits(1)]);
    const bus = fakeEventBus(calls);

    await new OnPriceSnapshotCaptured(repo, bus).handle(snapshotEvent);

    expect((await repo.findByUserId('u-1')).status).toBe(LedgerStatus.SUSPENDED);
    expect(bus.types()).toEqual(['SearchCreditDebited', 'BalanceExhausted']);
  });

  it('ledger já esgotado: não debita e não publica nada', async () => {
    const calls = makeCalls();
    const repo = fakeLedgerRepo(calls, [exhaustedLedger()]);
    const bus = fakeEventBus(calls);

    await new OnPriceSnapshotCaptured(repo, bus).handle(snapshotEvent);

    expect((await repo.findByUserId('u-1')).computeBalance().available).toBe(0);
    expect(bus.published).toEqual([]);
  });

  describe('usuário sem ledger', () => {
    let warn;
    beforeEach(() => { warn = jest.spyOn(console, 'warn').mockImplementation(() => {}); });
    afterEach(() => { warn.mockRestore(); });

    it('avisa no log, não salva e não publica (não quebra o consumidor)', async () => {
      const calls = makeCalls();
      const bus = fakeEventBus(calls);

      await expect(
        new OnPriceSnapshotCaptured(fakeLedgerRepo(calls), bus).handle(snapshotEvent),
      ).resolves.toBeUndefined();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('no ledger for user u-1'));
      expect(calls).toEqual([]);
    });
  });

  it('salva o agregado ANTES de publicar eventos', async () => {
    const calls = makeCalls();
    const repo = fakeLedgerRepo(calls, [ledgerWithCredits(1)]);
    const bus = fakeEventBus(calls);

    await new OnPriceSnapshotCaptured(repo, bus).handle(snapshotEvent);

    expect(calls).toEqual(['save', 'publish:SearchCreditDebited', 'publish:BalanceExhausted']);
  });

  // DECISÃO DE DOMÍNIO: com ledger esgotado o handler salva e termina em
  // silêncio, apesar de debitForSearch retornar false. Uma busca já executada
  // sem crédito = receita perdida. Deveria publicar um evento (ex.: SearchRanWithoutCredit)?
  it.todo('ledger esgotado: sinaliza a busca não cobrada (evento ou métrica)');
});

// ─────────────────────────────────────────────
describe('OnCreditsRefunded', () => {
  const refundEvent = { userId: 'u-1', credits: 50, paymentIntentId: 'pi-1' };

  it('remove os créditos estornados do saldo', async () => {
    const calls = makeCalls();
    const repo = fakeLedgerRepo(calls, [ledgerWithCredits(80)]);
    const bus = fakeEventBus(calls);

    await new OnCreditsRefunded(repo, bus).handle(refundEvent);

    expect((await repo.findByUserId('u-1')).computeBalance().available).toBe(30);
    expect(bus.published).toEqual([]);
    expect(calls).toEqual(['save']);
  });

  it('estorno que zera o saldo suspende o ledger e publica BalanceExhausted', async () => {
    const calls = makeCalls();
    const repo = fakeLedgerRepo(calls, [ledgerWithCredits(50)]);
    const bus = fakeEventBus(calls);

    await new OnCreditsRefunded(repo, bus).handle(refundEvent);

    expect((await repo.findByUserId('u-1')).status).toBe(LedgerStatus.SUSPENDED);
    expect(bus.types()).toEqual(['BalanceExhausted']);
    expect(calls).toEqual(['save', 'publish:BalanceExhausted']);
  });

  it('usuário sem ledger: ignora em silêncio (sem save, sem eventos)', async () => {
    const calls = makeCalls();
    const bus = fakeEventBus(calls);

    await new OnCreditsRefunded(fakeLedgerRepo(calls), bus).handle(refundEvent);

    expect(calls).toEqual([]);
    expect(bus.published).toEqual([]);
  });

  // DECISÃO DE DOMÍNIO: ao contrário de OnPriceSnapshotCaptured, aqui nem
  // log existe. Um estorno sem ledger é inconsistência de dados; deveria
  // pelo menos avisar (e/ou ir para dead-letter).
  it.todo('estorno sem ledger gera aviso/log para investigação');
});

describe('OnCreditsRefunded (idempotência)', () => {
  it('evento CreditsRefunded reentregue não estorna duas vezes', async () => {
    const calls = makeCalls();
    const repo = fakeLedgerRepo(calls, [ledgerWithCredits(80)]);
    const handler = new OnCreditsRefunded(repo, fakeEventBus(calls));
    const event = { userId: 'u-1', credits: 50, paymentIntentId: 'pi-1' };

    await handler.handle(event);
    await handler.handle(event);

    expect((await repo.findByUserId('u-1')).computeBalance().available).toBe(30);
  });
});
