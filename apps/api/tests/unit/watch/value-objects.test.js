'use strict';

const { ValidationError } = require('../../../src/shared/errors');
const { RouteVO, TravelDatesVO, SearchPolicyVO } = require('../../../src/watch/domain/value-objects');

const HOJE = new Date('2026-10-10T12:00:00.000Z');

describe('RouteVO', () => {
  it('normaliza origem e destino para maiúsculas', () => {
    expect(new RouteVO('gru', 'lis')).toMatchObject({ origin: 'GRU', destination: 'LIS' });
  });

  it.each([['GR', 'LIS'], ['GRU', 'LISB'], ['', 'LIS'], [null, 'LIS'], ['GRU', undefined], ['G1U', 'LIS']])(
    'rejeita código IATA inválido (%p -> %p)',
    (origin, destination) => {
      expect(() => new RouteVO(origin, destination)).toThrow(ValidationError);
    },
  );

  it('rejeita origem igual ao destino', () => {
    expect(() => new RouteVO('GRU', 'gru')).toThrow(/origin and destination must differ/);
  });

  it('é imutável', () => {
    expect(Object.isFrozen(new RouteVO('GRU', 'LIS'))).toBe(true);
  });
});

describe('TravelDatesVO', () => {
  it('aceita ida e volta futuras', () => {
    const dates = new TravelDatesVO('2026-12-01', '2026-12-15', HOJE);

    expect(dates).toMatchObject({ departureDate: '2026-12-01', returnDate: '2026-12-15' });
  });

  it('volta é opcional (somente ida)', () => {
    expect(new TravelDatesVO('2026-12-01', undefined, HOJE).returnDate).toBeNull();
  });

  it('aceita ida hoje', () => {
    expect(new TravelDatesVO('2026-10-10', null, HOJE).departureDate).toBe('2026-10-10');
  });

  it.each(['2026-13-01', '2026-02-30', '01/12/2026', 'amanhã', '', null, undefined])(
    'rejeita data de ida inválida (%p)',
    (departure) => {
      expect(() => new TravelDatesVO(departure, null, HOJE)).toThrow(ValidationError);
    },
  );

  it('rejeita ida no passado', () => {
    expect(() => new TravelDatesVO('2026-10-09', null, HOJE)).toThrow(/cannot be in the past/);
  });

  it('rejeita volta anterior à ida e volta com formato inválido', () => {
    expect(() => new TravelDatesVO('2026-12-10', '2026-12-09', HOJE)).toThrow(/return date cannot be before/);
    expect(() => new TravelDatesVO('2026-12-10', '10-12-2026', HOJE)).toThrow(ValidationError);
  });
});

describe('SearchPolicyVO', () => {
  it('usa padrão de buscar a cada 4h por 30 dias', () => {
    expect(new SearchPolicyVO()).toMatchObject({ intervalHours: 4, durationDays: 30 });
  });

  it('calcula a data de expiração a partir de um instante', () => {
    const policy = new SearchPolicyVO({ intervalHours: 2, durationDays: 10 });

    expect(policy.expiresAtFrom(HOJE)).toBe('2026-10-20T12:00:00.000Z');
  });

  it.each([0, -1, 1.5, 169, '4', NaN])('rejeita intervalo inválido (%p)', (intervalHours) => {
    expect(() => new SearchPolicyVO({ intervalHours })).toThrow(ValidationError);
  });

  it.each([0, -1, 2.5, 366, '30', Infinity])('rejeita duração inválida (%p)', (durationDays) => {
    expect(() => new SearchPolicyVO({ durationDays })).toThrow(ValidationError);
  });
});
