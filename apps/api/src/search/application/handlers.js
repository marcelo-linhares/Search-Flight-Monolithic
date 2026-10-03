'use strict';

const { SearchJob } = require('../domain/aggregates');
const { assertFlightPort } = require('./flight-port');

// Scheduler -> Search. Runs one search and publishes the outcome.
// Idempotent by jobId: a redelivered SearchJobTriggered changes nothing and
// never asks the provider (or the user's credits) twice.
class OnSearchJobTriggered {
  constructor(jobRepo, flightPort, eventBus, { clock = () => new Date() } = {}) {
    this.jobRepo    = jobRepo;
    this.flightPort = assertFlightPort(flightPort);
    this.eventBus   = eventBus;
    this.clock      = clock;
  }

  async handle(event) {
    if (await this.jobRepo.findByJobId(event.jobId)) return;

    const job = SearchJob.start({
      jobId:          event.jobId,
      watchRequestId: event.watchRequestId,
      userId:         event.userId,
      criteria: {
        origin:        event.origin,
        destination:   event.destination,
        departureDate: event.departureDate,
        returnDate:    event.returnDate,
      },
    }, this.clock());

    let offer;
    try {
      offer = await this.flightPort.findCheapestOffer({ ...job.criteria });
    } catch (err) {
      job.fail(err.message, this.clock());
    }

    if (job.status === 'PENDING') {
      if (!offer) {
        job.fail('no offers found for this search', this.clock());
      } else {
        try {
          job.complete(offer, this.clock());
        } catch (err) {
          job.fail(`invalid offer from provider: ${err.message}`, this.clock());
        }
      }
    }

    await this.jobRepo.save(job);
    for (const e of job.pullDomainEvents()) {
      await this.eventBus.publish(e);
    }
  }
}

module.exports = { OnSearchJobTriggered };
