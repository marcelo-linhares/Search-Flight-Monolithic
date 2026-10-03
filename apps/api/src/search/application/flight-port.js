'use strict';

// FlightPort: what the Search context needs from a flight data provider,
// written in Search's own terms (anti-corruption layer). Adapters live in
// src/integration and translate each provider's data model to this contract.
//
//   findCheapestOffer({ origin, destination, departureDate, returnDate })
//     -> Promise<{ price: { amount: number, currency: string }, provider: string } | null>
//
// It resolves to null when there are no flights, and rejects when the provider fails.

function assertFlightPort(port) {
  if (!port || typeof port.findCheapestOffer !== 'function') {
    throw new TypeError('FlightPort: an object with findCheapestOffer(criteria) is required');
  }
  return port;
}

module.exports = { assertFlightPort };
