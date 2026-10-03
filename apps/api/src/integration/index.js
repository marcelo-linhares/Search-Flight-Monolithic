'use strict';

// Public entry point of the Integration context: adapters to external providers
// (flight data today; payment gateway adapters later). Contexts receive adapters
// by injection from the composition root and never import this folder directly.

const { FakeFlightProvider } = require('./fake-flight-provider');

module.exports = { FakeFlightProvider };
