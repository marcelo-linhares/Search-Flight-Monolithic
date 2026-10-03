'use strict';

const { FakeFlightProvider } = require('../../../src/integration/fake-flight-provider');

const rota = { origin: 'GRU', destination: 'LIS', departureDate: '2026-12-20', returnDate: null };

describe('FakeFlightProvider (adaptador do FlightPort para desenvolvimento e testes)', () => {
  it('devolve a oferta mais barata no formato do domínio da Search', async () => {
    const offer = await new FakeFlightProvider().findCheapestOffer(rota);

    expect(offer).toEqual({ price: { amount: expect.any(Number), currency: 'BRL' }, provider: 'fake-air' });
    expect(offer.price.amount).toBeGreaterThan(0);
    expect(Number.isFinite(offer.price.amount)).toBe(true);
  });

  it('é determinístico: mesma semente e mesma sequência de chamadas dão os mesmos preços', async () => {
    const a = new FakeFlightProvider({ seed: 7 });
    const b = new FakeFlightProvider({ seed: 7 });

    const seqA = [await a.findCheapestOffer(rota), await a.findCheapestOffer(rota)].map((o) => o.price.amount);
    const seqB = [await b.findCheapestOffer(rota), await b.findCheapestOffer(rota)].map((o) => o.price.amount);

    expect(seqA).toEqual(seqB);
  });

  it('o preço varia entre buscas da mesma rota (para existir histórico) dentro de uma faixa de ±15% da base', async () => {
    const provider = new FakeFlightProvider({ seed: 1 });
    const prices = [];
    for (let i = 0; i < 10; i += 1) prices.push((await provider.findCheapestOffer(rota)).price.amount);

    expect(new Set(prices).size).toBeGreaterThan(1);
    expect(Math.max(...prices) / Math.min(...prices)).toBeLessThan(1.4);
  });

  it('rotas diferentes têm preços-base diferentes', async () => {
    const provider = new FakeFlightProvider({ seed: 1 });

    const a = (await provider.findCheapestOffer(rota)).price.amount;
    const b = (await provider.findCheapestOffer({ ...rota, destination: 'NRT' })).price.amount;

    expect(Math.abs(a - b)).toBeGreaterThan(1);
  });

  it('failNext faz as próximas N buscas lançarem erro e depois volta ao normal', async () => {
    const provider = new FakeFlightProvider();
    provider.failNext(2, 'provider down');

    await expect(provider.findCheapestOffer(rota)).rejects.toThrow('provider down');
    await expect(provider.findCheapestOffer(rota)).rejects.toThrow('provider down');
    await expect(provider.findCheapestOffer(rota)).resolves.toMatchObject({ provider: 'fake-air' });
  });

  it('noOffersFor devolve null para a rota configurada (sem voos)', async () => {
    const provider = new FakeFlightProvider();
    provider.noOffersFor('GRU', 'LIS');

    expect(await provider.findCheapestOffer(rota)).toBeNull();
    expect(await provider.findCheapestOffer({ ...rota, destination: 'MAD' })).not.toBeNull();
  });

  it('guarda as chamadas recebidas (útil para verificar o que a Search pediu)', async () => {
    const provider = new FakeFlightProvider();

    await provider.findCheapestOffer(rota);

    expect(provider.calls).toEqual([rota]);
  });
});
