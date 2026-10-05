'use strict';

// ─────────────────────────────────────────────
//  Ledger client: how OTHER processes read the Ledger once it runs as its own
//  service. It is the Ledger's published contract for the read side (balance and
//  history), with the same shape as the in-process queries, so callers such as the
//  HTTP layer do not change:
//
//    ledger.getCreditBalance.execute({ userId })
//    ledger.getLedgerHistory.execute({ userId })
//
//  Writes never go through here: other contexts change the Ledger only by
//  publishing events (carried by the RemoteEventBridge).
//  Differences a caller must accept once the Ledger is remote:
//   - a query can fail because the service is unreachable (ServiceUnavailableError, 503)
//   - reads are eventually consistent with the events sent a moment ago
// ─────────────────────────────────────────────

const { LedgerNotFoundError } = require('./application/queries');
const { ServiceUnavailableError } = require('../shared/errors');

function createRemoteLedgerClient({ url, token = '', fetchImpl = globalThis.fetch, timeoutMs = 2000 }) {
  async function get(path, userId) {
    let res;
    try {
      res = await fetchImpl(`${url}/internal/ledgers/${encodeURIComponent(userId)}/${path}`, {
        headers: { 'x-internal-token': token },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new ServiceUnavailableError(`Ledger service unreachable: ${err.message}`);
    }
    if (res.status === 404) throw new LedgerNotFoundError(userId);
    if (!res.ok) throw new ServiceUnavailableError(`Ledger service answered HTTP ${res.status}`);
    return res.json();
  }

  return {
    getCreditBalance: { execute: ({ userId }) => get('balance', userId) },
    getLedgerHistory: { execute: ({ userId }) => get('history', userId) },
  };
}

module.exports = { createRemoteLedgerClient };
