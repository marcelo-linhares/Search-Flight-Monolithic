'use strict';

/**
 * Testes unitários dos Value Objects de Billing.
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
  PackDefinitionVO,
  PaymentAmountVO,
  GatewayResultVO,
} = require('../../../src/billing/domain/value-objects');

// 'use strict' no topo faz a escrita em objeto congelado lançar TypeError,
// então "é imutável" vira um assert direto.
const tentarMutar = (obj, campo, valor) => () => { obj[campo] = valor; };

// ─────────────────────────────────────────────
describe('PackDefinitionVO', () => {
  it('catálogo expõe exatamente STARTER, EXPLORER e PROFESSIONAL', () => {
    expect(Object.keys(PackDefinitionVO.PACKS)).toEqual(['STARTER', 'EXPLORER', 'PROFESSIONAL']);
  });

  it.each([
    ['STARTER',       50,  9.90],
    ['EXPLORER',     200, 29.90],
    ['PROFESSIONAL', 600, 69.90],
  ])('fromId(%s) devolve %i créditos por BRL %d', (id, credits, price) => {
    const pack = PackDefinitionVO.fromId(id);

    expect(pack).toMatchObject({ id, credits, price, currency: 'BRL' });
  });

  it('fromId com id desconhecido lança erro citando o id', () => {
    expect(() => PackDefinitionVO.fromId('GOLD')).toThrow(/unknown pack id "GOLD"/);
  });

  it('pricePerCredit arredonda para 4 casas decimais', () => {
    expect(PackDefinitionVO.fromId('STARTER').pricePerCredit()).toBe(0.198);   // 9.90 / 50
    expect(PackDefinitionVO.fromId('EXPLORER').pricePerCredit()).toBe(0.1495); // 29.90 / 200
  });

  it('pacotes maiores têm preço por crédito menor (regra comercial)', () => {
    const { STARTER, EXPLORER, PROFESSIONAL } = PackDefinitionVO.PACKS;

    expect(EXPLORER.pricePerCredit()).toBeLessThan(STARTER.pricePerCredit());
    expect(PROFESSIONAL.pricePerCredit()).toBeLessThan(EXPLORER.pricePerCredit());
  });

  it('é imutável: pacote e catálogo não aceitam alteração', () => {
    const pack = PackDefinitionVO.fromId('STARTER');

    expect(tentarMutar(pack, 'credits', 9999)).toThrow(TypeError);
    expect(tentarMutar(PackDefinitionVO.PACKS, 'GOLD', pack)).toThrow(TypeError);
  });

  it('toString descreve o pacote de forma legível', () => {
    expect(PackDefinitionVO.fromId('STARTER').toString())
      .toBe('STARTER (50 credits @ BRL 9.9)');
  });
});

// ─────────────────────────────────────────────
describe('PaymentAmountVO', () => {
  it('normaliza moeda para maiúsculas', () => {
    expect(new PaymentAmountVO(10, 'brl').currency).toBe('BRL');
  });

  it('arredonda o valor para 2 casas decimais', () => {
    expect(new PaymentAmountVO(9.999, 'BRL').amount).toBe(10);
    expect(new PaymentAmountVO(1.234, 'BRL').amount).toBe(1.23);
  });

  it.each([0, -1, -0.01])('rejeita valor não positivo (%d)', (amount) => {
    expect(() => new PaymentAmountVO(amount, 'BRL')).toThrow(/amount must be a finite positive number/);
  });

  it.each(['10', null, undefined])('rejeita valor que não é número (%p)', (amount) => {
    expect(() => new PaymentAmountVO(amount, 'BRL')).toThrow(/amount must be a finite positive number/);
  });

  it.each(['BR', 'BRLL', '', null, undefined, 123])('rejeita moeda inválida (%p)', (currency) => {
    expect(() => new PaymentAmountVO(10, currency)).toThrow(/3-char ISO code/);
  });

  it('igualdade é por valor (mesmo valor e moeda), não por referência', () => {
    const a = new PaymentAmountVO(29.9, 'BRL');
    const b = new PaymentAmountVO(29.9, 'brl'); // normalizada para BRL

    expect(a).not.toBe(b);
    expect(a.equals(b)).toBe(true);
  });

  it('diferente em valor, moeda ou tipo não é igual', () => {
    const base = new PaymentAmountVO(10, 'BRL');

    expect(base.equals(new PaymentAmountVO(11, 'BRL'))).toBe(false);
    expect(base.equals(new PaymentAmountVO(10, 'USD'))).toBe(false);
    expect(base.equals({ amount: 10, currency: 'BRL' })).toBe(false);
    expect(base.equals(null)).toBe(false);
  });

  it('é imutável', () => {
    expect(tentarMutar(new PaymentAmountVO(10, 'BRL'), 'amount', 1)).toThrow(TypeError);
  });

  it('toString formata moeda e 2 casas decimais', () => {
    expect(new PaymentAmountVO(9.9, 'brl').toString()).toBe('BRL 9.90');
  });

  // DECISÃO DE DOMÍNIO (resolvida): valor monetário precisa ser um número FINITO.
  // Antes, `typeof NaN === 'number'` e `NaN <= 0` é false, então NaN e Infinity
  // passavam na validação e gerariam uma cobrança inválida.
  it.each([NaN, Infinity, -Infinity])('rejeita valor não finito (%p)', (amount) => {
    expect(() => new PaymentAmountVO(amount, 'BRL')).toThrow(/amount must be a finite positive number/);
  });
});

// ─────────────────────────────────────────────
describe('GatewayResultVO', () => {
  it('exige gatewayTransactionId', () => {
    expect(() => new GatewayResultVO({ status: 'succeeded' }))
      .toThrow(/gatewayTransactionId required/);
  });

  it('rawResponse é null por padrão', () => {
    const result = new GatewayResultVO({ gatewayTransactionId: 'tx-1', status: 'pending' });

    expect(result.rawResponse).toBeNull();
  });

  it.each([
    ['succeeded', { isSucceeded: true,  isFailed: false, isPending: false }],
    ['failed',    { isSucceeded: false, isFailed: true,  isPending: false }],
    ['pending',   { isSucceeded: false, isFailed: false, isPending: true  }],
  ])('status "%s" aciona somente o predicado correspondente', (status, esperado) => {
    const result = new GatewayResultVO({ gatewayTransactionId: 'tx-1', status });

    expect({
      isSucceeded: result.isSucceeded(),
      isFailed:    result.isFailed(),
      isPending:   result.isPending(),
    }).toEqual(esperado);
  });

  it('é imutável', () => {
    const result = new GatewayResultVO({ gatewayTransactionId: 'tx-1', status: 'pending' });

    expect(tentarMutar(result, 'status', 'succeeded')).toThrow(TypeError);
  });

  // DECISÃO (out/2026): status fora de succeeded|failed|pending é rejeitado,
  // para um status inesperado do gateway aparecer na hora em vez de ser ignorado.
  it.each(['paid', 'SUCCEEDED', '', null, undefined])('rejeita status desconhecido (%p)', (status) => {
    expect(() => new GatewayResultVO({ gatewayTransactionId: 'tx-1', status }))
      .toThrow(/status must be one of succeeded, failed, pending/);
  });
});
