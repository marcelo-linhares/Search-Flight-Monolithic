'use strict';

const { ValidationError } = require('../../../src/shared/errors');
const { MoneyVO, SearchCriteriaVO } = require('../../../src/search/domain/value-objects');

describe('MoneyVO (da Search, não compartilhado com Billing)', () => {
  it('normaliza moeda e arredonda a 2 casas', () => {
    expect(new MoneyVO(1234.567, 'brl')).toMatchObject({ amount: 1234.57, currency: 'BRL' });
  });

  it.each([0, -5, NaN, Infinity, '10', null, undefined])('rejeita valor inválido (%p)', (amount) => {
    expect(() => new MoneyVO(amount, 'BRL')).toThrow(ValidationError);
  });

  it.each(['BR', 'BRLL', '', null, 123])('rejeita moeda inválida (%p)', (currency) => {
    expect(() => new MoneyVO(10, currency)).toThrow(/3-char ISO code/);
  });

  it('é imutável e compara por valor', () => {
    const a = new MoneyVO(10, 'BRL');

    expect(Object.isFrozen(a)).toBe(true);
    expect(a.equals(new MoneyVO(10, 'brl'))).toBe(true);
    expect(a.equals(new MoneyVO(11, 'BRL'))).toBe(false);
    expect(a.equals({ amount: 10, currency: 'BRL' })).toBe(false);
  });

  it('isLessThan compara valores na mesma moeda e recusa moedas diferentes', () => {
    expect(new MoneyVO(10, 'BRL').isLessThan(new MoneyVO(11, 'BRL'))).toBe(true);
    expect(() => new MoneyVO(10, 'BRL').isLessThan(new MoneyVO(1, 'USD'))).toThrow(/different currencies/);
  });
});

describe('SearchCriteriaVO', () => {
  it('guarda rota e datas do evento e volta é opcional', () => {
    expect(new SearchCriteriaVO({ origin: 'GRU', destination: 'LIS', departureDate: '2026-12-20' }))
      .toMatchObject({ origin: 'GRU', destination: 'LIS', departureDate: '2026-12-20', returnDate: null });
  });

  it('exige origem, destino e data de ida', () => {
    expect(() => new SearchCriteriaVO({ destination: 'LIS', departureDate: '2026-12-20' })).toThrow(ValidationError);
    expect(() => new SearchCriteriaVO({ origin: 'GRU', departureDate: '2026-12-20' })).toThrow(ValidationError);
    expect(() => new SearchCriteriaVO({ origin: 'GRU', destination: 'LIS' })).toThrow(ValidationError);
  });
});
