'use strict';

/**
 * Testes unitários dos Value Objects de Ledger.
 *
 * Padrão (o mesmo de credit-ledger.test.js):
 *  - VO não tem identidade nem estado mutável: testamos (1) invariantes na
 *    construção, (2) imutabilidade, (3) igualdade por valor e (4) comportamento
 *    puro (entrada -> saída). Sem mocks, sem setup pesado.
 *  - Um `describe` por VO; nome do teste = regra de negócio.
 *  - Erros: assert na mensagem (regex curta), não só "throws", para o teste
 *    falhar se a regra errada disparar.
 *  - `it.todo` = backlog de TDD (red -> green -> refactor).
 */

const {
  EntryTypeVO,
  CreditBalanceVO,
} = require('../../../src/ledger/domain/value-objects');

// 'use strict' no topo faz a escrita em objeto congelado lançar TypeError,
// então "é imutável" vira um assert direto.
const tentarMutar = (obj, campo, valor) => () => { obj[campo] = valor; };

// ─────────────────────────────────────────────
describe('EntryTypeVO', () => {
  it.each(['CREDIT_PURCHASE', 'CREDIT_GIFT', 'SEARCH_DEBIT', 'REFUND', 'ADJUSTMENT'])(
    'aceita o tipo válido %s',
    (type) => {
      expect(new EntryTypeVO(type).value).toBe(type);
    },
  );

  it('rejeita tipo inválido listando os válidos na mensagem', () => {
    expect(() => new EntryTypeVO('BONUS')).toThrow(/invalid type "BONUS".*CREDIT_PURCHASE/);
  });

  // DECISÃO (out/2026): REFUND é débito. O estorno remove do usuário os créditos
  // que ele comprou, e o ledger já grava a entrada com valor negativo.
  it.each(['SEARCH_DEBIT', 'REFUND'])('%s é débito e não é crédito', (type) => {
    const entry = new EntryTypeVO(type);

    expect(entry.isDebit()).toBe(true);
    expect(entry.isCredit()).toBe(false);
  });

  it.each(['CREDIT_PURCHASE', 'CREDIT_GIFT', 'ADJUSTMENT'])(
    '%s é crédito e não é débito',
    (type) => {
      const entry = new EntryTypeVO(type);

      expect(entry.isCredit()).toBe(true);
      expect(entry.isDebit()).toBe(false);
    },
  );

  it('todo tipo válido é exatamente um de débito ou crédito', () => {
    const tipos = ['CREDIT_PURCHASE', 'CREDIT_GIFT', 'SEARCH_DEBIT', 'REFUND', 'ADJUSTMENT'];

    tipos.forEach((t) => {
      const e = new EntryTypeVO(t);
      expect(e.isDebit() !== e.isCredit()).toBe(true);
    });
  });

  it('toString devolve o valor e o VO é imutável', () => {
    const entry = new EntryTypeVO('REFUND');

    expect(entry.toString()).toBe('REFUND');
    expect(tentarMutar(entry, 'value', 'SEARCH_DEBIT')).toThrow(TypeError);
  });

});

// ─────────────────────────────────────────────
describe('CreditBalanceVO', () => {
  it('reserved é 0 por padrão e effective = available - reserved', () => {
    expect(new CreditBalanceVO(10).reserved).toBe(0);
    expect(new CreditBalanceVO(10, 3).effective()).toBe(7);
  });

  it('rejeita available negativo', () => {
    expect(() => new CreditBalanceVO(-1)).toThrow(/available cannot be negative/);
  });

  it('rejeita reserved negativo', () => {
    expect(() => new CreditBalanceVO(10, -1)).toThrow(/reserved cannot be negative/);
  });

  it('isExhausted é true quando o saldo efetivo chega a 0', () => {
    expect(new CreditBalanceVO(0).isExhausted()).toBe(true);
    expect(new CreditBalanceVO(5, 5).isExhausted()).toBe(true);
  });

  it('isExhausted é false enquanto houver saldo efetivo', () => {
    expect(new CreditBalanceVO(1).isExhausted()).toBe(false);
    expect(new CreditBalanceVO(5, 4).isExhausted()).toBe(false);
  });

  it('debit devolve NOVO saldo e não altera o original', () => {
    const original = new CreditBalanceVO(10, 2);

    const depois = original.debit(3);

    expect(depois).not.toBe(original);
    expect(depois.available).toBe(7);
    expect(depois.reserved).toBe(2);
    expect(original.available).toBe(10);
  });

  it('debit de todo o saldo é permitido e esgota', () => {
    expect(new CreditBalanceVO(3).debit(3).isExhausted()).toBe(true);
  });

  it('debit maior que o disponível lança erro', () => {
    expect(() => new CreditBalanceVO(3).debit(4)).toThrow(/insufficient credits/);
  });

  // DECISÃO (out/2026): débito respeita o saldo EFETIVO (available - reserved).
  it('debit não pode gastar créditos reservados', () => {
    const saldo = new CreditBalanceVO(10, 8);

    expect(() => saldo.debit(3)).toThrow(/insufficient credits/);
    expect(saldo.debit(2).available).toBe(8);
  });

  it.each([0, -1, 1.5, NaN, Infinity, '2', null, undefined])(
    'debit e credit rejeitam quantidade que não é inteiro positivo (%p)',
    (amount) => {
      const saldo = new CreditBalanceVO(10);

      expect(() => saldo.debit(amount)).toThrow(/amount must be a positive integer/);
      expect(() => saldo.credit(amount)).toThrow(/amount must be a positive integer/);
    },
  );

  it('credit devolve NOVO saldo somado e preserva reserved', () => {
    const original = new CreditBalanceVO(10, 2);

    const depois = original.credit(5);

    expect(depois.available).toBe(15);
    expect(depois.reserved).toBe(2);
    expect(original.available).toBe(10);
  });

  it('é imutável', () => {
    expect(tentarMutar(new CreditBalanceVO(10), 'available', 99)).toThrow(TypeError);
  });
});
