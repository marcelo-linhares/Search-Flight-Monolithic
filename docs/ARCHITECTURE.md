# SmartFlight — Project Structure

This project is organized following **Domain-Driven Design (DDD)** principles in a **monolithic** style with clear **bounded contexts**.

## Directory Structure

```
src/
├── shared/                    # Cross-cutting concerns & infrastructure
│   ├── domain/
│   │   ├── DomainEvent.js
│   │   ├── AggregateRoot.js
│   │   ├── ValueObject.js
│   │   ├── Entity.js
│   │   └── errors/
│   │       └── DomainError.js
│   ├── infrastructure/
│   │   ├── eventBus/
│   │   │   ├── EventBus.js
│   │   │   └── InProcessEventBus.js
│   │   └── repository/
│   │       └── Repository.js
│   └── index.js
│
├── contexts/                  # Bounded contexts (isolated domains)
│   ├── BillingLedger/
│   │   ├── domain/
│   │   │   ├── aggregates/           # Root aggregates
│   │   │   │   ├── PaymentIntent.js
│   │   │   │   ├── CreditPack.js
│   │   │   │   ├── CreditLedger.js
│   │   │   │   └── index.js
│   │   │   ├── valueObjects/         # Immutable value objects
│   │   │   │   ├── PackDefinitionVO.js
│   │   │   │   ├── PaymentAmountVO.js
│   │   │   │   ├── GatewayResultVO.js
│   │   │   │   ├── EntryTypeVO.js
│   │   │   │   ├── CreditBalanceVO.js
│   │   │   │   └── index.js
│   │   │   ├── events/               # Domain events
│   │   │   │   └── index.js
│   │   │   ├── services/             # Domain services (stateless)
│   │   │   └── specs/                # Domain validation rules
│   │   ├── application/
│   │   │   ├── useCases/             # Application orchestration
│   │   │   │   ├── ConfirmPaymentUseCase.js
│   │   │   │   └── index.js
│   │   │   ├── eventHandlers/        # Event subscribers
│   │   │   │   └── index.js
│   │   │   └── dto/                  # Data transfer objects
│   │   ├── infrastructure/
│   │   │   ├── persistence/          # Repository implementations
│   │   │   │   ├── PaymentIntentRepository.js
│   │   │   │   ├── CreditBalanceRepository.js
│   │   │   │   └── adapters/
│   │   │   ├── gateways/             # External service adapters
│   │   │   └── eventSubscribers/
│   │   ├── presentation/             # Controllers/API handlers
│   │   │   └── controllers/
│   │   └── index.js                  # Public API
│   │
│   └── SearchOrchestrator/
│       ├── domain/
│       │   ├── aggregates/
│       │   │   ├── PriceSnapshot.js
│       │   │   ├── WatchRequest.js
│       │   │   └── index.js
│       │   ├── valueObjects/
│       │   │   ├── MoneyVO.js
│       │   │   ├── RouteVO.js
│       │   │   ├── SearchPolicy.js
│       │   │   ├── ThresholdVO.js
│       │   │   ├── CabinClassVO.js
│       │   │   ├── ItineraryVO.js
│       │   │   └── index.js
│       │   ├── events/
│       │   │   └── index.js
│       │   └── services/
│       │       └── SearchOrchestrator.js
│       ├── application/
│       │   ├── useCases/
│       │   │   ├── ExecuteSearchUseCase.js
│       │   │   ├── CreateWatchRequestUseCase.js
│       │   │   └── index.js
│       │   └── eventHandlers/
│       │       └── index.js
│       ├── infrastructure/
│       │   ├── persistence/
│       │   ├── externalServices/
│       │   └── eventSubscribers/
│       └── index.js
│
└── index.js                  # Application entry point

examples/                     # Example usage
├── billing-example.js
└── search-example.js
```

## Architecture Layers

### 1. **Domain Layer** (`domain/`)
- **Pure business logic** with no external dependencies
- **Aggregates**: Root entities managing state and events
- **Value Objects**: Immutable, comparison-focused objects
- **Events**: Domain events raised during behavior
- **Services**: Stateless operations coordinating aggregates
- **Specs**: Domain validation rules

### 2. **Application Layer** (`application/`)
- **Use Cases**: Orchestrate domain objects, load/save aggregates
- **Event Handlers**: React to domain events
- **DTOs**: Data transfer between layers
- **No business logic** — only coordination

### 3. **Infrastructure Layer** (`infrastructure/`)
- **Persistence**: Repository implementations
- **Adapters**: External service integration (payment gateways, APIs)
- **Event Subscribers**: Listen and delegate to use cases
- **All technical concerns**

### 4. **Presentation Layer** (`presentation/`)
- **Controllers**: HTTP/API handlers
- **Thin layer** — delegates to application use cases

## Key Concepts

### Bounded Contexts
Each context (`BillingLedger`, `SearchOrchestrator`) is **isolated**:
- Own domain models
- Own database/persistence
- Own event streams
- **No shared aggregates** between contexts — only event communication

### Domain Events
- Immutable, frozen objects
- Published to the event bus
- Represent facts about what happened
- Enable loose coupling between contexts

### Event Bus
- **In-Process** (`InProcessEventBus`) for MVP
- Easily replaceable with Kafka/RabbitMQ
- Subscribers wired to event handlers

### Public API
Each context exports a clean **public API** via `index.js`:
- Only what's needed externally
- Hides internal implementation
- Enables refactoring without breaking contracts

## Imports & Dependencies

### ✅ Within a Bounded Context
```javascript
// ✅ OK: Same context
const { CreditLedger } = require('../aggregates');
const Events = require('../events');
```

### ✅ Between Bounded Contexts
```javascript
// ✅ OK: Via public API (events only)
const BillingLedger = require('../../contexts/BillingLedger');
const events = BillingLedger.events;
```

### ❌ Forbidden
```javascript
// ❌ DO NOT: Direct imports across contexts
const PaymentIntent = require('../../../SearchOrchestrator/domain/aggregates/PaymentIntent');

// ❌ DO NOT: Aggregates crossing context boundaries
// Use events instead
```

## Running Examples

```bash
# Billing ledger example
node examples/billing-example.js

# Search orchestrator example
node examples/search-example.js
```

## Extending the Project

### Adding a New Bounded Context
1. Create `src/contexts/NewContext/`
2. Follow the same layered structure
3. Export public API from `index.js`
4. Listen to other contexts' events via the event bus

### Adding a New Aggregate
1. Create `src/contexts/YourContext/domain/aggregates/YourAggregate.js`
2. Extend `AggregateRoot` for root aggregates
3. Define value objects it needs
4. Emit domain events in behavior methods
5. Export via `domain/aggregates/index.js`

### Adding a Repository
1. Create `src/contexts/YourContext/infrastructure/persistence/YourRepository.js`
2. Extend `Repository`
3. Implement abstract methods
4. Use in application layer

## Dependencies
- **Node.js**: No external dependencies for domain/application layers
- **Infrastructure layer**: Adapt as needed (MongoDB, Express, etc.)

---

**Last Updated**: May 2026  
**DDD Principles**: Aggregates, Value Objects, Domain Events, Bounded Contexts, Repositories
