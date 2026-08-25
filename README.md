# Delivery Route Optimizer

An isolated Python prototype for comparing delivery-routing strategies before
the optimizer is connected to a mobile application.

## Project layout

- `src/delivery_router/` — routing domain models, scoring, strategies, and metrics
- `tests/` — unit and integration tests
- `examples/` — small runnable scenarios with synthetic data
- `docs/` — product and algorithm decisions
- `data/fixtures/` — anonymized or synthetic test inputs only

Phase 2 will be implemented without mobile-app dependencies. See
`docs/phase-2-routing.md` for its planned boundaries.
