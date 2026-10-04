'use strict';

// Public entry point of the Ledger context.
// Other code (composition root, controllers) imports ONLY this file.

const {
  OnUserRegistered,
  OnCreditsPurchased,
  OnPriceSnapshotCaptured,
  OnRefundRequested,
} = require('./application/handlers');
const { GetCreditBalance, GetLedgerHistory } = require('./application/queries');
const { InMemoryLedgerRepository } = require('./infrastructure/in-memory-ledger-repository');

// Events this context listens to (all come from other contexts).
//   UserRegistered        (Identity) -> open ledger with gift credits
//   CreditsPurchased      (Billing)  -> credit the balance
//   RefundRequested       (Billing)  -> take refunded credits back, answer RefundAccepted / RefundRejected
//   PriceSnapshotCaptured (Search)   -> debit one credit
function registerLedger({ eventBus, ledgerRepo = new InMemoryLedgerRepository(), giftCredits = 10 }) {
  const onUserRegistered        = new OnUserRegistered(ledgerRepo, eventBus, { giftCredits });
  const onCreditsPurchased      = new OnCreditsPurchased(ledgerRepo, eventBus);
  const onRefundRequested       = new OnRefundRequested(ledgerRepo, eventBus);
  const onPriceSnapshotCaptured = new OnPriceSnapshotCaptured(ledgerRepo, eventBus);

  eventBus.subscribe('UserRegistered',        (e) => onUserRegistered.handle(e));
  eventBus.subscribe('CreditsPurchased',      (e) => onCreditsPurchased.handle(e));
  eventBus.subscribe('RefundRequested',       (e) => onRefundRequested.handle(e));
  eventBus.subscribe('PriceSnapshotCaptured', (e) => onPriceSnapshotCaptured.handle(e));

  return {
    ledgerRepo,
    getCreditBalance: new GetCreditBalance(ledgerRepo),
    getLedgerHistory: new GetLedgerHistory(ledgerRepo),
  };
}

module.exports = { registerLedger };
